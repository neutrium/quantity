
import type { Lexer, Token, Rules } from 'moo';
import moo from 'moo';

import { UnitTokenManager } from '../UnitTokenManager.js';

// Moo supports clone() at runtime, but its upstream declarations omit it.
export interface CloneableLexer extends Lexer
{
	clone(): CloneableLexer;
}

export class MooQtyLexer
{
	private _lexer: CloneableLexer;

	constructor()
	{
		const rules: Rules = {
			"ws": { match: /\s+/, lineBreaks: true },
			// Numbers precede '.' multiplication so leading-point scalars such as .5 work.
			// Keep integers separate: unit exponents must not accept floats/scientific notation.
			"signedFloat" : { match: /(?:[-+]\s*)?(?:[0-9]*\.[0-9]+(?:[eE][-+]?[0-9]+)?|[0-9]+[eE][-+]?[0-9]+)/,
				lineBreaks: true, value: text => text.replace(/\s/g, '') },
			"integer": { match: /(?:[-+]\s*)?[0-9]+/, lineBreaks: true, value: text => text.replace(/\s/g, '') },
			"pwr": ["^", "**"],
			"superscript": { match: /[⁺⁻]?[⁰¹²³⁴⁵⁶⁷⁸⁹]+/, value: text =>
				Array.from(text, char => '0123456789+-'['⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻'.indexOf(char)]).join('') },
			"mul": ["*", "×"],
			"dot": [".", "·", "⋅"],
			"div": "/",
			"lParen": '(',
			"rParen": ')'
		}

		const tm = UnitTokenManager.instance;

		const alternatives = (map: Record<string, string>) => Object.keys(map)
			.sort((a, b) => b.length - a.length)
			.map(alias => alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
		const units = alternatives(tm.getMap('unit'));
		const prefixes = alternatives(tm.getMap('prefix'));
		// Match a complete unit spelling, not a greedy fragment such as min in minch.
		// Exact aliases win; otherwise the regex can backtrack to a valid prefix/unit pair.
		// A suffix must be an operator, closing group, or complete compact power.
		// '(' and '-' can belong to aliases such as y(j) and gram-force.
		const boundary = '(?=$|[\\s^*/.)·⋅×⁺⁻⁰¹²³⁴⁵⁶⁷⁸⁹]|[+-]?\\d+(?=$|[\\s^*/.)·⋅×]))';
		rules["unit"] = new RegExp(`(?:${units}|(?:${prefixes})(?:${units}))${boundary}`);
		rules["sign"] = ['+', '-'];
		// Give lexer failures a token and source offset for structured diagnostics.
		rules["invalid"] = { match: /[^\s*/^.()·⋅×]+|[\s\S]/, error: true };

		this._lexer = moo.compile(rules) as CloneableLexer;
	}

	get lexer()
	{
		return this._lexer;
	}

	//
	// Converts a string representing a quantity with units into an array
	// of tokens
	//
	// @param {string} val - The string to tokenize
	//
	// @returns {Token[]} An array of tokens from the string
	//
	// @throws {QtyError} if target units are incompatible???
	//
	// @example
	// const lex = new MooUnitTokenizer();
	// lex.tokenize("meter"); // Output:
	//
	public tokenize(val: string) : Token[]
	{
		this.lexer.reset(val);

		return Array.from(this.lexer)
	}

	public next() : Token | undefined
	{
		return this.lexer.next();
	}
}

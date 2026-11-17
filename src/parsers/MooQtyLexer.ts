import type { Lexer, Rules } from 'moo';
import moo from 'moo';

import { UnitTokenManager } from '../UnitTokenManager.js';

// Moo supports clone() at runtime, but its upstream declarations omit it.
export interface CloneableLexer extends Lexer
{
	clone(): CloneableLexer;
}

function createLexer(): CloneableLexer
{
	const rules: Rules = {
		"ws": { match: /\s+/, lineBreaks: true },
		// Numbers precede '.' multiplication so leading-point scalars such as .5 work.
		// Keep integers separate for compact powers and explicit rational exponents.
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

	const units = tm.aliasPattern('unit');
	const prefixes = tm.aliasPattern('prefix');
	// Match a complete unit spelling, not a greedy fragment such as min in minch.
	// Exact aliases win; otherwise the regex can backtrack to a valid prefix/unit pair.
	// A suffix must be an operator, closing group, or complete compact power.
	// '(' and '-' can belong to aliases such as y(j) and gram-force.
	const endOfUnit = '(?=$|[\\s^*/.)·⋅×⁺⁻⁰¹²³⁴⁵⁶⁷⁸⁹])';
	// Leave chained compact powers to the grammar. Otherwise m1-2 can
	// backtrack to milli-unity followed by a single power.
	const boundary = `(?=(?:[+-]?\\d+(?:[+-]\\d+)?)?${endOfUnit})`;
	rules["unit"] = new RegExp(`(?:${units}|(?:${prefixes})(?:${units}))${boundary}`);
	rules["sign"] = ['+', '-'];
	// Give lexer failures a token and source offset for structured diagnostics.
	rules["invalid"] = { match: /[^\s*/^.()·⋅×]+|[\s\S]/, error: true };
	return moo.compile(rules) as CloneableLexer;
}

/** Shared token rules. Each expression parser clones this lexer before reading input. */
export const lexerTemplate = createLexer();

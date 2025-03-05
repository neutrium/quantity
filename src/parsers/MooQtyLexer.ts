
import { Lexer, Token } from 'moo'
import moo from 'moo/moo.js'

import { UnitTokenManager } from '../UnitTokenManager.js';

export class MooQtyLexer
{
	private _lexer: Lexer

	constructor()
	{
		let rules = {
			"ws": " ",
			"pwr": "^",
			"mul": ["*", "."],
			"div": "/",
			"lParen": '(',
			"rParen": ')',
			"signedFloat" : /[-+]?[0-9]*\.[0-9]+(?:[eE][-+]?[0-9]+)?/,
			"integer": /[-+]?[0-9]+/
		}

		const tm = UnitTokenManager.instance;

		rules["unit"] = [
			...Object.keys(tm.getMap('prefix')),
			...Object.keys(tm.getMap('unit'))
		].sort((a, b) => b.length - a.length)

		this._lexer = moo.compile(rules)
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
import type { ExpressionSyntax } from '@neutrium/math/expressions/core';
import { UnitTokenManager } from '../UnitTokenManager.js';

/** Calculator literals retain the catalogue's aliases, including names with parentheses. */
export function quantitySyntax(): ExpressionSyntax
{
	const tm = UnitTokenManager.instance;
	const aliases = tm.aliasPattern('unit'), prefixes = tm.aliasPattern('prefix');
	const unit = new RegExp(`(?:${aliases}|(?:${prefixes})(?:${aliases}))(?=$|[\\s0-9+−\\-*/÷×%^.,()·⋅⁺⁻⁰¹²³⁴⁵⁶⁷⁸⁹])`, 'y');
	const number = /(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?/y;
	const signedNumber = /[+-]?\s*(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?/y;
	const division = /\s*\/\s*/y;
	const explicitPower = /\s*(?:\^|\*\*)\s*(?:\(\s*[+-]?\s*\d+\s*\/\s*[+-]?\s*\d+\s*\)|[+-]?\s*(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?)/y;
	const compactPower = /(?:\d+|[⁺⁻]?[⁰¹²³⁴⁵⁶⁷⁸⁹]+)/y;

	function match(pattern: RegExp, source: string, start: number): RegExpExecArray | null
	{
		pattern.lastIndex = start;
		return pattern.exec(source);
	}

	return Object.freeze({
		implicitMultiplication: true,
		multiplicationSymbols: Object.freeze(['.', '·', '⋅']),
		readLiteral(source: string, start: number, operandExpected: boolean) {

			if (!operandExpected && /^[+-]/.test(source[start]))
			{
				return undefined;
			}

			const scalar = match(operandExpected ? signedNumber : number, source, start);
			let position = scalar ? start + scalar[0].length : start;

			// Retain scalar fractions in the literal so the quantity parser applies its
			// existing spacing rules: 1/2 m is half a metre; 1/2m is inverse metres.
			if (scalar)
			{
				for (let separator = match(division, source, position); separator; separator = match(division, source, position))
				{
					const denominator = match(signedNumber, source, position + separator[0].length);

					if (!denominator)
					{
						break;
					}

					position += separator[0].length + denominator[0].length;
				}
			}

			if (scalar) while (/\s/.test(source[position] ?? '') && position < source.length)
			{
				position++;
			}

			const name = match(unit, source, position);

			if (!name || name[0] === '1' || name[0] === '<1>')
			{
				return undefined;
			}

			position += name[0].length;
			// Call syntax wins over bare aliases such as min; ton(l) is matched as one alias.
			if (!scalar && /^\s*\(/.test(source.slice(position)))
			{
				return undefined;
			}

			const power = match(compactPower, source, position) ?? (scalar ? match(explicitPower, source, position) : null);

			if (power)
			{
				position += power[0].length;
			}

			return { end: position, type: 'quantity' };
		},
	});
}

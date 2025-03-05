@preprocessor typescript

# Use the moo based lexer

@{%
import { Decimal } from '@neutrium/math';
import { MooQtyLexer } from './MooQtyLexer.js';
import { UnitTokenManager } from '../UnitTokenManager.js';

const lexer = new MooQtyLexer().lexer;
const tm = UnitTokenManager.instance

function mdUnits(v1, v2, divide = false)
{
	let n2 = divide ? v2.denominator : v2.numerator,
		d2 = divide ? v2.numerator : v2.denominator;

	return {
		numerator: [...v1.numerator, ...n2],
		denominator: [...v1.denominator, ...d2]
	}
}

function finaliseQty(scalar, numerator, denominator)
{
	return {
		scalar: scalar,
		numerator: cleanUnitArray(numerator),
		denominator: cleanUnitArray(denominator)
	};
}

function cleanUnitArray(array)
{
	while(array.length > 1)
	{
		const index  = array.indexOf('<1>');

		if(index !== -1)
		{
			array.splice(index, 1);
		}
		else
		{
			break;
		}
	}

	return array;
}

function unitsToPower(units, pwrStr)
{
	let numerator: string[] = units.numerator,
		denominator: string[] = units.denominator;
	const pwr = parseInt(pwrStr)

	if(pwr < 0)
	{
		numerator = units.denominator;
		denominator = units.numerator
	}

	const multiplier = Math.abs(pwr);

	return {
		numerator: (new Array(multiplier)).fill(numerator).flat(),
		denominator: (new Array(multiplier)).fill(denominator).flat()
	}
}

%}

# Pass your lexer object using the @lexer option:
@lexer lexer

main -> PWR %ws:* MD 					{% (data) => finaliseQty(data[0], data[2].numerator, data[2].denominator) %}
	 | MD								{% (data) => finaliseQty(new Decimal(1), data[0].numerator, data[0].denominator) %}
	 | PWR 								{% (data) => ({ scalar: data[0], numerator: ['<1>'], denominator: ['<1>'] }) %}

#
# Unit parsing logic
#
PAR -> %lParen MD %rParen				{% (data) => data[1] %}
	| UNIT								{% (data) => data[0] %}

# Multiplication and division of units e.g. kg.m/s
MD -> MD %ws:* %mul %ws:* UNIT_PWR		{% (data) => mdUnits(data[0], data[4]) %}
	| MD %ws UNIT_PWR 					{% (data) => mdUnits(data[0], data[2]) %}
	| MD %ws:* %div %ws:* UNIT_PWR 		{% (data) => mdUnits(data[0], data[4], true) %}
	| UNIT_PWR 							{% id %}

UNIT_PWR -> PAR %pwr %integer 			{% (data) => unitsToPower(data[0], data[2].text) %}
	| PAR %integer 						{% (data) => unitsToPower(data[0], data[1].text) %}
	| UNIT 								{% id %}

UNIT -> %unit %unit 					{% (data) => ({
											numerator: [tm.getPrefixToken(data[0].value), tm.getUnitToken(data[1].value)],
											denominator: ['<1>']
										})%}
	| %unit 							{% (data) => ({ numerator: [tm.getUnitToken(data[0].value)], denominator: ['<1>']}) %}

#
# Number parsing logic
#
PWR -> NUM %pwr NUM						{% (data) => data[0].pow(data[2]) %}
	| NUM 								{% id %}

NUM -> %signedFloat 					{% (data) => new Decimal(data[0].value) %}
	| %integer							{% (data) => new Decimal(data[0].value) %}
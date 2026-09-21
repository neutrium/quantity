import { Decimal } from '@neutrium/decimal';
import { typeguards } from "@neutrium/utilities";

import { Quantity } from '../Quantity.js'
import { QuantityInitParam } from '../guards.js';
import { isCompatible } from './comparison.js';
import { addTempDegrees, subtractTemperatures, subtractTempDegrees } from './temperature.js';
import { throwIncompatibleUnits } from './errors.js';
import { cleanUnitNames } from './clean-unit-names.js'
;
const UNITY = "<1>";

//********************* */ Moved
//
// Mathematical operations on quantities
//
export function add(a: Quantity, b_o: QuantityInitParam) : Quantity
{
	const b = new Quantity(b_o);

	if (!isCompatible(a, b))
	{
		throwIncompatibleUnits();
	}

	if (a.isTemperature() && b.isTemperature())
	{
		throw new Error("Cannot add two temperatures");
	}
	else if (a.isTemperature())
	{
		return addTempDegrees(a, b);
	}
	else if (b.isTemperature())
	{
		return addTempDegrees(b, a);
	}

	return new Quantity({
		scalar: a.scalar.add(b.to(a).scalar),
		numerator: a.numerator,
		denominator: a.denominator
	});
}

export function sub(a: Quantity, b_o: QuantityInitParam) : Quantity
{
	const b = new Quantity(b_o);

	if (!isCompatible(a,b))
	{
		throwIncompatibleUnits();
	}

	if (a.isTemperature() && b.isTemperature())
	{
		return subtractTemperatures(a, b);
	}
	else if (a.isTemperature())
	{
		return subtractTempDegrees(a, b);
	}
	else if (b.isTemperature())
	{
		throw new Error("Cannot subtract a temperature from a differential degree unit");
	}

	return new Quantity({
		scalar: a.scalar.sub(b.to(a).scalar),
		numerator: a.numerator,
		denominator: a.denominator
	});
}

export function mul(a: Quantity, b_o: QuantityInitParam) : Quantity
{
	if (typeguards.isNumber(b_o) || b_o instanceof Decimal)
	{
		return new Quantity({
			scalar: a.scalar.mul(b_o),
			numerator: a.numerator,
			denominator: a.denominator
		});
	}

	const b = new Quantity(b_o);

	if ((a.isTemperature() || b.isTemperature()) && !(a.isUnitless() || b.isUnitless()))
	{
		throw new Error("Cannot multiply by temperatures");
	}

	// Quantities should be multiplied with same units if compatible, with base units else
	let op1 = a,
		op2 = b;

	// so as not to confuse results, multiplication and division between temperature degrees will maintain original unit info in num/den
	// multiplication and division between deg[CFRK] can never factor each other out, only themselves: "degK*degC/degC^2" == "degK/degC"
	if (isCompatible(op1, op2) && op1.signature !== 400)
	{
		op2 = op2.to(op1);
	}

	let numden = cleanUnitNames(op1.numerator.concat(op2.numerator), op1.denominator.concat(op2.denominator));

	return new Quantity({
		scalar: op1.scalar.mul(op2.scalar),
		numerator: numden[0],
		denominator: numden[1]
	});
}

export function div(a: Quantity, b_o: QuantityInitParam) : Quantity
{
	if (typeguards.isNumber(b_o) || b_o instanceof Decimal)
	{
		return new Quantity({
			"scalar": a.scalar.div(b_o),
			"numerator": a.numerator,
			"denominator": a.denominator
		});
	}

	const b = new Quantity(b_o);

	if (b.isTemperature())
	{
		throw new Error("Cannot divide with temperatures");
	}
	else if (a.isTemperature() && !b.isUnitless())
	{
		throw new Error("Cannot divide with temperatures");
	}

	// Quantities should be multiplied with same units if compatible, with base units else
	let op1 = a,
		op2 = b;

	// so as not to confuse results, multiplication and division between temperature degrees will maintain original unit info in num/den
	// multiplication and division between deg[CFRK] can never factor each other out, only themselves: "degK*degC/degC^2" == "degK/degC"
	if (isCompatible(op1, op2) && op1.signature !== 400)
	{
		op2 = op2.to(op1);
	}

	let numden = cleanUnitNames(op1.numerator.concat(op2.denominator), op1.denominator.concat(op2.numerator));

	return new Quantity({
		scalar: op1.scalar.div(op2.scalar),
		numerator: numden[0],
		denominator: numden[1]
	});
}

export function pow(a: Quantity, yy: number | string | Decimal) : Quantity
{
	yy = new Decimal(yy);

	if (!yy.isInt())
	{
		throw Error("Raising quantities to a fractional power not currently supported");
	}

	let num = a.numerator,
		den = a.denominator;

	for (let i = 1, len = yy.abs().toNumber(); i < len; i++)
	{
		num = num.concat(a.numerator);
		den = den.concat(a.denominator);
	}

	// Invert units for negative powers
	if (yy.lt(0))
	{
		let temp = num;
		num = den;
		den = temp;
	}

	let numden = cleanUnitNames(num, den);

	return new Quantity({
		scalar: a.scalar.pow(yy),
		numerator: numden[0],
		denominator: numden[1]
	});
}

// Returns a Qty that is the inverse of Quantity a,
export function inverse(a: Quantity) : Quantity
{
	if (a.isTemperature())
	{
		throw new Error("Cannot divide with temperatures");
	}

	if (a.scalar.eq(0))
	{
		throw new Error("Divide by zero");
	}

	return new Quantity({
		scalar: new Decimal(1).div(a.scalar),
		numerator: a.denominator,
		denominator: a.numerator
	});
}

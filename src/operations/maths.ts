import { Decimal } from '@neutrium/decimal';
import { typeguards } from "@neutrium/utilities";

import type { Quantity } from '../QuantityCore.js'
import { isQuantity, type QuantityInitParam } from '../guards.js';
import { isCompatible } from './comparison.js';
import { addTempDegrees, subtractTemperatures, subtractTempDegrees, scaleTemperature } from './temperature.js';
import { throwIncompatibleUnits } from './errors.js';
import { cancelPowers, checkedExponent, scalePowers, UNITY } from './unit-powers.js';
import { sameUnits } from './unit-identity.js';
import { resolveProduct, resolveSum } from './unit-scale.js';
import { TEMPERATURE_SIGNATURE } from './unit-signatures.js';
import { calculateScalar } from './numeric-context.js';

// Exponents describe the operation, so quantity input/output limits must not clamp them.
const Exponent = Decimal.clone({ minE: -Decimal.limits.maxExponent, maxE: Decimal.limits.maxExponent });

//
// Mathematical operations on quantities
//
export function add(a: Quantity, b_o: QuantityInitParam) : Quantity
{
	const b = isQuantity(b_o) ? b_o : a.createQuantity(b_o);

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
		return addTempDegrees(b, a, a);
	}

	return a.createQuantity({
		scalar: sameUnits(a, b) ? calculateScalar(a.scalar, 'add', b.scalar, a.decimal) : resolveSum(a, b, a, false, a.decimal),
		numerator: a.numerator,
		denominator: a.denominator
	});
}

export function sub(a: Quantity, b_o: QuantityInitParam) : Quantity
{
	const b = isQuantity(b_o) ? b_o : a.createQuantity(b_o);

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

	return a.createQuantity({
		scalar: sameUnits(a, b) ? calculateScalar(a.scalar, 'sub', b.scalar, a.decimal) : resolveSum(a, b, a, true, a.decimal),
		numerator: a.numerator,
		denominator: a.denominator
	});
}

/** Scale a reading without aligning or rebuilding its unit records. */
function scaleQuantity(quantity: Quantity, factor: number | Decimal, divide: boolean, owner = quantity): Quantity
{
	if (quantity.isTemperature())
	{
		return scaleTemperature(quantity, factor, divide, owner);
	}

	return owner.createQuantity({
		scalar: calculateScalar(quantity.scalar, divide ? 'div' : 'mul', factor, owner.decimal),
		numerator: quantity.numerator,
		denominator: quantity.denominator
	});
}

export function mul(a: Quantity, b_o: QuantityInitParam) : Quantity
{
	if (typeguards.isNumber(b_o) || b_o instanceof Decimal)
	{
		return scaleQuantity(a, b_o, false);
	}

	const b = isQuantity(b_o) ? b_o : a.createQuantity(b_o);
	if (b.isUnitless())
	{
		return scaleQuantity(a, b.scalar, false);
	}

	if (a.isUnitless())
	{
		return scaleQuantity(b, a.scalar, false, a);
	}

	if (a.isTemperature() || b.isTemperature())
	{
		throw new Error("Cannot multiply by temperatures");
	}

	// Quantities should be multiplied with same units if compatible, with base units else
	let op1 = a,
		op2 = b;

	// so as not to confuse results, multiplication and division between temperature degrees will maintain original unit info in num/den
	// multiplication and division between deg[CFRK] can never factor each other out, only themselves: "degK*degC/degC^2" == "degK/degC"
	if (isCompatible(op1, op2) && op1.signature !== TEMPERATURE_SIGNATURE)
	{
		op2 = op1;
	}

	let numden = cancelPowers(op1.numerator.concat(op2.numerator), op1.denominator.concat(op2.denominator));

	return a.createQuantity({
		scalar: sameUnits(a, b) ? calculateScalar(a.scalar, 'mul', b.scalar, a.decimal)
			: resolveProduct(a, b, { numerator: numden[0], denominator: numden[1] }, false, a.decimal),
		numerator: numden[0],
		denominator: numden[1]
	});
}

export function div(a: Quantity, b_o: QuantityInitParam) : Quantity
{
	if (typeguards.isNumber(b_o) || b_o instanceof Decimal)
	{
		return scaleQuantity(a, b_o, true);
	}

	const b = isQuantity(b_o) ? b_o : a.createQuantity(b_o);

	if (b.isUnitless())
	{
		return scaleQuantity(a, b.scalar, true);
	}

	if (a.isTemperature() || b.isTemperature())
	{
		throw new Error("Cannot divide with temperatures");
	}

	// Quantities should be multiplied with same units if compatible, with base units else
	let op1 = a,
		op2 = b;

	// so as not to confuse results, multiplication and division between temperature degrees will maintain original unit info in num/den
	// multiplication and division between deg[CFRK] can never factor each other out, only themselves: "degK*degC/degC^2" == "degK/degC"
	if (!op1.isUnitless() && isCompatible(op1, op2) && op1.signature !== TEMPERATURE_SIGNATURE)
	{
		op2 = op1;
	}

	let numden = cancelPowers(op1.numerator.concat(op2.denominator), op1.denominator.concat(op2.numerator));

	return a.createQuantity({
		scalar: sameUnits(a, b) ? calculateScalar(a.scalar, 'div', b.scalar, a.decimal)
			: resolveProduct(a, b, { numerator: numden[0], denominator: numden[1] }, true, a.decimal),
		numerator: numden[0],
		denominator: numden[1]
	});
}

export function pow(a: Quantity, yy: number | string | Decimal) : Quantity
{
	const value = yy instanceof Decimal ? yy : new Exponent(yy);
	// Even the widest Decimal range can underflow an extreme literal. Inspect its
	// coefficient only after parsing validates the syntax, including radix literals.
	const coefficient = value.isZero() && typeof yy === 'string'
		? (/^-?0[xob]/i.test(yy) ? yy.replace(/^-?0[xob]/i, '').split(/p/i)[0] : yy.split(/e/i)[0]) : '';

	if (!value.isInt() || /[1-9a-f]/i.test(coefficient))
	{
		throw Error("Raising quantities to a fractional power not currently supported");
	}
	yy = value;

	if (yy.eq(0))
	{
		return a.createQuantity({ scalar: new a.decimal(1), numerator: UNITY, denominator: UNITY });
	}

	const exponent = checkedExponent(yy.toNumber());

	if (a.isTemperature() && exponent === 1)
	{
		return scaleTemperature(a, 1, false);
	}

	const multiplier = Math.abs(exponent);
	const num = scalePowers(exponent < 0 ? a.denominator : a.numerator, multiplier);
	const den = scalePowers(exponent < 0 ? a.numerator : a.denominator, multiplier);
	const numden = cancelPowers(num, den);

	return a.createQuantity({
		scalar: calculateScalar(a.scalar, 'pow', yy, a.decimal),
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

	return a.createQuantity({
		scalar: new a.decimal(1).div(a.scalar),
		numerator: a.denominator,
		denominator: a.numerator
	});
}

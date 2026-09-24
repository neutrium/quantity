import { Decimal } from '@neutrium/decimal';
import { compareArray } from '@neutrium/utilities';

import type { Quantity } from '../QuantityCore.js'
import type { QuantityDefinition } from '../QuantityDefinition.js';

import { FIVE_NINTHS, NINE_FIFTHS } from "../data/TemperatureFactors.js";


export function isTemperature(a: Quantity) : boolean
{
	return isDegrees(a) && /<temp-[CFRK]>/.test(a.numerator[0]);
}

export function isDegrees(a: Quantity) : boolean
{
	// signature may not have been calculated yet
	return (a.signature === null || a.signature === 400) &&
		a.numerator.length === 1 &&
		compareArray(a.denominator, ["<1>"]) &&
		(/<temp-[CFRK]>/.test(a.numerator[0]) || /<(kelvin|celsius|rankine|fahrenheit)>/.test(a.numerator[0]));
}

export function addTempDegrees(temp: Quantity, deg: Quantity, resultOwner: Quantity = temp): Quantity
{
	let tempDegrees = deg.to(temp.createQuantity(getDegreeUnits(temp)));

	return resultOwner.createQuantity({
		scalar: temp.scalar.add(tempDegrees.scalar),
		numerator: temp.numerator,
		denominator: temp.denominator
	});
}

export function subtractTemperatures(a: Quantity, b: Quantity): Quantity
{
	let bConverted = b.to(a),
		dstDegrees = getDegreeUnits(a);

	return a.createQuantity({
		scalar: a.scalar.sub(bConverted.scalar),
		numerator: dstDegrees.numerator,
		denominator: dstDegrees.denominator
	});
}

export function subtractTempDegrees(temp: Quantity, deg: Quantity): Quantity
{
	let tempDegrees = deg.to(temp.createQuantity(getDegreeUnits(temp)));

	return temp.createQuantity({
		scalar: temp.scalar.sub(tempDegrees.scalar),
		numerator: temp.numerator,
		denominator: temp.denominator
	});
}

export function toDegrees(src: Quantity, dst: Quantity): Quantity
{
	let srcDegK = toDegK(src),
		dstUnits = dst.units(),
		dstScalar;

	switch (dstUnits)
	{
		case "degK": dstScalar = srcDegK.scalar; break;
		case "degC": dstScalar = srcDegK.scalar; break;
		case "degF": dstScalar = srcDegK.scalar.mul(NINE_FIFTHS); break;
		case "degR": dstScalar = srcDegK.scalar.mul(NINE_FIFTHS); break;
		default:
			throw new Error("Unknown type for degree conversion to: " + dstUnits);
	}

	return src.createQuantity({
		scalar: dstScalar,
		numerator: dst.numerator,
		denominator: dst.denominator
	});
}

export function toDegK(qty: Quantity): Quantity
{
	let units = qty.units(),
		q: Decimal;

	if (units.match(/(deg)[CFRK]/))
	{
		q = qty.baseScalar;
	}
	else
	{
		switch (units)
		{
			case "tempK": q = qty.scalar; break;
			case "tempC": q = qty.scalar; break;
			case "tempF": q = qty.scalar.mul(FIVE_NINTHS); break;
			case "tempR": q = qty.scalar.mul(FIVE_NINTHS); break;
			default: throw new Error("Unknown type for temp conversion from: " + units);
		}
	}

	return qty.createQuantity({
		scalar: q,
		numerator: ["<kelvin>"],
		denominator: ["<1>"]
	});
}

export function toTemp(src: Quantity, dst: Quantity): Quantity
{
	let dstUnits = dst.units(),
		dstScalar;

	switch (dstUnits)
	{
		case "tempK":
			dstScalar = src.baseScalar; break;
		case "tempC":
			dstScalar = src.baseScalar.sub("273.15"); break;
		case "tempF":
			dstScalar = src.baseScalar.mul(NINE_FIFTHS).sub("459.67"); break;
		case "tempR":
			dstScalar = src.baseScalar.mul(NINE_FIFTHS); break;
		default:
			throw new Error("Unknown type for temp conversion to: " + dstUnits);
	}

	return src.createQuantity({
		scalar: dstScalar,
		numerator: dst.numerator,
		denominator: dst.denominator
	});
}

export function toTempK(qty: Quantity): Quantity
{
	let units = qty.units(),
		q: Decimal;

	if (units.match(/(deg)[CFRK]/))
	{
		q = qty.baseScalar;
	}
	else
	{
		switch (units)
		{
			case "tempK": q = qty.scalar; break;
			case "tempC": q = qty.scalar.add("273.15"); break;
			case "tempF": q = qty.scalar.add("459.67").mul(FIVE_NINTHS); break;
			case "tempR": q = qty.scalar.mul(FIVE_NINTHS); break;
			default:
				throw new Error("Unknown type for temp conversion from: " + units);
		}
	}

	return qty.createQuantity({
		scalar: q,
		numerator: ["<temp-K>"],
		denominator: ["<1>"]
	});
}

const DEGREE_TOKENS = new Map([
	['<temp-C>', '<celsius>'],
	['<temp-F>', '<fahrenheit>'],
	['<temp-K>', '<kelvin>'],
	['<temp-R>', '<rankine>']
]);

// Resolve absolute-temperature units to interval tokens without parsing display text.
export function getDegreeUnits(temperature: Quantity): QuantityDefinition
{
	const token = DEGREE_TOKENS.get(temperature.numerator[0]);
	if (!temperature.isTemperature() || !token)
	{
		throw new Error("Expected an absolute temperature");
	}
	return { scalar: new Decimal(1), numerator: [token], denominator: ['<1>'] };
}

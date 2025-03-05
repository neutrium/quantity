import { Decimal } from '@neutrium/math';
import { compareArray } from '@neutrium/utilities';

import { Quantity } from '../Quantity.js'

// Numbers for conversion
const FIVE_NINTHS = new Decimal("5").div("9");
const NINE_FIFTHS = new Decimal("9").div("5");


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

export function addTempDegrees(temp: Quantity, deg: Quantity): Quantity
{
	let tempDegrees = deg.to(getDegreeUnits(temp.units()));

	return new Quantity({
		scalar: temp.scalar.add(tempDegrees.scalar),
		numerator: temp.numerator,
		denominator: temp.denominator
	});
}

export function subtractTemperatures(a: Quantity, b: Quantity): Quantity
{
	let aUnits = a.units(),
		bConverted = b.to(aUnits),
		dstDegrees = new Quantity(getDegreeUnits(aUnits));

	return new Quantity({
		scalar: a.scalar.sub(bConverted.scalar),
		numerator: dstDegrees.numerator,
		denominator: dstDegrees.denominator
	});
}

export function subtractTempDegrees(temp: Quantity, deg: Quantity): Quantity
{
	let tempDegrees = deg.to(getDegreeUnits(temp.units()));

	return new Quantity({
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

	return new Quantity({
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

	return new Quantity({
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

	return new Quantity({
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

	return new Quantity({
		scalar: q,
		numerator: ["<temp-K>"],
		denominator: ["<1>"]
	});
}

// converts temp[C|K|F|R] to deg[C|K|F|R]
export function getDegreeUnits(units)
{
	let degrees = 'CKFR',
		unit = units.slice(-1);

	if (degrees.indexOf(unit) !== -1)
	{
		return 'deg' + unit;
	}
	else
	{
		throw new Error("Unknown type for temp conversion from: " + units);
	}
}
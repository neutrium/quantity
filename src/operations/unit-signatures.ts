import { Quantity } from "../Quantity.js";
import { UnitTokenManager } from "../UnitTokenManager.js";


//
// Calculates the unit signature id for use in comparing compatible units and simplification
// the signature is based on a simple classification of units and is based on the following publication
//
// Novak, G.S., Jr. "Conversion of units of measurement", IEEE Transactions on Software Engineering,
// 21(8), Aug 1995, pp.651-661
// doi://10.1109/32.403789
// http://www.cs.utexas.edu/~novak/units95.html
//
export function unitSignature(a: Quantity)
{
	if (a.signature)
	{
		return a.signature;
	}

	let vector = unitSignatureVector(a);

	for (let i = 0, len = vector.length; i < len; i++)
	{
		vector[i] *= Math.pow(20, i);	// Not sure if equation is correct
	}

	return vector.reduce(function (previous, current) { return previous + current; }, 0);
};

// calculates the unit signature vector used by unit_signature
function unitSignatureVector(a: Quantity)
{
	const tokenMapper = UnitTokenManager.instance;
	const SIGNATURE_VECTOR = ["length", "time", "temperature", "mass", "current", "substance", "luminosity", "currency", "data", "angle", "capacitance"];

	if (!a.isBase())
	{
		return unitSignatureVector(a.toBase());
	}

	let vector = new Array(SIGNATURE_VECTOR.length),
		r, n;

	for (let i = 0; i < vector.length; i++)
	{
		vector[i] = 0;
	}

	// Numerator - ["<kilogram>","<meter>"]
	for (let j = 0, len = a.numerator.length; j < len; j++)
	{
		if((r = tokenMapper.getUnit(a.numerator[j])))
		{
			n = SIGNATURE_VECTOR.indexOf(r.category);

			if (n >= 0)
			{
				vector[n] = vector[n] + 1;
			}
		}
	}

	for (let k = 0, len = a.denominator.length; k < len; k++)
	{
		if ((r = tokenMapper.getUnit(a.denominator[k])))
		{
			n = SIGNATURE_VECTOR.indexOf(r.category);

			if (n >= 0)
			{
				vector[n] = vector[n] - 1;
			}
		}
	}

	return vector;
};
import type { UnitStructure, UnitPower } from '../QuantityDefinition.js';

// Quantity owns frozen, normalized arrays. Weak keys allow their identities to
// be reused by clones and arithmetic without retaining discarded definitions.
const sideKeys = new WeakMap<readonly UnitPower[], string>();

function sideKey(units: readonly UnitPower[]): string
{
	let key = sideKeys.get(units);

	if (key === undefined)
	{
		key = JSON.stringify(units.map(({ unit, prefix, exponent }) => [unit, prefix ?? null, exponent]));
		sideKeys.set(units, key);
	}

	return key;
}

// Keep the two sides and their term order distinct, as with the original unit
// expression comparison. Display aliases are deliberately absent from identity.
export function unitKey(units: UnitStructure): string
{
	return sideKey(units.numerator) + '/' + sideKey(units.denominator);
}

export function sameUnits(a: UnitStructure, b: UnitStructure): boolean
{
	return (a.numerator === b.numerator || sideKey(a.numerator) === sideKey(b.numerator)) &&
		(a.denominator === b.denominator || sideKey(a.denominator) === sideKey(b.denominator));
}

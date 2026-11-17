import { describe, expect, it } from 'vitest';
import { Quantity } from '../dist/Quantity.js';
import { Quantity as RegexQuantity } from '../dist/regex.js';
import { Quantity as NumberQuantity } from '../dist/number.js';
import { createQuantityClass } from '../dist/factory.js';
import { isQuantityDefinition } from '../dist/guards.js';
import { RegexParser } from '../dist/parsers/RegexParser.js';
import { DecimalArithmeticAdapter } from '@neutrium/math/adapters/decimal/arithmetic';
import { NumberAdapter } from '@neutrium/math/adapters/number';
import { Decimal } from '@neutrium/decimal';

const third = { numerator: 1n, denominator: 3n };
for (const [name, Base] of [['Decimal', Quantity], ['Regex', RegexQuantity], ['number', NumberQuantity]])
{
	for (const cache of [true, false])
	{
		const Q = Base.withConfig({ cache });
		const scalar = q => q.numeric.toNumber(q.scalar);

		describe(`${name}, fractional exponents, cache=${cache}`, () => {
			it('takes roots and powers of scalars and compound units', () => {
				const source = new Q('4 m*kg2');
				const root = source.sqrt().div('3 s');
				expect(scalar(root)).toBeCloseTo(2 / 3, 14);
				expect(root.units()).toBe('m^(1/2)*kg/s');
				expect(root).toBeInstanceOf(Q);
				expect(root.numeric).toBe(source.numeric);
				expect(source.units()).toBe('m*kg2');
				expect(new Q('4 m2').sqrt().same(new Q('2 m'))).toBe(true);
				expect(new Q('-8 m3').cbrt().same(new Q('-2 m'))).toBe(true);
				expect(new Q('-8 m3').pow('2/3').same(new Q('4 m2'))).toBe(true);
				expect(new Q('4 m2').pow('-1/2').same(new Q('0.5/m'))).toBe(true);
				expect(new Q('m').pow(third).pow(3).units()).toBe('m');
			});

			it('combines fractional dimensions exactly and returns integer fast-path records', () => {
				expect(new Q('m').pow(third).mul(new Q('m').pow('2/3')).numerator[0].exponent).toBe(1);
				expect(new Q('m').pow('2/3').div(new Q('m').pow(third)).units()).toBe('m^(1/3)');
				let product = new Q('1');
				for (let i = 0; i < 10; i++) product = product.mul(new Q('m').pow('0.1'));
				expect(product.numerator[0].exponent).toBe(1);
				expect(product.eq('m')).toBe(true);
				expect(new Q('m^(1/3)').div('m^(2/6)').isUnitless()).toBe(true);
			});

			it('round-trips explicit decimal, scientific and rational unit powers', () => {
				for (const input of ['m^0.5', 'm**-0.5', 'm^(2/6)', 'm^(1/-3)', 'm^1e-2', 'kg/m^(7/3).s^0.1', 'm^2.0']) {
					const q = new Q(input);
					expect(new Q(q.units()).same(q), input).toBe(true);
					expect(q.clone().same(q), input).toBe(true);
				}
				expect(new Q('m^0.5').same(new Q('m^(2/4)'))).toBe(true);
				expect(new Q('m^0.5').same(new Q('m^(1/3)'))).toBe(false);
				expect(new Q('m^0.5').isCompatible('cm^(1/2)')).toBe(true);
				expect(new Q('m^0.5').isCompatible('m^(1/3)')).toBe(false);
			});

			it('converts, compares and calculates with fractional scales', () => {
				expect(scalar(new Q('cm^0.5').to('m^0.5'))).toBe(0.1);
				expect(scalar(new Q('km^0.5').toBase())).toBeCloseTo(Math.sqrt(1000), 12);
				expect(new Q('10 cm^0.5').eq('m^0.5')).toBe(true);
				expect(new Q('km^0.5').gt('31.62 m^0.5')).toBe(true);
				expect(new Q('km^0.5').lt('31.63 m^0.5')).toBe(true);
				expect(new Q('2 cm^0.5').add('m^0.5').same(new Q('12 cm^0.5'))).toBe(true);
				expect(new Q('2 cm^0.5').sub('m^0.5').same(new Q('-8 cm^0.5'))).toBe(true);
				expect(new Q('2 cm^0.5').mul('m^0.5').same(new Q('20 cm'))).toBe(true);
				expect(scalar(new Q('2 cm^0.5').div('m^0.5'))).toBe(0.2);
				expect(scalar(new Q('2 cm^0.5').to('m^(-1/2)'))).toBe(5);
				const force = new Q('N^0.5').toBase();
				expect(force.eq('kg^0.5*m^0.5/s')).toBe(true);
				expect(() => new Q('m^0.5').add('s^0.5')).toThrow('Incompatible units');
			});

			it('owns normalized immutable rational records and validates external definitions', () => {
				const exponent = { numerator: 2n, denominator: 6n };
				const definition = { scalar: new Q(1).scalar, numerator: [{ unit: '<meter>', exponent }], denominator: [] };
				expect(isQuantityDefinition(definition, new Q(1).numeric)).toBe(true);
				const q = new Q(definition);
				exponent.numerator = 7n;
				expect(q.numerator[0].exponent).toEqual(third);
				expect(Object.isFrozen(q.numerator[0].exponent)).toBe(true);
				expect(new Q({ ...definition, numerator: [{ unit: '<meter>', exponent: { numerator: 4n, denominator: 2n } }] }).units()).toBe('m2');

				for (const invalid of [0.5, { numerator: 1, denominator: 2 }, { numerator: 1n, denominator: 0n }, { numerator: -1n, denominator: 2n }])
				{
					expect(isQuantityDefinition({ ...definition, numerator: [{ unit: '<meter>', exponent: invalid }] }, q.numeric)).toBe(false);
				}
			});

			it('rejects invalid powers, non-real roots and absolute-temperature powers', () => {

				for (const exponent of ['1/0', 'NaN', '1e-10000', { numerator: 1, denominator: 2 }, { numerator: 1n, denominator: 0n }, { numerator: 1n }])
				{
					expect(() => new Q('m').pow(exponent)).toThrow();
				}

				expect(() => new Q('-4 m2').sqrt()).toThrow('not real');
				expect(() => new Q('20 tempC').sqrt()).toThrow('temperatures');
				expect(() => new Q('20 tempK').pow('1/3')).toThrow('temperatures');
				expect(new Q('4 degC2').sqrt().units()).toBe('degC');
				expect(new Q('m^(1/2)').pow(0).same(new Q(1))).toBe(true);
			});
		});
	}
}

it('parses the original grouped expression and exact rational group roots', () => {
	const q = new Quantity('(2 m × 2kg^2)^0.5 / (3 s)');
	expect(q.units()).toBe('m^(1/2)*kg/s');
	expect(q.scalar.eq(new Decimal(2).div(3))).toBe(true);
	expect(new Quantity('(-8 m3)^(1/3)').same(new Quantity('-2 m'))).toBe(true);
	expect(new Quantity('((m^(1/3))^3)').units()).toBe('m');
});

it('uses rational arithmetic capabilities for scalar roots and fractional unit conversions', () => {
	const Q = createQuantityClass({ numeric: new DecimalArithmeticAdapter(), parser: c => new RegexParser(c) });
	expect(new Q('4 m2').sqrt().same(new Q('2 m'))).toBe(true);
	expect(new Q('-8 m3').cbrt().same(new Q('-2 m'))).toBe(true);
	expect(new Q('8 m3').pow('1/3').same(new Q('2 m'))).toBe(true);
	expect(new Q('cm^(1/2)').to('m^(1/2)').scalar.toString()).toBe('0.1');
	expect(new Q('km^(1/2)').toBase().scalar.toString()).toBe('31.62277660168379332');
});

it('reads adapter-native exponents before interpreting plain rational records', () => {
	class TaggedDecimal extends Decimal
	{
		get numerator() { return this.toRationalTerm().numerator; }
		get denominator() { return this.toRationalTerm().denominator; }
	}
	const q = new Quantity('4 m2');
	const half = new TaggedDecimal('0.5');
	expect(q.numeric.isValue(half)).toBe(true);
	expect(q.pow(half).same(new Quantity('2 m'))).toBe(true);
});

it('uses exact built-in root exponents even when the adapter recognizes fraction records', () => {
	const number = new NumberAdapter();
	const isFraction = x => typeof x?.numerator === 'bigint' && typeof x.denominator === 'bigint' && x.denominator > 0n;
	const asNumber = x => isFraction(x) ? Number(x.numerator) / Number(x.denominator) : x;
	const numeric = { ...number };
	for (const method of Object.getOwnPropertyNames(NumberAdapter.prototype)) {
		if (method !== 'constructor') numeric[method] = (...args) => number[method](...args.map(asNumber));
	}
	numeric.isValue = x => number.isValue(x) || isFraction(x);
	const Q = createQuantityClass({ numeric, parser: c => new RegexParser(c) });
	for (const [input, root, power] of [['4 m2', 'sqrt', '1/2'], ['8 m3', 'cbrt', '1/3'], ['-8 m3', 'cbrt', '1/3']]) {
		const q = new Q(input);
		expect(q[root]().same(q.pow(power))).toBe(true);
	}
});

it('keeps the sign of underflow after cancellation of fractional unit scales', () => {
	const Reference = Decimal.clone({ precision: 160 });
	const truncatedRoot = new Reference(1000).sqrt().toSD(120, 'down').toString();
	const Q = Quantity.withConfig({ numeric: { precision: 150, minE: -10 } });
	const root = new Q('1 km^(1/2)');
	const truncation = new Q(truncatedRoot, 'm^(1/2)');
	expect(truncation.sub(root).scalar.toNumber()).toBe(-0);
	expect(new Q('-' + truncatedRoot, 'm^(1/2)').add(root).scalar.toNumber()).toBe(+0);
});

it('rounds irrational conversions and scalar powers once in each Decimal rounding mode', () => {
	const Reference = Decimal.clone({ precision: 100 });
	for (const rounding of ['up', 'down', 'ceil', 'floor', 'half-up', 'half-down', 'half-even', 'half-ceil', 'half-floor'])
	{
		const Q = Quantity.withConfig({ numeric: { precision: 12, rounding } });

		for (const sign of [1, -1])
		{
			const q = new Q(`${sign} km^(1/2)`);
			const expected = new Reference(1000).sqrt().mul(sign).toSD(12, rounding).toString();
			expect(q.toBase().scalar.toString()).toBe(expected);
		}

		expect(new Q('2 m').pow('5/2').scalar.toString()).toBe(new Reference(32).sqrt().toSD(12, rounding).toString());
		expect(new Q('-2 m').pow('1/3').scalar.toString()).toBe(new Reference(-2).cbrt().toSD(12, rounding).toString());
		expect(new Q('m^(1/2)').add('km^(1/2)').scalar.toString()).toBe(new Reference(1000).sqrt().add(1).toSD(12, rounding).toString());
		expect(new Q('m^(1/2)').div('km^(1/2)').scalar.toString()).toBe(new Reference(1).div(new Reference(1000).sqrt()).toSD(12, rounding).toString());
	}
});

it('handles large rational components without overflowing the native exponent', () => {
	const numerator = 10n ** 400n + 1n, denominator = 3n * 10n ** 400n;
	const result = new NumberQuantity('8 m').pow({ numerator, denominator });
	expect(result.scalar).toBeCloseTo(2, 14);
	expect(result.numerator[0].exponent).toEqual({ numerator, denominator });
});

it('cancels conversion scales across different fractional denominators', () => {
	const q = new Quantity('cm^(1/2)*km^(1/3)');
	expect(q.toBase().same(new Quantity('m^(5/6)'))).toBe(true);
	expect(q.eq('m^(5/6)')).toBe(true);
	expect(q.sub('m^(5/6)').scalar.toString()).toBe('0');
});

it('keeps fractional dimensions and scalar results independent of narrow exponent input ranges', () => {
	const Q = Quantity.withConfig({ numeric: { precision: 50, minE: -20, maxE: 20 } });
	const Reference = Decimal.clone({ precision: 60 });
	const q = new Q('2 m').pow('1e-30');
	expect(q.numerator[0].exponent).toEqual({ numerator: 1n, denominator: 10n ** 30n });
	expect(q.scalar.toString()).toBe(new Reference(2).pow('1e-30').toSD(50).toString());
});

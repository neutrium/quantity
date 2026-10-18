import { describe, expect, it } from 'vitest';
import { createQuantityClass } from '../dist/factory.js';
import { DecimalArithmeticAdapter } from '@neutrium/utilities/decimal/arithmetic';
import { DecimalScientificAdapter } from '@neutrium/utilities/decimal/scientific';
import { NumberAdapter } from '@neutrium/utilities/number';
const numberAdapter = new NumberAdapter();
import { floatAdapter } from './helpers/numeric.js';
import { NearleyParser } from '../dist/parsers/NearleyParser.js';
import { RegexParser } from '../dist/parsers/RegexParser.js';

for (const Parser of [NearleyParser, RegexParser])
{
	const configure = numeric => createQuantityClass({ numeric, parser: c => new Parser(c) });

	for (const Adapter of [DecimalArithmeticAdapter, DecimalScientificAdapter])
	{
		describe(`${Parser.name}, Decimal ${new Adapter().tier}: final-only arithmetic rounding`, () => {
			for (const rounding of ['up', 'down', 'ceil', 'floor', 'half-up', 'half-down', 'half-even', 'half-ceil', 'half-floor'])
			{
				it(`rounds complete sums and products once (${rounding})`, () => {
					const n = new Adapter({ precision: 2, rounding }), Q = configure(n);
					const one = n.from(1), delta = n.from('1.000001');
					expect(new Q('1 m').sub('100.0001 cm').scalar.eq(n.sub(one, delta))).toBe(true);
					expect(new Q('1 m').add('-100.0001 cm').scalar.eq(n.sub(one, delta))).toBe(true);
					expect(new Q('1 m').add('0.0001 cm').scalar.eq(n.add(one, n.from('0.000001')))).toBe(true);
					expect(new Q('9 m').mul('11.9 cm').scalar.eq(n.mul(n.from(9), n.from('0.119')))).toBe(true);
					expect(new Q('-9 m').mul('11.9 cm').scalar.eq(n.mul(n.from(-9), n.from('0.119')))).toBe(true);
					expect(new Q('3 m').div('11.9 cm').scalar.eq(n.div(n.from(3), n.from('0.119')))).toBe(true);
					expect(new Q('3 m').div('-11.9 cm').scalar.eq(n.div(n.from(3), n.from('-0.119')))).toBe(true);
				});
			}
			it('applies exponent limits after cancellation and multiplication/division', () => {
				const Q = configure(new Adapter({ maxE: 20, minE: -20 }));
				for (const [a, op, b, expected, units] of [
					['1e20 m', 'div', '1e20 km', '0.001', ''],
					['1e-20 m', 'mul', '1e20 km', '1000', 'm2'],
					['1e20 m', 'mul', '1e-20 mm', '0.001', 'm2'],
					['1e-20 m', 'div', '1e-20 mm', '1000', ''],
					['-1e20 m', 'add', '1e18 km', '9e20', 'm'],
					['1e20 m', 'sub', '1e18 km', '-9e20', 'm'],
					['1e-20 m', 'add', '1e-20 mm', '1.001e-20', 'm'],
				]) {
					const result = new Q(a)[op](b);
					expect(result.scalar.eq(expected), `${a} ${op} ${b}`).toBe(true);
					expect(result.units()).toBe(units);
				}
				expect(new Q('1e20 m').mul('1e20 km').scalar.toString()).toBe('Infinity');
				expect(new Q('1e-20 m').mul('1e-20 mm').scalar.isZero()).toBe(true);
			});
			it('uses the receiver settings with an operand from a wider range', () => {
				const Wide = configure(new Adapter({ precision: 50 }));
				const Low = Wide.withConfig({ numeric: { precision: 6, maxE: 20, minE: -20 } });
				const b = new Wide('100.0001 cm');
				const result = new Low('1 m').sub(b);
				expect(result).toBeInstanceOf(Low);
				expect(result.scalar.toString()).toBe('-0.000001');
				expect(new Low('1e20 m').div(new Wide('1e23 mm')).scalar.eq(1)).toBe(true);
				expect(b.scalar.toString()).toBe('100.0001');
			});
		});
	}

	for (const numeric of [numberAdapter, floatAdapter])
	{
		it(`${Parser.name}: combines native ${numeric.id} scalars before applying relative scales`, () => {
			const Q = configure(numeric), exponent = numeric === numberAdapter ? 308 : 38;
			const a = new Q(`1e${exponent} m`), b = new Q(`1e${exponent} km`);
			expect(a.div(b).scalar).toBe(numeric.from('0.001'));
			expect(new Q(`1e-${exponent} m`).mul(b).scalar).toBeCloseTo(1000, 3);
			expect(new Q('1 m').sub('100.0001 cm').scalar).not.toBe(0);
			expect(new Q('0 m').mul(b).scalar).toBe(0);
			expect(new Q('-0 m').mul(b).scalar).toBe(-0);
			expect(new Q('0 m').div('0 cm').scalar).toBeNaN();
			expect(new Q(Infinity, 'm').sub(new Q(Infinity, 'cm')).scalar).toBeNaN();
		});
	}
}

it('handles huge counted scales without expanding them or rounding them to zero early', () => {
	const numeric = new DecimalScientificAdapter({ precision: 6, minE: -100, maxE: 100 });
	const Q = createQuantityClass({ numeric, parser: c => new RegexParser(c) });
	const metre = new Q('1 m10000');
	expect(metre.add('1 ft10000').scalar.toString()).toBe('1');
	expect(metre.sub('1 ft10000').scalar.toString()).toBe('1');
	expect(new Q('0 m10000').sub('1 ft10000').scalar.isNeg()).toBe(true);
	const extreme = '9007199254740991';
	expect(new Q(`1 km${extreme}`).sub(`1000 km9007199254740990*m`).scalar.toString()).toBe('0');
	expect(new Q(`1 km${extreme}`).div(`1000 km9007199254740990*m`).scalar.toString()).toBe('1');
});


it('keeps huge non-decimal factors outside the backend range until the final product', () => {
	const numeric = new DecimalScientificAdapter({ precision: 20, maxE: 6000, minE: -6000 });
	const Q = createQuantityClass({ numeric, parser: c => new RegexParser(c) });
	// The converted right scalar is around 1e7159; both final results fit.
	const right = new Q('1e2000 m10000');
	expect(new Q('1e-2000 ft10000').mul(right).scalar.toString()).toBe('7.0855460409772512495e+5159');
	expect(new Q('1e2000 ft10000').div(right).scalar.toString()).toBe('1.4113238333598890877e-5160');
});

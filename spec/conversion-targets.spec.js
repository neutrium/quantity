import { DecimalScientificAdapter } from '@neutrium/math/adapters/decimal/scientific';
const testNumeric = new DecimalScientificAdapter();
import { describe, expect, it, vi } from 'vitest';
import { Decimal } from '@neutrium/decimal';
import { Quantity } from '@neutrium/quantity';
import { Quantity as RegexQuantity } from '@neutrium/quantity/regex';
import { NumberAdapter } from '@neutrium/math/adapters/number';
import { BigIntAdapter } from '@neutrium/math/adapters/bigint';
import { NearleyParser, PrattParser, RegexParser } from '@neutrium/quantity/parsers.js';
import { createQuantityClass } from '@neutrium/quantity/factory';
import { UnitTokenManager } from '../dist/UnitTokenManager.js';

it('rejects unsupported conversion targets even after caching valid targets', () => {
	const source = new Quantity('1 m');
	source.to('m');
	source.to('cm');
	for (const target of [undefined, null, false, 0, NaN, {}, { numerator: source.numerator, denominator: source.denominator }]) {
		expect(() => source.to(target)).toThrow(TypeError);
	}
});

for (const Constructor of [Quantity, RegexQuantity])
{
	describe(`conversion targets with ${Constructor === Quantity ? 'Pratt' : 'Regex'}`, () => {
		it('ignores positive, zero and negative target scalars for equivalent sources', () => {
			for (const source of [new Constructor('10 m'), new Constructor('1000 cm')])
			{
				for (const scalar of ['2', '0', '-2'])
				{
					for (const [units, expected] of [['m', '10'], ['cm', '1000']])
					{
						const expression = `${scalar} ${units}`;
						const target = new Constructor(expression);
						const result = source.to(expression);
						expect(result.scalar.toString()).toBe(expected);
						expect(result.same(source.to(target))).toBe(true);
						expect(result.eq(source)).toBe(true);
						expect(source.to(expression)).toBe(result);
						expect(source.to(target)).toBe(source.to(target));
						expect(target.scalar.toString()).toBe(scalar);
					}
				}
				expect(source.to(`0 ${source.units()}`)).toBe(source);
				expect(source.to('')).toBe(source);
			}
		});

		it('handles compound units, scientific scalars and dimensionless targets consistently', () => {
			const speed = new Constructor('10 m/s');
			for (const target of ['2 cm/s', '0 cm/s', '-2 cm/s', '2e3 cm/s'])
			{
				expect(speed.to(target).scalar.toString()).toBe('1000');
			}
			const ratio = new Constructor('10 m/m');

			for (const target of ['2', '0', '-2'])
			{
				const result = ratio.to(target);
				expect(result.scalar.toString()).toBe('10');
				expect(result.units()).toBe('');
			}
			expect(new Constructor('10 m').div('2 m').scalar.toString()).toBe('5');
		});

		it('ignores reciprocal target scalars while still rejecting inversion of zero', () => {
			const source = new Constructor('10 m');
			for (const target of ['2 cm^-1', '0 cm^-1', '-2 cm^-1'])
			{
				expect(source.to(target).scalar.toString()).toBe('0.001');
				expect(source.to(target).same(source.to(new Constructor(target)))).toBe(true);
				expect(() => new Constructor('0 m').to(target)).toThrow('Divide by zero');
			}
		});

		it('uses only temperature target units before applying value validation', () => {
			for (const [input, units, expected] of [
				['20 tempC', 'tempF', '68'],
				['20 tempC', 'tempK', '293.15'],
				['20 tempC', 'degC', '20'],
				['20 tempC', 'mdegC', '20000'],
				['20 tempC', 'degC*m/m', '20'],
				['18 degF', 'degC', '10'],
			]) {
				const source = new Constructor(input);
				for (const scalar of ['2', '0', '-1000']) {
					expect(source.to(`${scalar} ${units}`).scalar.toString()).toBe(expected);
				}
			}
			// Actual quantity values still enforce absolute zero.
			expect(() => new Constructor('-1000 tempK')).toThrow(/absolute zero/);
		});

		it('still validates target syntax, dimensions and absolute-temperature units', () => {
			const source = new Constructor('10 m');
			for (const target of ['0 unknown', '0 cm/', '-2 cm^', '0 s', '0 tempC*m']) {
				expect(() => source.to(target), target).toThrow();
			}
		});
	});
}

it('parses custom target strings once without mutating parser-owned results', () => {
	const parsed = {
		scalar: new Decimal(0),
		numerator: [{ unit: '<meter>', prefix: '<centi>', exponent: 1 }],
		denominator: []
	};
	const calls = [];
	const Custom = createQuantityClass({ numeric: testNumeric, parser: () => ({ parse(text) {
		calls.push(text);
		if (text !== 'custom centimetres') throw new Error('Unexpected input');
		return parsed;
	} }) });
	const source = new Custom({
		scalar: new Decimal(2), numerator: [{ unit: '<meter>', exponent: 1 }], denominator: []
	});
	const result = source.to('custom centimetres');
	expect(result).toBeInstanceOf(Custom);
	expect(result.scalar.toString()).toBe('200');
	expect(source.to('custom centimetres')).toBe(result);
	expect(calls).toEqual(['custom centimetres']);
	expect(parsed.scalar.toString()).toBe('0');
	expect(Object.isFrozen(parsed.numerator)).toBe(false);
});

it('uses the parsed target for inherited predicates and the already expanded units for the result', () => {
	const parser = new RegexParser(), parse = vi.spyOn(parser, 'parse');
	const lookup = vi.spyOn(UnitTokenManager.instance, 'getUnit');
	const Q = createQuantityClass({ numeric: new NumberAdapter(), parser: () => parser, config: { cache: false } });
	class WithInverse extends Q {
		isInverse(target) { return super.isInverse(target); }
		constructQuantity(...args) {
			lookup.mockClear();
			const result = super.constructQuantity(...args);
			expect(lookup).not.toHaveBeenCalledWith('<newton>');
			return result;
		}
	}
	const force = new WithInverse('2 kg*m/s2');
	parse.mockClear();
	expect(force.to('N').scalar).toBe(2);
	expect(parse).toHaveBeenCalledTimes(1);

	class WithCompatibility extends Q {
		isCompatible(target) { expect(target).toBe('1/N'); return false; }
	}
	const inverse = new WithCompatibility('2 N');
	parse.mockClear();
	expect(inverse.to('1/N').scalar).toBe(0.5);
	expect(parse).toHaveBeenCalledTimes(1);
});

it('discards the prepared conversion dimensions when a construction hook replaces the target units', () => {
	const Q = RegexQuantity.withConfig({ cache: false });
	const time = new Q('1 ms');
	class Relabelled extends Q {
		constructQuantity(input, units, parser) {
			if (input.numerator[0]?.unit === '<newton>') input.numerator = time.numerator;
			return super.constructQuantity(input, units, parser);
		}
	}
	const result = new Relabelled('2 kg*m/s2').to('N');
	expect(result.units()).toBe('ms');
	expect(result.isCompatible('s')).toBe(true);
	expect(result.toBase().units()).toBe('s');
});

it.each([true, false])('recomputes base dimensions changed by a construction hook, cache=%s', cache => {
	const Q = RegexQuantity.withConfig({ cache }), time = new Q('1 s');
	class Relabelled extends Q {
		constructQuantity(input, units, parser) {
			input.numerator = time.numerator;
			input.denominator = time.denominator;
			return super.constructQuantity(input, units, parser);
		}
	}
	const result = new Relabelled('2 N').toBase();
	expect(result.units()).toBe('s');
	expect(result.signature).toBe(time.signature);
	expect(result.isCompatible('s')).toBe(true);
});

it('ignores the powered scalar in a conversion target', () => {
	expect(new Quantity('10 m/s').to('2^3 cm/s').scalar.toString()).toBe('1000');
});


for (const Parser of [NearleyParser, PrattParser, RegexParser]) {
	it.each([true, false])(`ignores unrepresentable target scalars with ${Parser.name}, cache=%s`, cache => {
		const Q = createQuantityClass({ numeric: new BigIntAdapter(), parser: c => new Parser(c), config: { cache } });
		const length = new Q('1000 m');
		expect(length.to('0.5 km').scalar).toBe(1n);
		expect(length.isCompatible('0.5 km')).toBe(true);
		expect(length.isInverse('0.5 km^-1')).toBe(true);
		expect(new Q('1 degK').isCompatible('-999 tempC')).toBe(true);
		expect(new Q('1/degK').isInverse('-999 tempC')).toBe(true);
		for (const test of ['isInverse', 'isCompatible']) {
			expect(() => length[test]('0.5 km/')).toThrow();
			expect(() => length[test]('0.5 tempK*m')).toThrow(/temperatures/);
			expect(() => length[test]('')).toThrow();
		}
		expect(length.to(new Quantity('0.5 km')).scalar).toBe(1n);
		expect(new Q(2n, '0.5 km').scalar).toBe(2n);
		expect(() => new Q('0.5 km')).toThrow();
		expect(() => length.to('0.5 km/')).toThrow();
		expect(() => length.to('0.5 s')).toThrow(/incompatible/i);
		if (Parser !== RegexParser) {
			expect(length.to('(0.5 km)^1').scalar).toBe(1n);
			expect(() => length.to('0.5 km^(1/0)')).toThrow();
		}
	});
}

for (const Parser of [NearleyParser, PrattParser, RegexParser]) {
	it(`does not construct dummy constants for unit targets with ${Parser.name}`, () => {
		class EvenNumbers extends NumberAdapter {
			from(input) {
				const value = super.from(input);
				if (value % 2 !== 0) throw new Error('Expected an even number');
				return value;
			}
		}
		const Q = createQuantityClass({ numeric: new EvenNumbers(), parser: c => new Parser(c) });
		const length = new Q(2, 'm');
		expect(length.to('1 meter')).toBe(length);
		expect(length.isCompatible('1 cm')).toBe(true);
		expect(length.isInverse('1/m')).toBe(true);
	});
	if (Parser !== RegexParser) it(`evaluates division without constructing zero with ${Parser.name}`, () => {
		class PositiveNumbers extends NumberAdapter {
			from(input) {
				const value = super.from(input);
				if (value <= 0) throw new Error('Expected a positive number');
				return value;
			}
		}
		const Q = createQuantityClass({ numeric: new PositiveNumbers(), parser: c => new Parser(c) });
		expect(new Q('8 m / (2 s)').scalar).toBe(4);
	});
}

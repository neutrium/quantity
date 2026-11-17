import { describe, expect, it, vi } from 'vitest';
import { DecimalScientificAdapter } from '@neutrium/math/adapters/decimal/scientific';
import { BigIntAdapter } from '@neutrium/math/adapters/bigint';
import { NumberAdapter } from '@neutrium/math/adapters/number';
import { PrattParser, QuantityParseError } from '@neutrium/quantity/parsers/pratt';
import { NearleyParser } from '@neutrium/quantity/parsers/nearley';
import { createQuantityClass } from '@neutrium/quantity/factory';
import { UnitTokenManager } from '../../dist/UnitTokenManager.js';
import { lexerTemplate } from '../../dist/parsers/MooQtyLexer.js';

const numeric = new DecimalScientificAdapter();
const reference = new NearleyParser({ cache: { maxEntries: 0 } });

it.each([PrattParser, NearleyParser])('$name reuses a unit plan across supplied scalars without starting a lexer', Parser => {
	const parser = new Parser({});
	const n = new NumberAdapter();
	const original = parser.parse('kg*m/s^2', n);
	const clone = vi.spyOn(lexerTemplate, 'clone');
	try {
		const hit = parser.parse('kg*m/s^2 ', n, undefined, 0);
		expect(hit.numerator).toBe(original.numerator);
		expect(hit.scalar).toBe(0);
		expect(clone).not.toHaveBeenCalled();
		parser.clearCache();
		expect(parser.parse('kg*m/s^2', n, undefined, 2).scalar).toBe(2);
		expect(clone).toHaveBeenCalledOnce();
	} finally { clone.mockRestore(); }
});

it.each([PrattParser, NearleyParser])('$name evaluates a cached unit-leading expression without starting a lexer', Parser => {
	const parser = new Parser({});
	const input = 'm * 2\n/ 0';
	const numbers = new NumberAdapter();
	parser.parse('  ' + input, numbers, undefined, 7);
	const clone = vi.spyOn(lexerTemplate, 'clone');
	try {
		expect(parser.parse(input, numbers).scalar).toBe(Infinity);
		expect(parser.tryParse(input, new BigIntAdapter())).toMatchObject({
			success: false, error: { code: 'DIVISION_BY_ZERO', input, offset: input.indexOf('/'), line: 2, column: 1 },
		});
		expect(clone).not.toHaveBeenCalled();
	} finally { clone.mockRestore(); }
});

it.each([NearleyParser, PrattParser])('$name delegates arithmetic by one and preserves unit labels', Parser => {
	const adapter = new DecimalScientificAdapter({ precision: 3 });
	const mul = vi.spyOn(adapter, 'mul'), div = vi.spyOn(adapter, 'div');
	for (const maxEntries of [0, 32]) {
		const parser = new Parser({ cache: { maxEntries } });
		for (let repeat = 0; repeat < 2; repeat++) {
			mul.mockClear();
			div.mockClear();
			for (const input of ['1.23456 m', '1.23456/s', '1.23456 1/s', '1.23456 1/s.kg']) {
				expect(parser.parse(input, adapter).scalar.toString(), input).toBe('1.23456');
			}
			expect(mul).not.toHaveBeenCalled();
			expect(div).not.toHaveBeenCalled();
			for (const input of ['1.23456 m * 1', '1 * (1.23456 m)', '1.23456 * 1/s', '(1.23456 1)/s']) {
				expect(parser.parse(input, adapter).scalar.toString(), input).toBe('1.23');
			}
			expect(mul).toHaveBeenCalledTimes(4);
			expect(parser.parse('1.23456 m / 1', adapter).scalar.toString()).toBe('1.23');
			expect(div).toHaveBeenCalledOnce();
			expect(parser.parse('1.23456 1/2', adapter).scalar.toString()).toBe('0.615');
			expect(mul).toHaveBeenCalledTimes(5);
			expect(div).toHaveBeenCalledTimes(2);
		}
	}
});

it.each([NearleyParser, PrattParser])('$name evaluates products and quotients without requiring a representable one', Parser => {
	class EvenNumbers extends NumberAdapter {
		from(input) {
			const value = super.from(input);
			if (value % 2 !== 0) throw new RangeError('Expected an even integer');
			return value;
		}
	}
	const numeric = new EvenNumbers();
	for (const maxEntries of [0, 128]) {
		const parser = new Parser({ cache: { maxEntries } });
		for (let repeat = 0; repeat < 2; repeat++) {
			expect(parser.parse('2 * 4 m', numeric).scalar).toBe(8);
			expect(parser.parse('4 / 2', numeric).scalar).toBe(2);
			expect(parser.parse('4 1/s', numeric).scalar).toBe(4);
			expect(parser.tryParse('4 * 1', numeric).error.code).toBe('INVALID_SCALAR');
		}
	}
});

it.each([NearleyParser, PrattParser])('$name evaluates explicit factors in the configured numeric representation', Parser => {
	class GridNumbers extends NumberAdapter {
		constructor(step) { super(); this.step = step; }
		from(input) { return this.step * Math.round(super.from(input) / this.step); }
	}
	const even = new GridNumbers(2), ordinary = new NumberAdapter();
	for (const maxEntries of [0, 128])
	{
		const parser = new Parser({ cache: { maxEntries } });
		for (const [input, expected, standard] of [
			['2 * 4', 8, 8], ['4 / 2', 2, 2], ['4 * 1', 8, 4], ['4 / 1', 2, 4],
			['1 * 4 m', 8, 4], ['4 m/s', 4, 4], ['(1 m)^2', 4, 1],
		]) {
			expect(parser.parse(input, ordinary).scalar).toBe(standard);
			expect(parser.parse(input, even).scalar).toBe(expected);
		}
		expect(parser.parse('4 / 1', new GridNumbers(4)).scalar).toBe(Infinity);
	}
});
const cases = [
	'1/2m', '1/2 m', '2m*3s', '/s', '/(1/s)', '/m.s*kg', 'kg/m.s', 'kg/m*s', 'kg/m s',
	'kg/m s.ampere', '2^3m', 'm/2 s', '2³ m', 'm⁻²', 'kg/m⋅s²', 'kg/m×s²',
	'kg/(m/(s*ampere).mol)', 'kg/(m/(s*ampere)*mol)', '(kg/(m/s)*ampere)^-2',
	'1.3e-2 (kg.s)^2', '(2m/s)⁻²', '-(2)^2', '(-2)^2', '-(-(2))', '- (2 m/s)',
	'2*-(m/s)', '2/-(m/s)', 'm (-2)', '2·-3 m', '- \n2 m', '+ \t.5e2m',
	'm^(1/3)', '(4 m^2)^0.5', '(-8 m^3)^(1/3)', '((16)^.5)^.5', '(4)^- .5',
	'm^5e-1', '(m)^0', 'm0', 'm-2', '(m)2', '1eV', '1Em', 'minch', 'ton(l)',
	' \t2e3 ( kg * m / s ) ^ -2 \n', '123456789012345678901e-3', '-0 m',
	'2', '-.5e2', '2 ** -3', '+2 ^ +3', '2 3 m', '2 (3 m)', '2(3 m)',
];

for (const cache of [{ maxEntries: 0 }, { maxEntries: 128 }])
{
	describe(`Pratt parity, maxEntries=${cache.maxEntries}`, () => {
		const parser = new PrattParser({ cache });
		it.each(cases)('matches Nearley on %j, including a cache hit', input => {
			const expected = reference.parse(input, numeric);
			for (let i = 0; i < 2; i++) expect(parser.parse(input, numeric)).toEqual(expected);
		});
	});
}

it('keeps grammar limits and cache clearing independent under a shared configuration', () => {
	const nearley = new NearleyParser({});
	const pratt = new PrattParser(nearley.config);
	const nested = '('.repeat(300) + 'm' + ')'.repeat(300);
	expect(nearley.parse(nested, numeric).numerator[0].unit).toBe('<meter>');
	expect(nearley.cacheStats.entries).toBe(1);
	expect(pratt.tryParse(nested, numeric).error.code).toBe('LIMIT_EXCEEDED');
	expect(pratt.cacheStats.entries).toBe(0);
	pratt.parse('m', numeric);
	nearley.clearCache();
	expect(pratt.cacheStats.entries).toBe(1);
});

it('matches every catalogue alias, prefix tokenization and compact powers', () => {
	const parser = new PrattParser();
	for (const alias of Object.keys(UnitTokenManager.instance.getMap('unit')))
	{
		for (const input of [alias, `- \t2 ${alias}**2`, `/ ${alias}`, `1 m${alias}/s`])
		{
			const expected = reference.tryParse(input, numeric);
			const actual = parser.tryParse(input, numeric);
			expect(actual.success, input).toBe(expected.success);
			if (expected.success) expect(actual.value, input).toEqual(expected.value);
		}
	}
});

it('matches generated nested expressions and rejects malformed continuations', () => {
	let seed = 0x5eed;
	const choose = values => values[(seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) % values.length];
	function expression(depth) {
		if (!depth) return choose(['m', 'cm', 's', 'minch', '2', '.5', '1e-2', 'm⁻²', 's**2']);
		const a = expression(depth - 1), b = expression(depth - 1);
		return choose([`(${a}*${b})`, `(${a}/${b})`, `(${a}·${b})`, `(${a} ${b})`, `(${a})²`]);
	}
	const parser = new PrattParser();
	for (let i = 0; i < 180; i++)
	{
		const suffix = expression(i % 4);
		for (const scalar of ['2', '-.5e1', '0']) {
			const input = `${scalar} ${suffix}`;
			expect(parser.parse(input, numeric), input).toEqual(reference.parse(input, numeric));
		}
		for (const input of [`2 ${suffix}/`, `2 ${suffix}**`, `2 ${suffix})`, `2 ${suffix}*unknownxyz`])
			expect(parser.tryParse(input, numeric).success, input).toBe(false);
	}
});

it('matches grammar acceptance across adjacent factors and operator combinations', () => {
	const parser = new PrattParser({ cache: { maxEntries: 0 } });
	for (const a of ['2', 'm', '(m)', '-(m)', 'm^2', '2^3', '/m'])
	for (const op of ['', ' ', '*', '/', '.', ' / ', ' / / ', '**', '^', ' +', ' -'])
	for (const b of ['2', '-2', '(m)', 'm', '/s', '2m', '-(m)', 'm^2'])
	{
		const input = a + op + b;
		const actual = parser.tryParse(input, numeric), expected = reference.tryParse(input, numeric);
		expect(actual.success, input).toBe(expected.success);
		if (expected.success) expect(actual.value, input).toEqual(expected.value);
	}
});

it.each([
	['kg/(m*s', 'UNEXPECTED_END', 7], ['m\n / unknown', 'UNKNOWN_UNIT', 5],
	['  123 m/0', 'DIVISION_BY_ZERO', 7], ['m^*', 'UNEXPECTED_TOKEN', 2],
	['m⁻² / nope', 'UNKNOWN_UNIT', 6], ['m^9007199254740992', 'INVALID_EXPONENT', 2],
	[' 1234 -3 m', 'UNEXPECTED_TOKEN', 6], ['m^(1/0)', 'INVALID_EXPONENT', 3],
])('locates errors in the original input %j', (input, code, offset) => {
	const result = new PrattParser().tryParse(input, new BigIntAdapter());
	expect(result.success).toBe(false);
	expect(result.error).toBeInstanceOf(QuantityParseError);
	expect(result.error).toMatchObject({ code, input, offset });
});

it('reports valid next tokens at the end of incomplete expressions', () => {
	const parser = new PrattParser();
	const factor = ['integer', 'lParen', 'sign', 'signedFloat', 'unit'];
	const expression = ['div', ...factor];
	for (const [input, expected] of [
		['', expression], [' \n ', expression], ['2 (', expression], ['m/(', expression],
		['m/', factor], ['/', factor], ['2 m*', factor], ['kg·', factor], ['(12 m /\r\n  ', factor],
		['-', ['lParen']], ['(m', [')']], ['m^', ['integer', 'lParen', 'signedFloat']],
		['m^(', ['integer']], ['m^(1', ['div']], ['m^(1/', ['integer']], ['m^(1/2', [')']],
	]) {
		expect(parser.tryParse(input, numeric), input).toMatchObject({
			success: false, error: { code: 'UNEXPECTED_END', offset: input.length, expected },
		});
	}
});

it('rejects nonstrings and recovers after failure', () => {
	const parser = new PrattParser();
	for (const input of [null, 1, {}, undefined]) expect(parser.tryParse(input, numeric).error.code).toBe('INVALID_INPUT');
	for (const input of ['m**', 'm***2', '2**3**4', '2 -3 m', '(m9007199254740991*m)^0'])
		expect(parser.tryParse(input, numeric).success, input).toBe(false);
	expect(parser.parse('2 m', numeric).scalar.toString()).toBe('2');
});

it.each([NearleyParser, PrattParser])('$name delegates division and locates adapter failures at the slash', Parser => {
	const parser = new Parser();
	const adapter = new NumberAdapter();
	expect(parser.parse('6/0 m', adapter).scalar).toBe(Infinity);
	expect(parser.parse('6/-0 m', adapter).scalar).toBe(-Infinity);
	expect(parser.parse('0/0', adapter).scalar).toBeNaN();
	expect(parser.parse('1/1e-400', numeric).scalar.eq('1e400')).toBe(true);
	const custom = new NumberAdapter();
	custom.div = () => 42;
	custom.compare = custom.toNumber = custom.isInteger = () => { throw new Error('Cannot inspect divisor'); };
	expect(parser.parse('6/0 m', custom).scalar).toBe(42);
	custom.div = () => { throw new RangeError('Unsupported division'); };
	const { error } = parser.tryParse('6/2 m', custom);
	expect(error).toMatchObject({ code: 'INVALID_SCALAR', offset: 1 });
	expect(error.message).toContain('Unsupported division');
});

it.each([NearleyParser, PrattParser])('$name locates implicit multiplication at the start of the right factor', Parser => {
	const parser = new Parser(), failing = new NumberAdapter();
	failing.mul = () => { throw new Error('Cannot multiply these operands'); };
	for (const [input, offset] of [['(2 m)\n   (3 s)', 9], ['123(3 s)', 3], ['123 m\n 3', 7]]) {
		parser.clearCache();
		const expected = { code: 'INVALID_SCALAR', offset, input };
		expect(parser.tryParse(input, failing).error).toMatchObject(expected);
		parser.parse(input.replace('123', '2'), new NumberAdapter());
		expect(parser.tryParse(input, failing).error).toMatchObject(expected);
	}
});

it.each([NearleyParser, PrattParser])('$name locates diagnostics across line terminators', Parser => {
	const parser = new Parser();
	for (const separator of ['\n', '\r\n', '\r', '\u2028', '\u2029']) {
		const input = ['m', ' / unknown', ''].join(separator);
		const { error } = parser.tryParse(input, numeric);
		expect(error).toMatchObject({ code: 'UNKNOWN_UNIT', offset: input.indexOf('unknown'), line: 2, column: 4 });
		expect(error.message.endsWith('\n / unknown\n   ^')).toBe(true);
	}
});

it.each([NearleyParser, PrattParser])('$name reports adapter negation failures at the sign', Parser => {
	const parser = new Parser();
	const adapter = new NumberAdapter();
	parser.parse('-(2 m)', adapter);
	for (const ErrorType of [Error, RangeError]) {
		adapter.neg = () => { throw new ErrorType('Cannot negate this scalar'); };
		const input = '  -(2 m)';
		expect(parser.tryParse(input, adapter)).toMatchObject({
			success: false, error: { code: 'INVALID_SCALAR', offset: 2, input },
		});
	}
});

it('reevaluates cached plans under the supplied backend and precision and relocates errors', () => {
	const parser = new PrattParser();
	for (const precision of [5, 30, 8])
	for (const scalar of ['1', '2', '0', '123456789012345678901']) {
		const adapter = numeric.withConfig({ precision });
		const input = `${scalar}/3*7 m`;
		expect(parser.parse(input, adapter)).toEqual(reference.parse(input, adapter));
	}
	expect(parser.parse('2/3*7 m', new NumberAdapter())).toEqual(reference.parse('2/3*7 m', new NumberAdapter()));
	parser.parse('2/0 m', numeric);
	expect(parser.tryParse('  1234/0 m', new BigIntAdapter()).error)
		.toMatchObject({ code: 'DIVISION_BY_ZERO', offset: 6 });
});

it('handles long flat unit and scalar chains and reports excessive nesting without stack overflow', () => {
	const parser = new PrattParser();
	expect(parser.parse(Array(10000).fill('m').join('*'), numeric).numerator).toEqual([{ unit: '<meter>', exponent: 10000 }]);
	expect(parser.parse('2' + '*2/2'.repeat(1500) + ' m', numeric).scalar.toString()).toBe('2');
	expect(parser.parse('('.repeat(100) + 'm' + ')'.repeat(100), numeric).numerator).toEqual([{ unit: '<meter>', exponent: 1 }]);
	expect(parser.tryParse('('.repeat(300) + 'm' + ')'.repeat(300), numeric).error.code).toBe('LIMIT_EXCEEDED');
	expect(parser.parse('3 m', numeric).scalar.toString()).toBe('3');
});

it('isolates lexer and cursor state during reentrant token resolution', () => {
	const parser = new PrattParser({ cache: { maxEntries: 0 } });
	const manager = UnitTokenManager.instance, original = manager.getUnitToken.bind(manager);
	let entered = false;
	const lookup = vi.spyOn(manager, 'getUnitToken').mockImplementation(value => {
		if (!entered) { entered = true; expect(parser.parse('2 kg', numeric).scalar.toString()).toBe('2'); }
		return original(value);
	});
	try { expect(parser.parse('3 minch*s', numeric)).toEqual(reference.parse('3 minch*s', numeric)); }
	finally { lookup.mockRestore(); }
	expect(entered).toBe(true);
});

it('integrates with Quantity factories, parser overrides and disabled receiver caches', () => {
	const Q = createQuantityClass({ numeric, parser: config => new PrattParser(config) });
	const q = new Q('2 (m/s)^2');
	for (const result of [q.clone(), q.mul(3), q.to('cm2/s2')]) expect(result).toBeInstanceOf(Q);
	expect(q.to('cm2/s2').scalar.toString()).toBe('20000');
	const parser = new PrattParser({});
	const Uncached = Q.withConfig({ cache: false });
	const a = new Uncached('2 m2', undefined, parser), b = new Uncached('3 m2', undefined, parser);
	expect(a.numerator).not.toBe(b.numerator);
	expect(parser.cacheStats.entries).toBe(0);
	const first = parser.parse('2 (km*s)^17', numeric);
	const shared = new PrattParser(parser.config).parse('3 (km*s)^17', numeric);
	expect(shared.numerator).toBe(first.numerator);
	expect(Object.isFrozen(shared.numerator[0])).toBe(true);
});

for (const Parser of [NearleyParser, PrattParser]) {
	it(`${Parser.name} retains physical checks through grouped powers`, () => {
		const parser = new Parser(), Q = createQuantityClass({ numeric, parser: () => parser });
		const Uncached = Q.withConfig({ cache: false });
		for (const input of ['((-20 tempC)^2)^(1/2)', '(1/tempC)^-1', '(m/tempC)^0', '(-300 tempC)^0', '(-300 tempC)^1 * -1',
			'1/(1/tempC)', '/(/tempC)', '(-300 tempC)*-1', '-(-300 tempC)']) {
			const parsed = parser.tryParse(input, numeric);
			expect(parsed.success).toBe(true);
			expect(() => new Q(parsed.value)).toThrow(/temperature/i);
			expect(() => new Q(input)).toThrow(/temperature/i);
			expect(() => new Uncached(input)).toThrow(/temperature/i);
		}
		expect(() => new Q(1, '(tempC^2)^(1/2)')).toThrow(/temperature/i);
		expect(() => new Q('tempC').isCompatible('(tempC^2)^(1/2)')).toThrow(/temperature/i);
		expect(new Q('(-273.15 tempC)^0').scalar.toString()).toBe('1');
		expect(() => new Q('tempC').isCompatible('/(/tempC)')).toThrow(/temperature/i);
		expect(new Q('1/(1/degC)').units()).toBe('degC');
		expect(new Q('(2 tempC)*3').scalar.toString()).toBe('6');
		expect(new Q('2 tempC*m^0').units()).toBe('tempC');
		expect(new Q('((4 degC)^2)^(1/2)').scalar.toString()).toBe('4');
	});

	it.each([true, false])(`${Parser.name} scales absolute readings using the arithmetic boundary rules, cache=%s`, cache => {
		const parser = new Parser(), configure = rounding => createQuantityClass({
			numeric: numeric.withConfig({ precision: 2, rounding }), parser: () => parser, config: { cache },
		});
		const Q = configure('half-even'), Floor = configure('floor');
		for (const input of ['(-270 tempC)*1.012', '1.012*(-270 tempC)', '(-270 tempC)/0.988', '((-270 tempC)*1.012)^0']) {
			const parsed = parser.tryParse(input, new Q(1).numeric);
			expect(parsed.success).toBe(true);
			expect(() => new Q(parsed.value)).toThrow(/absolute zero/);
			expect(() => new Q(input)).toThrow(/absolute zero/);
		}
		for (const [input, method, factor] of [
			['(-270 tempC)*1.01', 'mul', '1.01'], ['1.01*(-270 tempC)', 'mul', '1.01'],
			['(-270 tempC)/0.99', 'div', '0.99'],
		]) {
			const expected = new Floor('-270 tempC')[method](factor);
			expect(new Floor(input).same(expected)).toBe(true);
			expect(new Floor(`(${input})*0.5`).same(expected.mul('0.5'))).toBe(true);
		}
		expect(new Floor('-(273.14 tempC)').same(new Floor('273.14 tempC').mul(-1))).toBe(true);
		expect(new Floor('-273.14 tempC').scalar.toString()).toBe('-273.14');
		expect(new Floor(5, '(-270 tempC)*1.012').scalar.toString()).toBe('5');
		expect(new Q('(5 tempC)/0').scalar.toString()).toBe(new Q('5 tempC').div(0).scalar.toString());
		expect(() => new Q('(-270 tempC)/0')).toThrow('Absolute temperature is outside the numeric backend range');
		expect(() => new Q('-270 tempC').div(0)).toThrow('Absolute temperature is outside the numeric backend range');
		const Native = createQuantityClass({ numeric: new NumberAdapter(), parser: () => parser, config: { cache } });
		expect(new Native('(10 tempC)/2').scalar).toBe(5);
		expect(() => new Native('((2 tempK)*-1)^0')).toThrow(/absolute zero/);
	});

	it(`${Parser.name} checks intermediate base dimensions before reducing powers`, () => {
		const parser = new Parser();
		for (const input of ['(m9007199254740991*ft)^0', '(N4503599627370496)^(1/2)', '1/(N4503599627370496)^0']) {
			expect(parser.tryParse(input, numeric).error).toMatchObject({ code: 'INVALID_EXPONENT' });
		}
		expect(parser.parse('(m9007199254740990*ft)^0', numeric).numerator).toEqual([]);
	});

	it(`${Parser.name} reports the unit that overflows a counted exponent`, () => {
		const parser = new Parser();
		for (const input of ['m9007199254740991*m*s', '  24 /(m9007199254740991*m*s)', '(m9007199254740991*m*s)^0',
			'm9007199254740991*(s*m)^1', '2 m9007199254740991/((s*m)^-1)', 'm9007199254740991*(s*s*m)^2']) {
			const result = parser.tryParse(input, numeric);
			expect(result.error).toMatchObject({ code: 'INVALID_EXPONENT', offset: input.indexOf('*m') + 1 });
		}
		for (const [input, token] of [
			['1/s9007199254740991*N', 'N'],
			['m4503599627370495*ft2*m4503599627370495', 'm4503'],
			['  12 /(s9007199254740991/N) ^0', 'N'],
			['m9007199254740990*(m*ft*m)^1', 'ft'],
		]) expect(parser.tryParse(input, numeric).error).toMatchObject({
			code: 'INVALID_EXPONENT', offset: input.lastIndexOf(token),
		});
	});
}

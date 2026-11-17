import { overrideAdapter } from './helpers/numeric.js';
import { expect, it, vi } from 'vitest';
import { createQuantityClass } from '../dist/factory.js';
import { DecimalScientificAdapter } from '@neutrium/math/adapters/decimal/scientific';
const decimalAdapter = new DecimalScientificAdapter();
import { floatAdapter } from './helpers/numeric.js';
import { RegexParser } from '../dist/parsers/RegexParser.js';
import { NumberAdapter } from '@neutrium/math/adapters/number';

const configure = numeric => createQuantityClass({ numeric, parser: c => new RegexParser(c) });

it('reuses temperature constants across quantities without reconstructing the boundary', () => {
	const from = vi.fn(value => decimalAdapter.from(value));
	const numeric = Object.freeze(overrideAdapter(decimalAdapter, { from }));
	const Q = configure(numeric);

	for (let i = 0; i < 3; i++)
	{
		const value = new Q('20 tempC');
		expect(value.to('tempK').scalar.eq('293.15')).toBe(true);
		expect(value.add('1 degC').scalar.eq(21)).toBe(true);
		expect(value.mul(2).scalar.eq(40)).toBe(true);
	}

	expect(from.mock.calls.filter(([value]) => value === '-273.15')).toHaveLength(1);
});

it.each([decimalAdapter, new NumberAdapter()])('constructs temperature constants once per uncached operation with $id', adapter => {
	const from = vi.fn(value => adapter.from(value));
	const Q = configure(overrideAdapter(adapter, { from })).withConfig({ cache: false });
	const c = new Q('20 tempC'), f = new Q('69 tempF');
	const interval = new Q('1 degC');
	for (let i = 0; i < 2; i++)
	{
		for (const run of [() => expect(c.compareTo(f)).toBe(-1),
			() => expect(adapter.toNumber(c.to('tempF').scalar)).toBeCloseTo(68),
			() => expect(adapter.toNumber(c.to(f).scalar)).toBeCloseTo(68),
			() => expect(adapter.toNumber(f.sub(c).scalar)).toBeCloseTo(1)]) {
			from.mockClear();
			run();
			for (const offset of ['-273.15', '-459.67'])
				expect(from.mock.calls.filter(([value]) => value === offset)).toHaveLength(1);
			if (adapter instanceof NumberAdapter)
				for (const factor of [5n, 9n]) expect(from.mock.calls.filter(([value]) => value === factor)).toHaveLength(1);
		}
		for (const run of [() => c.add(interval), () => c.sub(interval), () => c.mul(2), () => c.div(2)]) {
			from.mockClear();
			run();
			expect(from.mock.calls.filter(([value]) => value === '-273.15')).toHaveLength(1);
		}
	}
});

it('constructs each adapter boundary once per uncached cross-backend copy', () => {
	const source = new NumberAdapter(), receiver = new DecimalScientificAdapter();
	const origin = vi.spyOn(source, 'from'), destination = vi.spyOn(receiver, 'from');
	const Source = configure(source).withConfig({ cache: false });
	const Destination = configure(receiver).withConfig({ cache: false });
	const c = new Source('20 tempC');
	for (let i = 0; i < 2; i++) {
		origin.mockClear(); destination.mockClear();
		expect(new Destination(c).scalar.eq(20)).toBe(true);
		for (const from of [origin, destination])
			expect(from.mock.calls.filter(([value]) => value === '-273.15')).toHaveLength(1);
	}
});

it('keeps uncached target boundaries local to nested and failed conversions with a custom parser', () => {
	const adapter = new NumberAdapter(), from = vi.spyOn(adapter, 'from');
	const Q = configure(adapter).withConfig({ cache: false });
	const nested = new Q('20 tempC');
	const delegate = new RegexParser();
	const parser = { parse(text, ...args) {
		if (text !== 'tempC') expect(nested.to('tempF').scalar).toBeCloseTo(68);
		return delegate.parse(text, ...args);
	} };
	const value = new Q(20, 'tempC', parser);
	expect(() => value.to('unknown')).toThrow();
	from.mockClear();
	expect(value.to('tempF').scalar).toBeCloseTo(68);
	expect(from.mock.calls.filter(([value]) => value === '-459.67')).toHaveLength(2);
});

it('isolates cached boundary scalars and rational offsets by adapter configuration', () => {
	const Wide = configure(decimalAdapter), Narrow = configure(decimalAdapter.withConfig({ maxE: 1 }));
	const Float = configure(floatAdapter);

	for (const Q of [Narrow, Wide, Float, Wide, Narrow])
	{
		const numeric = new Q(1).numeric;
		if (Q === Narrow)
		{
			expect(() => new Q('0 tempK').to('tempC')).toThrow(RangeError);
		}
		else
		{
			const zero = new Q('0 tempK').to('tempC');
			expect(numeric.compare(zero.scalar, numeric.from('-273.15'))).toBe(0);
		}

		const fahrenheit = new Q('1 tempC').to('tempF').scalar;

		if (Q === Float)
		{
			expect(numeric.toNumber(fahrenheit)).toBeCloseTo(33.8, 4);
		}
		else
		{
			expect(fahrenheit.eq('33.8')).toBe(true);
		}
	}
});

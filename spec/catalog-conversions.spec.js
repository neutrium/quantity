import { expect, it } from 'vitest';
import { createQuantityClass } from '../dist/factory.js';
import { DecimalScientificAdapter } from '@neutrium/math/adapters/decimal/scientific';
import { NumberAdapter } from '@neutrium/math/adapters/number';
import { NearleyParser } from '../dist/parsers/NearleyParser.js';
import { PrattParser } from '../dist/parsers/PrattParser.js';
import { RegexParser } from '../dist/parsers/RegexParser.js';
import { Quantity } from '../dist/Quantity.js';

it.each([
	['drum(usp)', 55, 'gal(us)'],
	['BTU', '1055.05585262', 'J'], ['therm', 105506000, 'J'], ['therm(us)', 105480400, 'J'],
	['atm', 760, 'torr'], ['acre', 43560, 'ft2'], ['tbs(us)', 3, 'tsp(us)'],
	['floz(us)', 2, 'tbs(us)'], ['lbf', 1, 'lb*gee'], ['bbl', 42, 'gal(us)'],
	['lbf', 16, 'ozf'], ['psi', 1, 'lbf/in2'], ['psf', 1, 'lbf/ft2'], ['psi', 144, 'psf'],
	['hp', 550, 'ft*lbf/s'], ['pdl', 1, 'lb*ft/s2'], ['reyn', 1, 'psi*s'], ['acre', 4, 'rood'],
	['lbt', 12, 'ozt'], ['ozt', 480, 'grain'], ['ozt', 20, 'dwt'], ['oz', 16, 'dram'],
	['tonlf', 2240, 'lbf'], ['tonsf', 2000, 'lbf'], ['slug', 1, 'lbf*s2/ft'],
	['acre(us)', 10, 'chain(us)^2'], ['chain(us)', 4, 'rod(us)'], ['chain(us)', 100, 'link(us)'],
	['furlong(us)', 10, 'chain(us)'], ['league(us)', 24, 'furlong(us)'],
	['bu', '2150.42', 'in3'], ['bu', 4, 'peck(us)'], ['peck(us)', 2, 'gal(usd)'],
	['gal(usd)', 4, 'qt(usd)'], ['qt(usd)', 2, 'pt(usd)'], ['bl(usd)', 7056, 'in3'],
	['in', 72, 'point'], ['pica', 12, 'point'],
	['cmH2O', 10, 'mmH2O'], ['inH2O', '25.4', 'mmH2O'], ['mmH2O', '9.80665', 'Pa'],
	['cmHg', 10, 'mmHg'], ['inHg', '25.4', 'mmHg'], ['mmHg', '133.322387415', 'Pa'],
	['statmho', 1, 'statA/statV'], ['statH', 1, 'statV*s/statA'], ['statC', 1, 'statA*s'],
	['statV', '299.792458', 'V'], ['floz(us)', 8, 'dr(f)'], ['bl(usl)', '31.5', 'gal(us)'],
])('preserves the exact definition of %s', (unit, count, target) => {
	const one = new Quantity(unit), equivalent = new Quantity(count, target);
	expect(one.to(target).scalar.eq(count)).toBe(true);
	expect(equivalent.to(unit).scalar.eq(1)).toBe(true);
	expect(one.eq(equivalent)).toBe(true);
	expect(equivalent.eq(one)).toBe(true);
});

it('preserves the exact thermochemical BTU ratio', () => {
	expect(new Quantity('9 BTU(th)').eq('9489.1523804 J')).toBe(true);
	expect(new Quantity('9489.1523804 J').to('BTU(th)').scalar.eq(9)).toBe(true);
});

it('converts nepers to decibels at the configured precision', () => {
	const Q = Quantity.withConfig({ numeric: { precision: 35 } });
	expect(new Q('1 Neper').to('dB').scalar.toString()).toBe('8.6858896380650365530225783783321016');
});

it('uses the CODATA 2022 central value for both atomic mass units and daltons', () => {
	for (const unit of ['u', 'Da']) expect(new Quantity(unit).eq('1.66053906892e-27 kg')).toBe(true);
});

it('uses the CODATA 2022 central value for the Planck length', () => {
	expect(new Quantity('Planck').eq('1.616255e-35 m')).toBe(true);
});

it.each([true, false])('keeps logarithmic levels distinct from linear quantities, cache %s', cache => {
	const Q = Quantity.withConfig({ cache });
	const level = new Q('20 dB');
	expect(level.isCompatible('1')).toBe(false);
	expect(level.isCompatible('1/dB')).toBe(false);
	expect(level.isCompatible('Neper')).toBe(true);
	expect(level.isInverse('1/dB')).toBe(true);
	expect(level.to('1/dB').same(level.inverse())).toBe(true);
	expect(level.to('bel').scalar.eq(2)).toBe(true);
	expect(() => level.to('1')).toThrow('Incompatible units');
	expect(() => new Q('1 dB*m').eq('0.1 m')).toThrow('Incompatible units');
});

it('anchors the historical survey units to the exact U.S. survey foot', () => {
	expect(new Quantity('3937 chain(us)').eq('79200 m')).toBe(true);
	expect(new Quantity('league').same(new Quantity('league(us)'))).toBe(true);
});

it.each([NearleyParser, PrattParser, RegexParser])('$name distinguishes decibels from decibytes on input and output', Parser => {
	const Q = createQuantityClass({ numeric: new NumberAdapter(), parser: config => new Parser(config) });
	for (const spelling of ['dB', 'decibel', 'decibels']) {
		const sound = new Q(10, spelling);
		expect(sound.units()).toBe('dB');
		expect(sound.to('bel').scalar).toBe(1);
		expect(sound.isCompatible('B')).toBe(false);
	}
	const data = new Q('10 decibyte');
	expect(data.to('B').scalar).toBe(1);
	expect(new Q(10, data.units()).same(data)).toBe(true);
});

it('preserves exact subdivisions of a revolution and their rates', () => {
	for (const [source, target, factor] of [
		['rev', 'deg', 360], ['deg', 'arcmin', 60], ['arcmin', 'arcsec', 60],
		['rev', 'gon', 400], ['rev', 'amil', 6400], ['rev', 'cpoint', 32],
		['rev', 'octant', 8], ['rev', 'quadrant', 4], ['rev', 'sextant', 6],
		['rev/s', 'Hz', 1], ['Hz', 'rpm', 60], ['rpm', 'rev/min', 1],
	]) {
		const one = new Quantity(source);
		const equivalent = new Quantity(factor, target);
		expect(one.to(target).scalar.toString(), source + ' to ' + target).toBe(String(factor));
		expect(equivalent.eq(one)).toBe(true);
	}
});

it('accepts standard and historical spellings of becquerel and millennium', () => {
	for (const name of ['becquerel', 'becquerels', 'bequerel', 'bequerels']) {
		expect(new Quantity(name).units()).toBe('Bq');
	}
	for (const name of ['millennium', 'millennia', 'millenniums', 'millenium', 'millienia']) {
		expect(new Quantity(name).units()).toBe('millennium');
	}
});

function expectScalar(quantity, expected)
{
	if (typeof quantity.scalar === 'number')
	{
		// Relative tolerance also detects incorrect constants at very small magnitudes.
		expect(quantity.scalar / Number(expected)).toBeCloseTo(1, 14);
	}
	else
	{
		expect(quantity.scalar.eq(expected)).toBe(true);
	}
}

for (const Adapter of [DecimalScientificAdapter, NumberAdapter])
{
	for (const Parser of [NearleyParser, RegexParser]) for (const cache of [true, false])
	{
		const Q = createQuantityClass({ numeric: new Adapter(), parser: c => new Parser(c), config: { cache } });
		const context = `${Adapter.name}, ${Parser.name}, cache ${cache}`;

		it(`converts roentgens as exposure rather than absorbed dose: ${context}`, () => {
			const exposure = new Q('1 roentgen');
			expect(exposure.isCompatible('coulomb/kg')).toBe(true);
			expect(exposure.toBase().units()).toBe('A*s/kg');
			for (let repeat = 0; repeat < 2; repeat++) {
				expectScalar(exposure.to('coulomb/kg'), '0.000258');
				expectScalar(new Q('0.000258 coulomb/kg').to('roentgen'), '1');
				expectScalar(new Q('1 milliroentgen').to('coulomb/kg'), '0.000000258');
			}
			expectScalar(exposure.mul('1 kg').to('coulomb'), '0.000258');
			for (const unit of ['Gy', 'Sv', 'J/kg']) {
				expect(exposure.isCompatible(unit)).toBe(false);
				expect(() => exposure.to(unit)).toThrow('Incompatible units');
				expect(() => exposure.add(new Q(1, unit))).toThrow('Incompatible units');
				expect(() => exposure.compareTo(new Q(1, unit))).toThrow('Incompatible units');
			}
			expect(new Q('R').units()).toBe('degR'); // Preserve the existing temperature alias.
		});

		it(`uses the exact SI electronvolt definition: ${context}`, () => {
			const energy = new Q('1 eV');
			for (let repeat = 0; repeat < 2; repeat++) {
				expectScalar(energy.to('J'), '1.602176634e-19');
				expectScalar(new Q('1.602176634e-19 J').to('eV'), '1');
				expectScalar(new Q('1 keV').to('J'), '1.602176634e-16');
			}
			expectScalar(energy.add('1.602176634e-19 J'), '2');
		});
	}
}

it('derives a parsec from the astronomical unit and the catalog arcsecond', () => {
	expect(new Quantity('1 pc*arcsec').eq('1 AU*rad')).toBe(true);
	expect(new Quantity('1 pc').to('m').scalar.toString()).toBe('30856775814913672.789');
});

it.each([NearleyParser, PrattParser, RegexParser])('accepts standard yobi and historical yebi aliases with $name', Parser => {
	const Q = createQuantityClass({ numeric: new DecimalScientificAdapter(), parser: c => new Parser(c) });
	for (const prefix of ['yobi', 'Yobi', 'yebi', 'Yebi']) {
		expect(new Q(prefix + 'byte').eq('1024 ZiB')).toBe(true);
		expect(new Q(prefix + 'bit').eq('128 ZiB')).toBe(true);
	}
});

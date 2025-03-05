import { suite, add, cycle, save, complete } from 'benny'
import { NearleyQtyParser } from '../dist/parsers/NearleyQtyParser.js'
import { RegexQtyParser } from '../dist/parsers/RegexQtyParser.js';

export default suite(
	'Test Parsing',

	add('Parse 1m Regex', () => {
		let parser = new RegexQtyParser(),
			result = parser.parse("1m");
	}),

	add('Parse 1m Nearley', () => {
		let parser = new NearleyQtyParser(),
			result = parser.parse("1m");
	}),

	add('Parse 1m/s Regex', () => {
		let parser = new RegexQtyParser(),
			result = parser.parse("1m/s");
	}),

	add('Parse 1m/s Nearley', () => {
		let parser = new NearleyQtyParser(),
			result = parser.parse("1m/s");
	}),

	add('Parse 1m/s^2 Regex', () => {
		let parser = new RegexQtyParser(),
			result = parser.parse("1m/s^2");
	}),

	add('Parse 1m/s^2 Nearley', () => {
		let parser = new NearleyQtyParser(),
			result = parser.parse("1m/s^2");
	}),

	add('Parse 3.5 kg.m/s^2 Regex', () => {
		let parser = new RegexQtyParser(),
			result = parser.parse("3.5 kg.m/s^2");
	}),

	add('Parse 3.5 kg.m/s^2 Nearley', () => {
		let parser = new NearleyQtyParser(),
			result = parser.parse("3.5 kg.m/s^2");
	}),

	cycle(),
	complete(),
	save({ file: 'parser', version: '1.0.0' }),
	save({ file: 'parser', format: 'chart.html' }),
)
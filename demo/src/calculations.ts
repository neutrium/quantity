import { Quantity } from '@neutrium/quantity';
import { QuantityParseError } from '@neutrium/quantity/parsers/nearley';

export const operations = {
	to: 'Convert units',
	toBase: 'Convert to base units',
	add: 'Add',
	sub: 'Subtract',
	mul: 'Multiply',
	div: 'Divide',
	pow: 'Raise to a power',
	inverse: 'Take the inverse',
	eq: 'Check equality',
	isCompatible: 'Check compatibility',
} as const;

export type Operation = keyof typeof operations;
export const roundingModes = ['half-up', 'half-even', 'down', 'up', 'floor', 'ceil'] as const;
export type Rounding = typeof roundingModes[number];

export interface Calculation
{
	value: string;
	operation: Operation;
	operand: string;
	precision?: number;
	rounding?: Rounding;
}

export class CalculationError extends Error
{
	constructor(message: string, readonly field?: 'value' | 'operand' | 'precision' | 'rounding', cause?: unknown)
	{
		super(message, { cause });
		this.name = 'CalculationError';
	}
}

const operationErrors: Record<string, string> = {
	'Incompatible units': 'These units are not compatible. Use units that measure the same dimension.',
	'Temperatures must not be less than absolute zero': 'A temperature cannot be below absolute zero (−273.15 tempC).',
	'Cannot add two temperatures': 'Two absolute temperatures cannot be added. Use an interval such as 10 degC for the second quantity.',
	'Cannot subtract a temperature from a differential degree unit': 'An absolute temperature cannot be subtracted from a temperature interval.',
	'Cannot multiply by temperatures': 'Absolute temperatures can only be multiplied by a unitless scalar.',
	'Cannot divide with temperatures': 'Absolute temperatures can only be divided by a unitless scalar and cannot be used as divisors.',
	'Raising quantities to a fractional power not currently supported': 'Enter a safe integer power; fractional powers are not supported.',
	'Divide by zero': 'Cannot divide by zero. Use a nonzero quantity.',
};

export function errorMessage(error: unknown): string
{
	if (error instanceof CalculationError)
	{
		return error.message;
	}

	return (error instanceof Error && Object.hasOwn(operationErrors, error.message) && operationErrors[error.message])
		|| 'Unable to calculate this expression. Check the quantities, units, and operation.';
}

function inputError(cause: unknown, field: 'value' | 'operand', targetUnits = false): CalculationError
{
	const label = field === 'value' ? 'Quantity' : targetUnits ? 'Target units' : 'Second quantity';
	if (cause instanceof QuantityParseError)
	{
		const messages = {
			UNKNOWN_UNIT: 'Unit not recognised. Check its spelling.',
			UNEXPECTED_TOKEN: 'Check the operators and parentheses.',
			UNEXPECTED_END: 'Expression is incomplete. Check for a missing unit or closing parenthesis.',
			INVALID_EXPONENT: 'Unit powers must be safe integers.',
			DIVISION_BY_ZERO: 'Cannot divide by zero inside an expression.',
			INVALID_SCALAR: 'Enter a valid scalar value.',
			INVALID_INPUT: 'Enter a quantity expression.',
			AMBIGUOUS_EXPRESSION: 'Use explicit operators or parentheses to clarify the expression.',
		};
		return new CalculationError(`${label}, column ${cause.column}: ${messages[cause.code]}`, field, cause);
	}
	return new CalculationError(errorMessage(cause), field, cause);
}

function parseQuantity(text: string, field: 'value' | 'operand', Constructor: typeof Quantity): Quantity
{
	if (!text.trim()) throw new CalculationError(`Enter ${field === 'value' ? 'a quantity' : 'a second quantity'}, such as 1 m.`, field);
	try { return new Constructor(text); }
	catch (cause) { throw inputError(cause, field); }
}

export const presets: (Calculation & { label: string; note: string })[] = [
	{ label: 'Length', value: '1 m', operation: 'to', operand: 'ft', note: 'Convert a measurement while preserving its physical dimensions. Try cm, inch, or yd as the target.' },
	{ label: 'Road speed', value: '100 km/h', operation: 'to', operand: 'm/s', note: 'Compound units work just like simple units. Both the distance and time scales are converted.' },
	{ label: 'Pressure', value: '1 bar', operation: 'to', operand: 'psi', note: 'Named engineering units can be converted to other compatible units, including compound expressions.' },
	{ label: 'Temperature', value: '100 tempC', operation: 'to', operand: 'tempF', note: 'Use tempC and tempF for absolute temperatures. Their conversion includes a zero-point offset.' },
	{ label: 'Temperature rise', value: '10 degC', operation: 'to', operand: 'degF', note: 'Use degC and degF for temperature intervals. A change of 10 °C is a change of 18 °F.' },
	{ label: 'Mixed units', value: '1 m', operation: 'add', operand: '25 cm', note: 'Addition converts the second quantity into the first quantity’s units before combining the scalars.' },
	{ label: 'Distance ÷ time', value: '150 km', operation: 'div', operand: '2 h', note: 'Arithmetic tracks units as well as values. Dividing distance by time gives a speed.' },
	{ label: 'Area', value: '3 m', operation: 'pow', operand: '2', note: 'Integer powers apply to both the scalar and the units: squaring a length produces an area.' },
	{ label: 'Compound units', value: '1 kg*(m/s)^2', operation: 'to', operand: 'J', note: 'The default parser supports parentheses, multiplication, division, and integer powers.' },
	{ label: 'Scalar expression', value: '1/2 m', operation: 'to', operand: 'cm', note: 'The default parser evaluates scalar multiplication and division. Use parentheses when grouping is important.' },
	{ label: 'Grouped denominator', value: '2 kg/(m*s)', operation: 'toBase', operand: '', note: 'Groups no longer need an explicit power. Compound denominators are displayed with tightly coupled dots: kg/m.s.' },
	{ label: 'Target units only', value: '1000 cm', operation: 'to', operand: '2 m', note: 'Conversion uses only the target units, ignoring its scalar. To calculate how many 2 m lengths fit, divide by 2 m instead.' },
	{ label: 'Precision', value: '1 m', operation: 'div', operand: '3', precision: 30, rounding: 'half-even', note: 'withConfig() creates an isolated Quantity class. Precision counts significant digits, not decimal places.' },
	{ label: 'Binary prefixes', value: '1 MiB', operation: 'to', operand: 'byte', note: 'Binary prefixes use powers of 1024. SI prefixes, such as MB, use powers of 1000.' },
	{ label: 'Equal measures', value: '1 m', operation: 'eq', operand: '100 cm', note: 'Equality compares physical values, so quantities can be equal even when their units differ.' },
];

export function formatQuantity(quantity: Quantity): string
{
	const scalar = quantity.scalar.toString();
	const units = quantity.units();
	return units.startsWith('1/')
		? scalar + units.slice(1)
		: [scalar, units].filter(Boolean).join(' ');
}

export function calculate({ value, operation, operand, precision = 20, rounding = 'half-up' }: Calculation)
{
	if (!Number.isInteger(precision) || precision < 1 || precision > 100)
	{
		throw new CalculationError('Choose 1 to 100 significant digits for this demo.', 'precision');
	}
	if (!roundingModes.includes(rounding)) throw new CalculationError('Choose a supported rounding mode.', 'rounding');
	const ConfiguredQuantity = Quantity.withConfig({ precision, rounding });
	const input = parseQuantity(value, 'value', ConfiguredQuantity);
	const unary = operation === 'toBase' || operation === 'inverse';
	const argument = operand;
	let result: Quantity | boolean;

	if (operation === 'pow')
	{
		if (!operand.trim()) throw new CalculationError('Enter a safe integer power.', 'operand');
		try { result = input.pow(operand); }
		catch (cause) {
			throw new CalculationError(cause instanceof RangeError
				? 'The power or resulting dimensions exceed the safe integer range.'
				: errorMessage(cause), 'operand', cause);
		}
	}
	else if (unary)
	{
		result = input[operation]();
	}
	else if (operation === 'to')
	{
		if (!operand.trim()) throw new CalculationError('Enter target units, such as ft.', 'operand');
		try { result = input.to(operand); }
		catch (cause) { throw inputError(cause, 'operand', true); }
	}
	else
	{
		const other = parseQuantity(operand, 'operand', ConfiguredQuantity);
		result = input[operation](other);
	}

	const quantity = typeof result === 'boolean' ? input : result;
	const output = typeof result === 'boolean' ? String(result) : formatQuantity(result);
	const code = [
		"import { Quantity } from '@neutrium/quantity';",
		'',
		`const ConfiguredQuantity = Quantity.withConfig({ precision: ${precision}, rounding: ${JSON.stringify(rounding)} });`,
		`const quantity = new ConfiguredQuantity(${JSON.stringify(value)});`,
		`const result = quantity.${operation}(${unary ? '' : JSON.stringify(argument)});`,
		'',
		...(typeof result === 'boolean'
			? [`console.log(result); // ${result}`]
			: [`result.scalar.toString(); // ${JSON.stringify(result.scalar.toString())}`, `result.units(); // ${JSON.stringify(result.units())}`]),
	].join('\n');

	return {
		output,
		code,
		base: formatQuantity(quantity.toBase()),
		units: quantity.units() || 'Unitless',
		type: quantity.isTemperature() ? 'Absolute temperature' : quantity.isDegrees() ? 'Temperature interval' : quantity.isUnitless() ? 'Dimensionless' : 'Physical quantity',
		comparison: typeof result === 'boolean',
	};
}

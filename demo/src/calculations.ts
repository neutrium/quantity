import { Quantity } from '@neutrium/quantity';

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

export interface Calculation
{
	value: string;
	operation: Operation;
	operand: string;
}

export class CalculationError extends Error
{
	constructor(message: string, readonly field?: 'value' | 'operand', cause?: unknown)
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
	'Divide by zero': 'Cannot divide by zero. Use a nonzero quantity.',
};

export function errorMessage(error: unknown): string
{
	if (error instanceof CalculationError)
	{
		return error.message;
	}

	return (error instanceof Error && operationErrors[error.message])
		|| 'Unable to calculate this expression. Check the quantities, units, and operation.';
}

function parseQuantity(text: string, field: 'value' | 'operand', targetUnits = false): Quantity
{
	const label = field === 'value' ? 'Quantity' : targetUnits ? 'Target units' : 'Second quantity';
	const example = targetUnits ? 'ft or m/s' : '1 m or 100 km/h';

	if (!text.trim())
	{
		throw new CalculationError(`Enter ${label.toLowerCase()}, such as ${example}.`, field);
	}

	try
	{
		return new Quantity(text);
	}
	catch (cause)
	{
		const message = cause instanceof Error && operationErrors[cause.message];
		throw new CalculationError(message || `${label} not recognised. Check the unit spelling and expression syntax, for example ${example}.`, field, cause);
	}
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
	{ label: 'Binary prefixes', value: '1 MiB', operation: 'to', operand: 'byte', note: 'Binary prefixes use powers of 1024. SI prefixes, such as MB, use powers of 1000.' },
	{ label: 'Equal measures', value: '1 m', operation: 'eq', operand: '100 cm', note: 'Equality compares physical values, so quantities can be equal even when their units differ.' },
];

export const formatQuantity = (quantity: Quantity) =>
	[quantity.scalar.toString(), quantity.units()].filter(Boolean).join(' ');

export function calculate({ value, operation, operand }: Calculation)
{
	const input = parseQuantity(value, 'value');
	const unary = operation === 'toBase' || operation === 'inverse';
	let argument: string | number = operand;
	let result: Quantity | boolean;

	if (operation === 'pow')
		{
		argument = Number(operand);

		if (!operand.trim() || !Number.isInteger(argument) || Math.abs(argument) > 12)
		{
			throw new CalculationError('For this demo, use an integer power between −12 and 12.', 'operand');
		}

		result = input.pow(argument);

	}
	else if (unary)
	{
		result = input[operation]();
	}
	else
	{
		const other = parseQuantity(operand, 'operand', operation === 'to');
		result = input[operation](other);
	}

	const quantity = typeof result === 'boolean' ? input : result;
	const output = typeof result === 'boolean' ? String(result) : formatQuantity(result);
	const code = [
		"import { Quantity } from '@neutrium/quantity';",
		'',
		`const quantity = new Quantity(${JSON.stringify(value)});`,
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

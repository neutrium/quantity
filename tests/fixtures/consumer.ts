import { Decimal } from '@neutrium/decimal';
import { Quantity } from '@neutrium/quantity';
import { NearleyQtyParser, RegexQtyParser } from '@neutrium/quantity/parsers.js';
import { isQuantity, isQuantityDefinition, type QuantityInitParam } from '@neutrium/quantity/guards.js';

const scalar: Decimal = new Quantity('1 km').to('m').scalar;
const input: QuantityInitParam = new Decimal('0.1');
const quantity: Quantity = new Quantity(input, 'm').mul(3);

for (const parser of [new NearleyQtyParser(), new RegexQtyParser()])
{
	const parsed = parser.parse('2 m');
	const result: Quantity = new Quantity(parsed);
	const valid: boolean = isQuantity(result) && isQuantityDefinition(parsed);
}

const unknownValue: unknown = quantity;

if (isQuantity(unknownValue))
{
	const result: Decimal = unknownValue.scalar;
}

// @ts-expect-error Units must be supplied as a string.
new Quantity(1, 2);
// @ts-expect-error Powers require a decimal, number or string.
quantity.pow({});

// Configured entry points share the same core type and runtime guard.
import { Quantity as RegexQuantity } from '@neutrium/quantity/regex';
import { createQuantityClass, QuantityCore } from '@neutrium/quantity/core';
import { RegexQtyParser as DirectRegexParser } from '@neutrium/quantity/parsers/regex';
import { NearleyQtyParser as DirectNearleyParser } from '@neutrium/quantity/parsers/nearley';
import { QuantityParseError, type QuantityParseErrorCode, type QuantityParseResult } from '@neutrium/quantity/parsers/nearley';
const parsedExpression: QuantityParseResult<import('@neutrium/quantity/core').QuantityDefinition> = new DirectNearleyParser().tryParse('m/2');

if (parsedExpression.success)
{
	const expressionScalar: Decimal = parsedExpression.value.scalar;
	// @ts-expect-error Successful parse results do not have an error.
	parsedExpression.error;
}
else
{
	const parseError: QuantityParseError = parsedExpression.error;
	const errorCode: QuantityParseErrorCode = parseError.code;
	const errorOffset: number = parseError.offset;
	// @ts-expect-error Failed parse results do not have a value.
	parsedExpression.value;
}
const CustomQuantity = createQuantityClass(() => new DirectRegexParser());
const customQuantity = new CustomQuantity('1e3 m').clone().add('1e3 m');
const regexQuantity = new RegexQuantity('1e3 m');
new DirectNearleyParser().parse('m');
const coreQuantity: QuantityCore = customQuantity;
const compatibleQuantity: Quantity = regexQuantity;
const typedResult: Quantity = customQuantity;

// The core always requires a parser, including when copying a definition.
// @ts-expect-error A parser must be provided to the core constructor.
new QuantityCore(regexQuantity);
// @ts-expect-error Undefined is not a valid core parser.
new QuantityCore(regexQuantity, undefined, undefined);
const parsedCore = new QuantityCore(regexQuantity, undefined, new DirectRegexParser());
const parsedCoreResult: QuantityCore = parsedCore.add(regexQuantity);

// v5 exposes counted units, with frozen records and arrays.
import type { UnitPower, QuantityDefinition } from '@neutrium/quantity/core';
const countedUnit: UnitPower = { unit: '<meter>', prefix: '<kilo>', exponent: 1000000 };
const definition: QuantityDefinition = { scalar: new Decimal(1), numerator: [countedUnit], denominator: [] };
const countedQuantity = new Quantity(definition);
const countedDenominator: readonly UnitPower[] = countedQuantity.denominator;
const dimensionalSignature: string | null = countedQuantity.signature;
// @ts-expect-error Repeated token strings were replaced by counted records in v5.
const oldDefinition: QuantityDefinition = { scalar: new Decimal(1), numerator: ['<meter>'], denominator: [] };
// @ts-expect-error Counted records are immutable.
countedUnit.exponent = 2;
// @ts-expect-error Counted arrays are immutable.
countedQuantity.numerator.push(countedUnit);
// @ts-expect-error Unit arrays cannot be reassigned.
countedQuantity.numerator = [];

// Comparison inputs and unordered results match their runtime contracts.
for (const comparable of [quantity, regexQuantity, coreQuantity])
{
	const order: -1 | 0 | 1 | undefined = comparable.compareTo('1 m');
	if (order !== undefined) { const ordered: -1 | 0 | 1 = order; }
	// @ts-expect-error An unordered comparison can return undefined.
	const alwaysOrdered: number = comparable.compareTo(quantity);
	comparable.compareTo(1);
	comparable.eq(1);
	comparable.lt(1);
	comparable.lte(1);
	comparable.gt(1);
	comparable.gte(1);
	comparable.eq(new Decimal(1));
	comparable.lt(new Decimal(1));
	comparable.lte(new Decimal(1));
	comparable.gt(new Decimal(1));
	comparable.gte(new Decimal(1));
	const numericOrder: -1 | 0 | 1 | undefined = comparable.compareTo(new Decimal(1));
	// @ts-expect-error Boolean comparison operands are unsupported.
	comparable.eq(true);
	// @ts-expect-error Plain definitions must first be constructed as quantities.
	comparable.compareTo(definition);
}

if (isQuantityDefinition(unknownValue))
{
	const checkedScalar: Decimal = unknownValue.scalar;
	const checkedNumerator: readonly UnitPower[] = unknownValue.numerator;
	const checkedDefinition: QuantityDefinition = unknownValue;
}
isQuantityDefinition(null);
isQuantityDefinition(undefined);

// Isolated configuration is available on every entry point and preserves constructor types.
import type { DecimalConfigInput, DecimalConstructor } from '@neutrium/quantity/core';
const settings: DecimalConfigInput = { precision: 30, rounding: 'half-up' };
const EngineeringQuantity = Quantity.withConfig(settings);
const isolated: Quantity = new EngineeringQuantity('1 ft');
const RegexConfigured = RegexQuantity.withConfig({ precision: 6 });
new RegexConfigured('1 m').to('cm');
const CustomConfigured = CustomQuantity.withConfig(settings);
new CustomConfigured('2 m');
const ConfiguredCore = QuantityCore.withConfig(settings);
new ConfiguredCore('1 m', undefined, new DirectRegexParser());
// @ts-expect-error Configured core still requires a parser.
new ConfiguredCore('1 m');
const scalarParser = createQuantityClass(() => ({ parse(text: string, Numeric: DecimalConstructor = Decimal) {
	return { scalar: new Numeric(text), numerator: [], denominator: [] };
} })).withConfig({ precision: 10 });
new scalarParser('1').div(3);
const effectivePrecision: number = isolated.config.precision;
// @ts-expect-error Configuration snapshots are readonly.
EngineeringQuantity.config.precision = 2;
// @ts-expect-error Rounding modes are validated by the public type.
Quantity.withConfig({ rounding: 'unknown' });
class SpecializedQuantity extends Quantity { identify() { return 'special'; } }
const SpecializedConfigured = SpecializedQuantity.withConfig(settings);
const identity: string = new SpecializedConfigured('1 m').identify();

// Quantity values cannot be reassigned; cached values have no public setter.
for (const immutable of [quantity, regexQuantity, coreQuantity, isolated]) {
	// @ts-expect-error Scalars are read-only.
	immutable.scalar = new Decimal(2);
	// @ts-expect-error Dimensional signatures are read-only.
	immutable.signature = 'invalid';
	// @ts-expect-error Base values are computed internally.
	immutable.baseScalar = new Decimal(2);
	// @ts-expect-error Denominator arrays cannot be replaced.
	immutable.denominator = [];
	// @ts-expect-error Original input cannot be replaced.
	immutable.initValue = '2 m';
}

// Numeric constructor inputs create dimensionless quantities.
import type { NumericStringifiable } from '@neutrium/quantity/core';
const numericObject: NumericStringifiable = { toString: () => '1.234567890123456789' };
for (const Constructor of [Quantity, RegexQuantity, CustomQuantity]) {
	const numeric: QuantityCore = new Constructor(2).add(3).sub(new Decimal(1));
	const decimal: QuantityCore = new Constructor(new Decimal(2));
	const text: QuantityCore = new Constructor(numericObject);
	const boxed: QuantityCore = new Constructor(new Number(2));
}
// @ts-expect-error Booleans are not scalar objects or numbers.
new Quantity(true);
// @ts-expect-error Numeric object serialization must return a string.
new Quantity({ toString: () => 2 });

// Numerical and parser configuration use one API across entry points.
import type { QuantityConfigInput, ParserConfig, ParserCacheStats } from '@neutrium/quantity/core';
const combinedSettings: QuantityConfigInput = {
	precision: 30, parser: { cache: { maxEntries: 512, maxBytes: 1048576 } },
};
for (const Constructor of [Quantity, RegexQuantity, CustomQuantity]) {
	const Configured = Constructor.withConfig(combinedSettings);
	const settings: ParserConfig = Configured.parserConfig;
	const actual: ParserConfig = new Configured('2 m').parserConfig;
}
const CacheConfigured = createQuantityClass(config => new DirectRegexParser(config)).withConfig(combinedSettings);
new CacheConfigured('2 m').to('cm');
const boundedParser = new DirectNearleyParser({ cache: { maxBytes: 1024 } });
const stats: ParserCacheStats = boundedParser.cacheStats;
boundedParser.clearCache();
new DirectRegexParser({ cache: { maxEntries: 0 } });
// @ts-expect-error Budgets are numbers.
Quantity.withConfig({ parser: { cache: { maxBytes: '1024' } } });
// @ts-expect-error Unknown parser settings are rejected.
Quantity.withConfig({ parser: { precision: 10 } });
// @ts-expect-error Parser snapshots are deeply readonly.
boundedParser.config.cache.maxBytes = 0;
// @ts-expect-error Cache statistics cannot be changed.
stats.estimatedBytes = 0;

// Custom-parser subclasses preserve their constructor and statics through configuration.
class CustomSpecialized extends CustomQuantity {
	static category = 'special';
	identify() { return 'custom'; }
}
const SpecializedCustom = CustomSpecialized.withConfig({ conversionCache: { maxBytes: 4096 } })
	.withConfig({ precision: 12 });
const customIdentity: string = new SpecializedCustom('1 m').identify();
const customCategory: string = SpecializedCustom.category;
import type { CacheConfig, CacheConfigInput } from '@neutrium/quantity/core';
const conversionLimits: CacheConfigInput = { maxEntries: 64, maxBytes: 65536 };
for (const Constructor of [Quantity, RegexQuantity, CustomQuantity]) {
	const Q = Constructor.withConfig({ conversionCache: conversionLimits, precision: 8 });
	const limits: CacheConfig = new Q('1 m').conversionCacheConfig;
	const classLimits: CacheConfig = Q.conversionCacheConfig;
}
// @ts-expect-error Conversion budgets must be numeric.
Quantity.withConfig({ conversionCache: { maxBytes: '1024' } });
// @ts-expect-error Effective conversion settings are immutable.
SpecializedCustom.conversionCacheConfig.maxEntries = 0;

import type { Parser } from '@neutrium/quantity/core';
class CustomConstructor extends CustomQuantity {
	readonly label: string;
	constructor(input: QuantityInitParam, private readonly required: { label: string },
		units?: string, parser?: Parser<QuantityDefinition>) {
		super(input, units, parser);
		this.label = required.label;
	}
	protected override constructQuantity(input: QuantityInitParam, units: string | undefined,
		parser: Parser<QuantityDefinition>): CustomConstructor {
		const Constructor = this.constructor as typeof CustomConstructor;
		return new Constructor(input, this.required, units, parser);
	}
}
const ConfiguredConstructor = CustomConstructor.withConfig({ precision: 12 });
new ConfiguredConstructor('1 m', { label: 'test' });
// @ts-expect-error Configuration must preserve required subclass constructor arguments.
new ConfiguredConstructor('1 m');
const subclassValue = new ConfiguredConstructor('1 m', { label: 'length' });
subclassValue.clone().add('2 m').to('cm');
// @ts-expect-error The subclass construction hook is protected, not a public factory.
subclassValue.constructQuantity('1 m', undefined, new DirectRegexParser());

// UnitStructure expresses counted units without requiring a scalar.
import type { UnitStructure } from '@neutrium/quantity/core';
const unitStructure: UnitStructure = { numerator: [countedUnit], denominator: [] };
const quantityUnits: UnitStructure = quantity;
const parsedUnits: UnitStructure = new DirectNearleyParser().parse('m/s');
const definitionWithUnits: QuantityDefinition = { ...unitStructure, scalar: new Decimal(2) };
const definitionUnits: UnitStructure = definitionWithUnits;
// Replacing sides on external definitions remains supported.
definitionWithUnits.numerator = [];
unitStructure.denominator = [countedUnit];
// @ts-expect-error UnitStructure has no scalar.
unitStructure.scalar;
// @ts-expect-error A full quantity definition still requires a scalar.
const missingScalar: QuantityDefinition = unitStructure;
// @ts-expect-error Unit arrays remain readonly.
unitStructure.numerator.push(countedUnit);

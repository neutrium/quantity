import { Quantity } from '@neutrium/quantity';
import { Quantity as RegexQuantity } from '@neutrium/quantity/regex';
import { Quantity as DoubleQuantity } from '@neutrium/quantity/number';
import { createQuantityClass, Quantity as SharedQuantity, type QuantityInput, type Parser, type QuantityDefinition, type UnitPower } from '@neutrium/quantity/factory';
import { NearleyParser, RegexParser } from '@neutrium/quantity/parsers.js';
import { QuantityParseError } from '@neutrium/quantity/parsers/nearley';
import { isQuantity, isQuantityDefinition } from '@neutrium/quantity/guards.js';
import { DecimalScientificAdapter } from '@neutrium/utilities/decimal/scientific';
const decimalAdapter = new DecimalScientificAdapter();
import { DecimalArithmeticAdapter } from '@neutrium/utilities/decimal/arithmetic';
import { NumberAdapter } from '@neutrium/utilities/number';
const numberAdapter = new NumberAdapter();
import type { ArithmeticAdapter } from '@neutrium/utilities/numeric/arithmetic';
import type { Decimal } from '@neutrium/decimal';

const decimal: Decimal = new Quantity('1 km').to('m').scalar;
const native: number = new DoubleQuantity('1 km').to('m').scalar;
const NumberRegex = createQuantityClass({ numeric: numberAdapter, parser: c => new RegexParser(c) });
const Arithmetic = createQuantityClass({ numeric: new DecimalArithmeticAdapter({ precision: 12 }), parser: c => new NearleyParser(c) });
const a: number = new NumberRegex('2 m').add('300 cm').scalar;
const c: string = new Arithmetic('2 m').pow(3).scalar.toString();
const genericNumber: Quantity<number> = new NumberRegex('2 m');
const genericDecimal: Quantity<Decimal> = new Quantity('2 m');
const copiedDecimal: Decimal = new Quantity(genericNumber).scalar;
const copiedNumber: number = new DoubleQuantity(genericDecimal).scalar;
// Unit-only operations accept any backend and retain the receiver's scalar type.
const convertedDecimal: Decimal = genericDecimal.to(genericNumber).scalar;
const convertedNumber: number = genericNumber.to(genericDecimal).scalar;
const compatible: boolean = genericDecimal.isCompatible(genericNumber);
const inverse: boolean = genericNumber.isInverse(genericDecimal);
const opaqueTarget: SharedQuantity<unknown> = genericDecimal;
new DoubleQuantity('1 m').to(opaqueTarget);
const shared: SharedQuantity<number> = genericNumber;
// @ts-expect-error Backend selection belongs to the factory.
new Quantity<number>('2 m');
// @ts-expect-error Different scalar types are not interchangeable.
const mismatch: Quantity<number> = genericDecimal;
// @ts-expect-error Number scalars are not Decimal objects.
const wrongDecimal: Decimal = native;
// @ts-expect-error Units must be strings.
new Quantity(1, 2);
// @ts-expect-error Booleans are not numeric inputs.
new Quantity(true);
// @ts-expect-error A numeric stringifier must return a string.
new Quantity({ toString: () => 2 });

for (const parser of [new NearleyParser(), new RegexParser()]) {
    const result = parser.parse('2 m', decimalAdapter);
    const parsed: Decimal = result.scalar;
    const numeric = parser.parse('2 m', numberAdapter);
    const scalar: number = numeric.scalar;
    const valid = isQuantityDefinition(numeric, numberAdapter);
}
const parsed = new NearleyParser().tryParse('m/2', numberAdapter);
if (parsed.success) {
    const value: number = parsed.value.scalar;
    // @ts-expect-error Successful parsing has no error.
    parsed.error;
} else {
    const error: QuantityParseError = parsed.error;
    // @ts-expect-error Failed parsing has no value.
    parsed.value;
}
const unknown: unknown = genericNumber;
if (isQuantity(unknown)) { const scalar: unknown = unknown.scalar; }
if (isQuantityDefinition(unknown, numberAdapter)) { const scalar: number = unknown.scalar; }

const unit: UnitPower = { unit: '<meter>', exponent: 2 };
const definition: QuantityDefinition<number> = { scalar: 2, numerator: [unit], denominator: [] };
const immutable = new NumberRegex(definition);
// @ts-expect-error Unit records are readonly.
unit.exponent = 3;
// @ts-expect-error Unit arrays are readonly.
immutable.numerator.push(unit);
// @ts-expect-error Scalars are readonly.
immutable.scalar = 3;
// @ts-expect-error Numeric backend is readonly.
immutable.numeric = numberAdapter;
// @ts-expect-error Effective configuration is readonly.
NumberRegex.conversionCacheConfig.maxBytes = 1;
// @ts-expect-error Cache budgets must be numbers.
Quantity.withConfig({ cache: { conversionResults: { maxBytes: '1' } } });
// @ts-expect-error Unknown parser configuration.
Quantity.withConfig({ parser: { precision: 1 } });
const Configured = NumberRegex.withConfig({ cache: { parser: { maxEntries: 2 } } });
const scalar: number = new Configured('2 m').scalar;

class Custom extends NumberRegex {
    static category = 'custom';
    constructor(input: QuantityInput<number>, readonly label: string, units?: string, parser?: Parser<number>) {
        super(input, units, parser);
    }
    protected override constructQuantity(input: QuantityInput<number>, units: string | undefined, parser: Parser<number>): Custom {
        const Constructor = this.constructor as typeof Custom;
        return new Constructor(input, this.label, units, parser);
    }
}
const CustomConfigured = Custom.withConfig({ cache: { conversionResults: { maxEntries: 1 } } });
new CustomConfigured('2 m', 'length').clone().to('cm');
const category: string = CustomConfigured.category;
// @ts-expect-error Required subclass arguments are preserved.
new CustomConfigured('2 m');

// A custom representation implements the utilities contract, with no Quantity-specific hooks.
type Box = Readonly<{ value: number }>;
const box = (value: number): Box => Object.freeze({ value });
const isBox = (value: unknown): value is Box => typeof value === 'object' && value !== null && 'value' in value && typeof value.value === 'number';
const numeric: ArithmeticAdapter<Box> = {
    id: 'box', tier: 'arithmetic', isValue: isBox,
    from: value => isBox(value) ? value : box(numberAdapter.from(value)),
    add: (a,b) => box(a.value+b.value), sub: (a,b) => box(a.value-b.value),
    mul: (a,b) => box(a.value*b.value), div: (a,b) => box(a.value/b.value), rem: (a,b) => box(a.value%b.value),
    neg: a => box(-a.value), abs: a => box(Math.abs(a.value)),
    floor: a => box(Math.floor(a.value)), ceil: a => box(Math.ceil(a.value)),
    trunc: a => box(Math.trunc(a.value)), round: a => box(Math.round(a.value)),
    compare: (a,b) => numberAdapter.compare(a.value,b.value),
    isFinite: a => Number.isFinite(a.value), isNaN: a => Number.isNaN(a.value), isInteger: a => Number.isInteger(a.value),
    powInteger: (a, exponent) => box(numberAdapter.powInteger(a.value, exponent)),
    toBytes: () => Infinity,
    toNumber: a => a.value, toString: a => String(a.value),
};
const BoxQuantity = createQuantityClass({ numeric, parser: c => new NearleyParser(c) });
const boxed: Quantity<Box> = new BoxQuantity(box(2), 'm').pow(3);
const copiedBox: Box = new BoxQuantity(genericDecimal).scalar;
const unboxedDecimal: Decimal = new Quantity(boxed).scalar;
// @ts-expect-error Custom representations stay custom.
const wrongNumber: number = boxed.scalar;
const customParser: Parser<number> = { parse: (text, n) => ({ scalar: n.from(text), numerator: [], denominator: [] }) };
const Bare = createQuantityClass({ numeric: numberAdapter, parser: () => customParser });
new Bare('2').add(3);
// @ts-expect-error The parser must return the selected scalar type.
createQuantityClass({ numeric: numberAdapter, parser: () => ({ parse: () => ({ scalar: box(2), numerator: [], denominator: [] }) }) });

// Nested options are checked against the actual selected adapter.
const Precision = Quantity.withConfig({ numeric: { precision: 30, rounding: 'half-even' }, cache: false });
const precision: number = Precision.config.numeric.precision;
const configuredQuantity = new Precision('2 m');
const instancePrecision: number = configuredQuantity.config.numeric.precision;
const resultPrecision: number = configuredQuantity.add('1 m').sub('1 m').mul(2).div(2)
    .pow(2).inverse().to('cm^-2').toBase().clone().config.numeric.precision;
const regexPrecision: number = new RegexQuantity('2 m').clone().config.numeric.precision;
const arithmeticPrecision: number = new Arithmetic('2 m').to('cm').config.numeric.precision;
const annotatedPrecision: number = genericDecimal.config.numeric.precision;
const customConfig = { ...numeric, config: Object.freeze({ scale: 100 }) };
const ConfiguredBox = createQuantityClass({ numeric: customConfig, parser: c => new NearleyParser(c) });
const customScale: number = new ConfiguredBox(box(2), 'm').add('1 m').config.numeric.scale;
// @ts-expect-error Native configuration does not gain Decimal options through operations.
new DoubleQuantity('2 m').clone().to('cm').config.numeric.precision;
// @ts-expect-error Instance numeric settings remain immutable.
configuredQuantity.config.numeric.precision = 1;
const FactoryPrecision = createQuantityClass({ numeric: decimalAdapter, parser: c => new NearleyParser(c),
    config: { numeric: { precision: 30 }, cache: { scalarTerms: false, parser: { maxEntries: 2 } } } });
const factoryPrecision: number = FactoryPrecision.config.numeric.precision;
DoubleQuantity.withConfig({ cache: false });
// @ts-expect-error Numeric settings are nested.
Quantity.withConfig({ precision: 3 });
// @ts-expect-error Decimal validates option names statically.
Quantity.withConfig({ numeric: { precisoin: 3 } });
// @ts-expect-error Decimal precision must be a number.
Quantity.withConfig({ numeric: { precision: '3' } });
// @ts-expect-error Native doubles do not expose configurable numeric options.
DoubleQuantity.withConfig({ numeric: { precision: 3 } });
// @ts-expect-error Factory configuration does not widen the selected adapter.
createQuantityClass({ numeric: numberAdapter, parser: c => new NearleyParser(c), config: { numeric: { precision: 3 } } });
// @ts-expect-error Weak cache controls are booleans.
Quantity.withConfig({ cache: { scalarTerms: { maxBytes: 1 } } });
// @ts-expect-error Cache family names are checked.
Quantity.withConfig({ cache: { scalarTerm: false } });
// @ts-expect-error Resolved cache limits are immutable.
Precision.config.cache.parser.maxEntries = 3;

# Neutrium.Quantity

Neutrium.Quantity is the unit conversion module of the [Neutrium](https://neutrium.net) engineering library.

Neutrium.Quantity started its life as a fork of the [JS-quantities](https://github.com/gentooboontoo/js-quantities) library.

## Breaking Changes in Version 3

Version of this library introduces one breaking change:

- Number representation within a unit now uses to [Decimal.js](https://github.com/MikeMcl/decimal.js/) to improve accuracy of mathematical operations and range of scalar representation.

## Breaking Changes in Version 2

Version 2 of this library introduces many breaking changes. Here are the most significant changes:

- The library has been ported to Typescript and reworked as an npm module. This means it is no longer "browser first" and you will need a build system like browserify to bundle it up for browser use.
- Bower support has been dropped, this is linked to the point above.
- The module name has been changed from convert to quantity to keep consistent.
- The factory method for object creation is no longer supported. The `var q = new Quantity("1 m");` method must now be used.

## How does it differ from JS-quantities?

NeutriumJS.Quantity features an extended unit set and as of version 2.0.0 is ready for use in Typescript projects. Additionally several auxilary functions such as formatting have been removed to allow better focus on unit conversion (these may be added back at a latter date as separate modules).

## Getting Started

### Installing

You can install NeutriumJS.Quantity using npm.

	npm install @neutrium/quantity --save

### Including

#### Typescript

You can include the NeutriumJS.Quantity module using an import statement in typescript:

    import {Quantity} from "@neutrium/quantity"

    var qty = new Quantity("1 m");

This module is built with the declaration files so type hinting should work once the module has been imported.

#### Node

    var Quantity = require("@neutrium/quantity");

#### Browsers

Since version 2.0.0 the Quantity module has been converted to a commonjs (node) package. To use it in a browser environment you will need to use a tool like [browserify](http://browserify.org) to convert it to a web bunble and expose the Quantity object.

## Usage

### Creation

Instances of quantities are made by means of creating a new Quantity object:

    qty = new Quantity('23 ft');  // constructor

Quantities can be created using simply specifying the unit string as follows:

    qty = new Quantity('1m');             // => 1 meter
    qty = new Quantity('m');              // =>  1 meter (scalar defaults to 1)

    qty = new Quantity('1 N*m');
    qty = new Quantity('1 N m');          // * is optional

    qty = new Quantity('1 m/s');

    qty = new Quantity('1 m^2/s^2');
    qty = new Quantity('1 m^2 s^-2');     // negative powers
    qty = new Quantity('1 m2 s-2');       // ^ is optional

    qty = new Quantity('1 m^2 kg^2 J^2/s^2 A');

    qty = new Quantity('1.5');            // unitless quantity
    qty = new Quantity(1.5);              // number as initialising value

    qtyCopy = new Quantity('1m).clone();          // quantity could be copied when used as initialising value

### Unit Naming Conventions

- Units are generally in lower case unless there is a solid precedence for capitalisation.
- Currently the singular form of the unit is generally preferred (e.g. litre rather than litres).
- Use brackets when clarifying between units that have the same name, e.g. long tonne and short tonne will have abbreviations ton(l) and ton(s).
- Where a unit is a volume and a weight, the volume unit gets a bracket (f), e.g. mass ounce "oz", fluid ounce "oz(f)"
- Where a unit has several localisations (e.g. US, UK or Imperial gallon) the variants will be differentiated by appending the localisation to the unit name. For example gal(us), gal(uk) or gal(imp).
- Where a unit has both dry and fluid/liquid variants a d or l is added to the unit respectively i.e. gal(d). Dry and liquid variants are typically used in conjunction with US localised variants. In these cases you would add the d or l to the localisation, for example a US fluid gallon would be represented as gal(usl).

### Conversion

Quantities can easily be converted by using the two method:

    qty = new Quantity('20 m').to('ft'); // Converts meters to feet

You can also convert a quantity to a common set of base units:

    qty.base();                            // Converts feet back to meters, the base unit of length

You can access the scalar component of the quantity:

    qty = Quantity('10 m');
    qty.scalar;                             // Decimal(10)

The scalar component is a [Decimal](https://github.com/MikeMcl/decimal.js/) object which provides a range of operators. See the [Decimal.js documentation](http://mikemcl.github.io/decimal.js/) for more info.

### Comparison

You can perform some basic checking on a specific quantity using the following functions:

    qty1.isCompatible(qty2);    // => Do two quantities have the same signature? true or false
    qty1.isUnitless();           // => Is it dimensionless? true or false
    qty1.isBase();               // => Is the quantity in base (SI) units? true or false

Numerical comparisons can also be performed using the following functions:

    qty1.eq(qty2);              // => true if both quantities are equal (1m == 100cm => true)
    qty1.same(qty2);            // => true if both quantities are same (1m == 100cm => false)
    qty1.lt(qty2);              // => true if qty1 is strictly less than qty2
    qty1.lte(qty2);             // => true if qty1 is less than or equal to qty2
    qty1.gt(qty2);              // => true if qty1 is strictly greater than qty2
    qty1.gte(qty2);             // => true if qty1 is greater than or equal to qty2

    qty1.compareTo(qty2);       // => -1 if qty1 < qty2,
                                // => 0 if qty1 == qty2,
                                // => 1 if qty1 > qty2

### Operators

Basic arithmetic operations can be chained on a quantity such as:

    var qty = new Quantity('1 m').add('1 ft');

Available operators include:

- add(other): Add - other can be string or quantity. other should be unit compatible.
- sub(other): Subtract - other can be string or quantity. other should be unit compatible.
- mul(other): Multiply - other can be string, Decimal, number or quantity.
- div(other): Divide - other can be string, Decimal, number or quantity.
- inverse() : Inverse - inverse the unit set and scalar value (with no special special unit checking).

### Temperatures

In line with its forefathers, NeutriumJS.Quantity differentiates between temperature (a property) and degrees of temperature (a measure). Temperatures are signified by prefixing the unit with 'temp' (e.g. tempC, tempK, tempF, tempR) while degrees are prefixed with 'deg' (e.g. degC, degK, degF, degR). If the raw temperature units are used i.e. C, K, F or R NeutriumJS.Quantity will default to degrees.

As you would expect unit math on temperatures is fairly limited:

    Quantity('100 tempC').add('10 degC')  // 110 tempC
    Quantity('100 tempC').sub('10 degC')  // 90 tempC
    Quantity('100 tempC').add('50 tempC') // throws error
    Quantity('100 tempC').sub('50 tempC') // 50 degC
    Quantity('50 tempC').sub('100 tempC') // -50 degC
    Quantity('100 tempC').mul(scalar)     // 100*scalar tempC
    Quantity('100 tempC').div(scalar)     // 100/scalar tempC
    Quantity('100 tempC').mul(qty)        // throws error
    Quantity('100 tempC').div(qty)        // throws error
    Quantity('100 tempC*unit')            // throws error
    Quantity('100 tempC/unit')            // throws error
    Quantity('100 unit/tempC')            // throws error
    Quantity('100 tempC').inverse()       // throws error

### Errors

When NeutriumJS.Quantity cannot parse the provided string or you attempt to perform an invalid operation (such as multiplying two temperatures) it will throw an [Error](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error). Therefore when handling uncertain input or if you not feeling confident use the standard try-catch block.

## Donations

NeutriumJS is free software, but you can support the developers by [donating here](https://neutrium.net/donate/).

## Release Notes

| Version | Notes |
|:-------:|:------|
| 1.0.0	  | Initial Release |
| 2.0.0   | Rename package, switch to Typescript and convert to npm module |
| 3.0.0   | Switch to using decimal.js to store the quantity scalar |

## License

[Creative Commons Attribution 4.0 International](http://creativecommons.org/licenses/by/4.0/legalcode)
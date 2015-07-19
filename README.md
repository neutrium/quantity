# NeutriumJS.convert

NeutriumJS.convert is the unit conversion module of the [Neutrium](https://neutrium.net) engineering library. 

NeutriumJS.convert is an adaption of the [JS-quantities](https://github.com/gentooboontoo/js-quantities) library.

## How does it differ from JS-quantities?

NeutriumJS.convert features an extended unit set and has an increased focus on browser deployment rather than node. Therefore it prioritises library size at the cost of some features (mainly around formatting output).

## Getting Started

### Dependencies

NeutriumJS.convert depends on the NeutriumJS.utilities.NestedMap module. However the minified build in the dist directory already includes all dependencies and is ready to roll as standalone.

### Installing

#### Bower.io

You can install NeutriumJS.convert using bower.

	bower install neutriumjs-convert

### Standalone

If your project is not using bower and a build process (i.e. gulp or grunt) you can use the compiled and minified source which is found at:

	./dist/neutriumJS.convert.min.js

## Including the library

The NeutriumJS.Steam library should be included into your page using the following:

	<script charset="utf-8" src="neutriumJS.convert.min.js"></script>

When using [Require.JS](http://requirejs.org/):

    define(['NeutriumJS/Qty'], function(Qty) {
        ...
    });

## Usage

Being based on js-quantities, NeutriumJS.convert adopts the same method signatures, for more detailed documentation please refer to the [js-quantities readme](https://github.com/gentooboontoo/js-quantities/blob/master/README.md). A brief overview of usage and the recommended practices of NeutriumJS.convert is presented below.

### Creation

Instances of quantities are made by means of NeutriumJS.Qty() method. Qty can both be used as a constructor (with new) or as a factory (without new):

    qty = new NeutriumJS.Qty('23 ft');  // constructor
    qty = NeutriumJS.Qty('23 ft');      // factory

Quantities can be created using simply specifying the unit string as follows:

    qty = NeutriumJS.Qty('1m');             // => 1 meter
    qty = NeutriumJS.Qty('m');              // =>  1 meter (scalar defaults to 1)
    
    qty = NeutriumJS.Qty('1 N*m');
    qty = NeutriumJS.Qty('1 N m');          // * is optional
    
    qty = NeutriumJS.Qty('1 m/s');
    
    qty = NeutriumJS.Qty('1 m^2/s^2');
    qty = NeutriumJS.Qty('1 m^2 s^-2');     // negative powers
    qty = NeutriumJS.Qty('1 m2 s-2');       // ^ is optional
    
    qty = NeutriumJS.Qty('1 m^2 kg^2 J^2/s^2 A');
    
    qty = NeutriumJS.Qty('1.5');            // unitless quantity
    qty = NeutriumJS.Qty(1.5);              // number as initialising value
    
    qtyCopy = NeutriumJS.Qty(qty);          // quantity could be copied when used as initialising value

### General Conventions

- Units are generally in lower case unless there is a solid precedence for capitalisation.
- Currently the singular form of the unit is generally preferred (e.g. litre rather than litres).
- Where a unit has several localisations (e.g. US, UK or Imperial gallon) the variants will be differentiated by appending the localisation to the unit name. For example gal(us), gal(uk) or gal(imp).
- Where a unit has both dry and fluid/liquid variants a d or l is added to the unit respectively. Dry and liquid variants are typically used in conjunction with US localised variants. In these cases you would add the d or l to the localisation, for example a US fluid gallon would be represented as gal(usl).

### Conversion

Quantities can easily be converted by using the two method:

    qty = Neutrium.JS.Qty('20 m').to('ft'); // Converts meters to feet
    
You can also convert a quantity to a common set of base units:

    qty.base() ;                            // Converts feet back to meters, the base unit of length
    
You can access the scalar component of the quantity:

    qty = NeutriumJS.Qty('10 m');
    qty.scalar;                             // 10

### Comparison

You can perform some basic checking on a specific quantity using the following functions:

    qty1.isCompatible(qty2);    // => Do two quantities have the same signature? true or false
    qty.isUnitless();           // => Is it dimensionless? true or false
    qty.isBase();               // => Is the quantity in base (SI) units? true or false

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

    var qty = new NeutriumJS.Qty('1 m').add('1 ft');
   
Available operators include:

- add(other): Add - other can be string or quantity. other should be unit compatible.
- sub(other): Subtract - other can be string or quantity. other should be unit compatible.
- mul(other): Multiply - other can be string, number or quantity.
- div(other): Divide - other can be string, number or quantity.
- inverse() : Inverse - inverse the unit set and scalar value (with no special special unit checking)

### Temperatures

In line with its forefathers, NeutriumJS.convert differentiates between temperature (a property) and degrees of temperature (a measure). Temperatures are signified by prefixing the unit with 'temp' (e.g. tempC, tempK, tempF, tempR) while degrees are prefixed with 'deg' (e.g. degC, degK, degF, degR). If the raw temperature units are used i.e. C, K, F or R NeutriumJS.convert will default to degrees.

As you would expect unit math on temperatures is fairly limited:

    NeutriumJS.Qty('100 tempC').add('10 degC')  // 110 tempC
    NeutriumJS.Qty('100 tempC').sub('10 degC')  // 90 tempC
    NeutriumJS.Qty('100 tempC').add('50 tempC') // throws error
    NeutriumJS.Qty('100 tempC').sub('50 tempC') // 50 degC
    NeutriumJS.Qty('50 tempC').sub('100 tempC') // -50 degC
    NeutriumJS.Qty('100 tempC').mul(scalar)     // 100*scalar tempC
    NeutriumJS.Qty('100 tempC').div(scalar)     // 100/scalar tempC
    NeutriumJS.Qty('100 tempC').mul(qty)        // throws error
    NeutriumJS.Qty('100 tempC').div(qty)        // throws error
    NeutriumJS.Qty('100 tempC*unit')            // throws error
    NeutriumJS.Qty('100 tempC/unit')            // throws error
    NeutriumJS.Qty('100 unit/tempC')            // throws error
    NeutriumJS.Qty('100 tempC').inverse()       // throws error

### Errors

When NeutriumJS.convert cannot parse the provided string or you attempt to perform an invalid operation (such as multiplying two temperatures) it will throw an exception. Therefore when handling uncertain input or if you not feeling confident use the standard try-catch block.

## Todo

- Implement formal/automated testing (don't worry all units are currently tested against Neutrium internal unit catalog).
- Add formatter module to optionally add unit formatting functions.
- Add Bulk conversion (i.e. swift convert)
- Add pluralisation to unit parsing regex to reduce the number of variations in a unit description

## Donations

NeutriumJS is free software, but you can support the developers by [donating here](https://neutrium.net/donate/).

## Release Notes

| Version | Notes |
|:-------:|:------|
| 1.0.0	  | Initial Release |

## License 

[Creative Commons Attribution 4.0 International](http://creativecommons.org/licenses/by/4.0/legalcode)
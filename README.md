# @neutrium/quantity

@neutrium/quantity is a versatile package designed to simplify the process of converting between various units of measurement including length, mass, time, temperature, volume, and more. Whether you’re building engineering applications or everyday utilities, @neutrium/quantity makes unit conversions reliable, fast, and hassle-free.

The @neutrium/quantity package is a unit conversion  developed and maintained by the [Neutrium](https://neutrium.net) team. It evolved from the [JS-quantities](https://github.com/gentooboontoo/js-quantities) package which originated as a port of the [Ruby Units](http://github.com/olbrich/ruby-units) library.

## Getting Started

### Node

First add the @neutrium/quantity package to your project:

	npm install @neutrium/quantity --save

Then import `Quantity` where you want to use it:

	import { Quantity } from '@neutrium/quantity'

Now start creating quantities:

	let qty = new Quantity('1 m');

Or create quantities specifing the scalar and units separately:

	let qty = new Quantity(1, 'm');

#### Browsers

To use this library in a browser environment you will need to use a bundler like [vite](https://vite.dev) or [webpack](https://webpack.js.org) to convert it to a web bunble and expose the Quantity object.

## Unit Syntax

### Overview

The quantity is defined using a string containing a scalar value followed by a unit expression:

	<scalar> <unit-expression>

Both the scalar or unit expression portions can be blank. Not specifying a scalar will give a quantity with a scalar of 1 while having an empty unit expression will give a dimensionless quantity.

### \<scalar\>

When creating a quantity with a single string the scalar portion can be any string representing an integer or real floating point number that is parsable in javascript e.g. '1', '1.4', '1e3', '-1e-3'.

If creating a quantity using a separate scalar parameter (e.g. new Quantity(1, 'm')) the scalar may be provided as a string (subject to the rules above), a number or a [Decimal](https://github.com/neutrium/math) object.

### \<unit-expression\>

A unit expression is a string of units combined with any logical combination of the unit operators listed below:

| Operation       | Options            		| Example             	|
|---------------- | ----------------------- | --------------------- |
| Multiplication  | \* or . or ' '			| kg\*s, kg.s, kg s		|
| Division        | /                  		| m/s               	|
| Exponentiation  | ^\<integer\>       		| m^2, kg.m.s^-2      	|
| Grouping        | (\<unit-expression\>)   | kg*(m/s)^2          	|

Where \<integer\> is any signed integer and \<unit-expression\> is any logical unit expression.

### Examples

Examples of creating quantities are shown below:

	qty = new Quantity('1m');            		// 1 meter
	qty = new Quantity('m');             		// 1 meter (scalar defaults to 1)
	qty = new Quantity('1.5');           		// unitless quantity

	qty = new Quantity('1 N*m');				// 1 N x m
	qty = new Quantity('1 N.m');				// 1 N x m
	qty = new Quantity('1 N m');          		// 1 N x m

	qty = new Quantity('1 m/s');				// 1 m per second

	qty = new Quantity('1 m^2/s^2');			// 1 meter squared per second squared
	qty = new Quantity('1 m^2 s^-2');     		// same  as above with negative powers
	qty = new Quantity('1 m2 s-2');				// ^ is optional

	qty = new Quantity('1 (m kg J)^2/s^2 A');	// Complex unit string with parenthesis

More examples can be found in the unit tests located in `spec/parsing`.

## Using Quantities

### Cloning

You can create a copy of a quantity using the clone function:

	qtyCopy = new Quantity('1m').clone();

### Accessing the Scalar Value

You can access the scalar component of the quantity:

	qty = Quantity('10 m');
	qty.scalar;								// Decimal(10)

The scalar component is a [Decimal](https://github.com/MikeMcl/decimal.js/) object that provides a range of operators. For more information, see the [Decimal.js documentation](http://mikemcl.github.io/decimal.js/).

### Displaying a Quantities Units

The units of a quantity can be accessed using the `units()` method:

	let qty = new Quantity('1 m/s').mul('kg')

	// Returns 'kg.m/s'
	qty.units()


### Converting Units

Quantities can be converted by using the `to()` method:

	qty = new Quantity('20 m').to('ft');	// Converts meters to feet

You can also convert a quantity to a standard set of base units:

	qty.base();								// Converts feet back to meters, the base unit of length

### Comparing Quantities

You can perform numerical and logical comparison using the following functions:

| Operation					| Return Value																	|
| ------------------------- | ----------------------------------------------------------------------------- |
| qty1.isBase()				| True if qty1 is in base (SI) units, false otherwise.							|
| qty1.isUnitless()			| True if if qty1 is dimensionless, false otherwise.								|
| qty1.isCompatible(qty2)	| True if both quantities have the same unit signature, false otherwise.		|
| qty1.isInverse(qty2)		| True if qty1 is the inverse of qty, false otherwise.	 						|
| qty1.eq(qty2)				| True if both quantities are equal e.g. 1m == 100cm => true, false otherwise.	|
| qty1.same(qty2)			| True if both quantities are same e.g. 1m == 100cm => false, false otherwise.	|
| qty1.lt(qty2)				| True if qty1 is strictly less than qty2, false otherwise.						|
| qty1.lte(qty2) 			| True if qty1 is less than or equal to qty2, false otherwise.					|
| qty1.gt(qty2)				| True if qty1 is strictly greater than qty2, false otherwise.					|
| qty1.gte(qty2)			| True if qty1 is greater than or equal to qty2, false otherwise.				|
| qty1.compareTo(qty2)		|  -1 if qty1 < qty2; 0 if qty1 == qty2; 1 if qty1 > qty2						|
| qty1.isTemperature()		| True is qty1 is a temperature	e.g. new Quantity('1 tempC')					|
| qty1.isDegrees()			| True is qty1 is a temperature	e.g. new Quantity('1 degC')					|

### Quantity Arithmetic

Basic arithmetic operations can be performed using the quantity instant methods as follows:

	var qty = new Quantity('1 m').add('1 ft');

Available operators include:

| Operation			| Description |
| ----------------- | ----------- |
| qty.add(other)	| Add - other can be string or quantity but needs be unit compatible. |
| qty.sub(other)	| Subtract - other can be string or quantity but needs to be unit compatible. |
| qty.mul(other)	| Multiply - other can be string, Decimal, number or quantity. |
| qty.div(other)	| Divide - other can be string, Decimal, number or quantity. |
| qty.pow(y)		| Power - y must be an integer stored in a number, string or Decimal (fractional powers not supported) |
| qty.inverse()		| Inverse - inverse the unit set and scalar value (with no special special unit checking). |

### Temperatures

In line with its forefathers, @neutrium/quantity differentiates between temperature (a property) and degrees of temperature (a measure). Temperatures are signified by prefixing the unit with 'temp' (e.g. tempC, tempK, tempF, tempR), while degrees are prefixed with 'deg' (e.g. degC, degK, degF, degR). If the raw temperature units are used in a unit expression, i.e. C, K, F, they will default to degrees.

As you would expect, unit math on temperatures is limited:

	Quantity('100 tempC').add('10 degC')	// 110 tempC
	Quantity('100 tempC').sub('10 degC')	// 90 tempC
	Quantity('100 tempC').add('50 tempC')	// throws error
	Quantity('100 tempC').sub('50 tempC')	// 50 degC
	Quantity('50 tempC').sub('100 tempC')	// -50 degC
	Quantity('100 tempC').mul(scalar)		// 100*scalar tempC
	Quantity('100 tempC').div(scalar)		// 100/scalar tempC
	Quantity('100 tempC').mul(qty)			// throws error
	Quantity('100 tempC').div(qty)			// throws error
	Quantity('100 tempC*unit')				// throws error
	Quantity('100 tempC/unit')				// throws error
	Quantity('100 unit/tempC')				// throws error
	Quantity('100 tempC').inverse()			// throws error


### Errors

When @neutrium/quantity cannot parse the provided string, or you attempt to perform an invalid operation (such as multiplying two temperatures), it will throw an [Error](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error). Therefore, when handling dynamic input, it is recommended you use the standard try-catch block.

## Unit Specification

### Unit Categories

This package supports the unit categories listed below, with each category’s base units. Within each category, there is a set of defined compound units, such as Newton, Dyne, btu, etc., which the curious can find in `src/data/Units.ts`.

| Unit Category				| Base Units		|
| ------------------------- | ----------------- |
| Acceleration 				| m/s^2 			|
| Angle 					| radian 			|
| Area 						| m^2 				|
| Capacitance 				| A^2.s^4/kg.m^2 	|
| Charge 					| A.s 				|
| Current 					| A 				|
| Data 						| byte 				|
| Electrical Conductance	| A^2.s^3/kg.m^2 	|
| Electrical Inductance		| kg.m^2/s^2.A^2 	|
| Electrical Potential 		| kg.m^2/s^3.A 		|
| Electrical Resistance 	| kg.m^2/s^3.A^2 	|
| Energy					| kg.m^2/s^2 		|
| Force						| kg.m/s^2 			|
| Frequency 				| radian/s			|
| Length 					| m 				|
| Magnetic Flux 			| kg.m^2/A.s^2 		|
| Magnetic Flux Density 	| kg/A.s^2 			|
| Mass 						| kg 				|
| Power 					| kg.m^2/s^3 		|
| Pressure 					| kg/m.s^3 			|
| Radiation 				| m^2/s^2 			|
| Radioactivity 			| s^-1				|
| Sound 					| bel 				|
| Substance 				| mole 				|
| Temperature 				| kelvin 			|
| Time 						| second 			|
| Velocity 					| m/s 				|
| Viscosity 				| kg/m.s 			|
| Viscosity, Kinematic 		| m^2/s 			|
| Volume 					| m^3 				|



### Unit Prefixes

Units may be prefixed with [International System of Units (SI) prefixes](https://www.nist.gov/pml/owm/metric-si-prefixes). To use a prefix, add your preferred designator in front of the unit, e.g. mm for millimetres. A full list of SI prefixes is shown below:

| Name 		| Designator 							| Factor 	|
| --------- | ------------------------------------- | --------- |
| googol	| googol								| 10^100	|
| quetta	| Q, quetta								| 10^30 	|
| ronna		| R, ronna								| 10^27 	|
| yotta		| Y, Yotta, yotta						| 10^24		|
| zetta		| Z, Zetta, zetta						| 10^21		|
| exa		| E, Exa, exa							| 10^18		|
| peta		| P, Peta, peta							| 10^15		|
| tera		| T, Tera, tera							| 10^12		|
| giga		| G, Giga, giga							| 10^9		|
| mega		| M, Mega, mega							| 10^6		|
| kilo		| k, kilo								| 10^3		|
| hecto		| h, Hecto, hecto						| 10^2		|
| deca		| da, Deca, deca, deka					| 10^1		|
| deci		| d, Deci, deci							| 10^-1		|
| centi		| c, Centi, centi						| 10^-2		|
| milli		| m, Milli, milli						| 10^-3		|
| micro		| u, &#956;, &#181;, Micro, mc, micro	| 10^-6		|
| nano		| n, Nano, nano							| 10^-9		|
| pico		| p, Pico, pico							| 10^-12	|
| femto		| f, Femto, femto						| 10^-15	|
| atto		| a, Atto, atto							| 10^-18	|
| zepto		| z, Zepto, zepto						| 10^-21	|
| yocto		| y, Yocto, yocto						| 10^-24	|
| ronto		| r, ronto								| 10^-27	|
| quecto	| q, quecto								| 10^-30	|

Additionally the [binary prefixes](https://en.wikipedia.org/wiki/Binary_prefix) listed below are supported:

| Name 		| Designator 		| Factor 	|
| --------- | ------------------| --------- |
| kibi		| Ki, Kibi, kibi	| 2^10		|
| mebi		| Mi, Mebi, mebi	| 2^20		|
| gibi		| Gi, Gibi, gibi	| 2^30		|
| tebi		| Ti, Tebi, tebi 	| 2^40		|
| pebi		| Pi, Pebi, pebi 	| 2^50		|
| exbi		| Ei, Exbi, exbi 	| 2^60		|
| zebi		| Zi, Zebi, zebi	| 2^70		|
| yebi		| Yi, Yebi, yebi	| 2^80		|
| robi		| Ri, robi			| 2^90		|
| quebi		| Qi, quebi		 	| 2^100		|


### Unit Naming Conventions

The general conventions listed below are utilised to define unit names. These can be helpful to remember if you get an error reporting that a unit is not recognised and you don't want to refer back to the `src/data/Units.ts` file:

- Units are generally lowercase unless there is a solid precedence for capitalisation.
- The singular form of the unit is generally preferred (e.g. litre rather than litres).
- Use brackets when clarifying between units that have the same name. For example, long tonne and short tonne will have the abbreviations ton(l) and ton(s).
- Where a unit is a volume and a weight, the volume unit gets a bracket (f), e.g. mass ounce "oz", fluid ounce "oz(f)"
- Where a unit has several localisations (e.g. US, UK or Imperial gallon), the variants will be differentiated by appending the localisation to the unit name. For example gal(us), gal(uk) or gal(imp).
- Where a unit has both dry and fluid/liquid variants, a d or l is added to the unit respectively e.g. gal(d). Dry and liquid variants are typically used in conjunction with US localised variants. In these cases you would add the d or l to the localisation, for example a US fluid gallon would be represented as gal(usl).

## Quantity Parser

The @neutrium/quantity package ships with two unit parsers:

- NearleyQtyParser (default) - A performant parser using a [moo.js](https://github.com/no-context/moo) lexer and [nearley.js](https://github.com/kach/nearley) parser
- RegexQtyParser - A legacy parser that uses regular expressions and is based on the original [JS-quantities](https://github.com/gentooboontoo/js-quantities) logic

You can specify the parser to use or provide your own parser confirming to `parsers/Parser.ts` by passing it as an optional third argument to the Quantity constructor:

	import { RegexQtyParser } from '@neutrium/quantity/parsers.js';

	const parser = new RegexQtyParser();
	let qty = new Quantity(1, 'm', parser);

It is recommended that you stick with the default NearleyQtyParser, as it is significantly faster (~10-25x) than the legacy RegexQtyParser and supports more comprehensive unit expressions (e.g., parentheses grouping).

## Release Notes

| Version | Notes |
|:-------:|:------|
| 1.0.0	  | Initial Release |
| 2.0.0   | Ported to Typescript, renamed package, converted to a npm module and dropped bower support |
| 3.0.0   | Switch to using [Decimal.js](https://github.com/MikeMcl/decimal.js/) for the quantity scalar to improve the accuracy of mathematical operations and range of scalar representation |
| 4.0.0	  | Major refactor, conversion to ESM and introduction of Nearley.js based default parser |

## License

[Creative Commons Attribution 4.0 International](http://creativecommons.org/licenses/by/4.0/legalcode)

import { FIVE_NINTHS } from './TemperatureFactors.js';
import type { UnitCategory } from './Catalog.js';

// Exact US liquid gallon (231 cubic inches); subdivisions share one definition.
// NIST Handbook 133, Appendix E: https://nvlpubs.nist.gov/nistpubs/hb/2023/NIST.HB.133-2023.pdf
function usLiquidGallons(count: bigint): string
{
	// One gallon contains 3,785,411,784 nanolitres. Return exact cubic metres.
	return `${count * 3_785_411_784n}e-12`;
}
const US_LIQUID_GALLON = usLiquidGallons(1n);
const US_LIQUID_PINT = [US_LIQUID_GALLON, 8] as const;
const US_LIQUID_QUART = [US_LIQUID_GALLON, 4] as const;

// One approximation of 2π cancels exactly between subdivisions of a turn.
const RADIANS_PER_REVOLUTION = '6.28318530717958647692528676655900576839433879875021';
const ASTRONOMICAL_UNIT_METRES = 149_597_870_700n;
// IAU 2015 Resolution B2 defines one parsec as 648000/π astronomical units.
const PARSEC_METRES = [1_296_000n * ASTRONOMICAL_UNIT_METRES, RADIANS_PER_REVOLUTION] as const;
const INCH_MICROMETRES = 25_400n;
const INCH_METRES = `${INCH_MICROMETRES}e-6`;
const CUBIC_INCH = INCH_MICROMETRES ** 3n; // cubic micrometres
const US_BUSHEL = `${215_042n * CUBIC_INCH}e-20`; // 2150.42 cubic inches in cubic metres
const FOOT_MICROMETRES = 12n * INCH_MICROMETRES;
const ACRE_SQUARE_METRES = `${43_560n * FOOT_MICROMETRES ** 2n}e-12`;
// Legacy U.S. survey foot, exactly 1200/3937 metres.
const SURVEY_FOOT = [1200, 3937] as const;
function surveyFeet(feet: number, divisor = 1)
{
	return [feet * SURVEY_FOOT[0], divisor * SURVEY_FOOT[1]] as const;
}
const SURVEY_ACRE = [43_560 * SURVEY_FOOT[0] ** 2, SURVEY_FOOT[1] ** 2] as const;
const POUND_MICROGRAMS = 453_592_370n;
const POUND_KILOGRAMS = `${POUND_MICROGRAMS}e-9`;
const GRAIN_NANOGRAMS = POUND_MICROGRAMS * 1000n / 7000n;
const GRAVITY_MICROMETRES_PER_SECOND_SQUARED = 9_806_650n;
const STANDARD_GRAVITY = `${GRAVITY_MICROMETRES_PER_SECOND_SQUARED}e-6`;
const POUND_FORCE_FEMTONEWTONS = POUND_MICROGRAMS * GRAVITY_MICROMETRES_PER_SECOND_SQUARED;
const POUND_FORCE_NEWTONS = `${POUND_FORCE_FEMTONEWTONS}e-15`;
const PSI_PASCALS = [POUND_FORCE_NEWTONS, `${INCH_MICROMETRES ** 2n}e-12`] as const;
// Conventional CGS electrostatic units, with c in metres per second.
const SPEED_OF_LIGHT = 299_792_458n;
const STATAMPERE = [1, 10n * SPEED_OF_LIGHT] as const;
const STATVOLT = `${SPEED_OF_LIGHT}e-6`;
const STATOHM = `${SPEED_OF_LIGHT ** 2n}e-5`; // statvolt per statampere
// CODATA 2022 central value in kilograms: https://physics.nist.gov/cgi-bin/cuu/Value?ukg
const ATOMIC_MASS_UNIT = '1.66053906892e-27';
const STANDARD_ATMOSPHERE = 101325; // pascals

// Conventional pressure heads use standard gravity and fixed densities (NIST SP 811, Appendix B).
const WATER_GRAMS_PER_CUBIC_METRE = 1_000_000n;
const MERCURY_GRAMS_PER_CUBIC_METRE = 13_595_100n;
function columnPascals(densityGramsPerCubicMetre: bigint, heightMicrometres: bigint): string
{
	return `${densityGramsPerCubicMetre * GRAVITY_MICROMETRES_PER_SECOND_SQUARED * heightMicrometres}e-15`;
}

// One avoirdupois pound contains 7,000 grains, shared by all troy units.
function grainsInKilograms(grains: bigint): string
{
	return `${grains * GRAIN_NANOGRAMS}e-12`;
}

export const UNITS: Record<string, UnitCategory> = {
	"": {
		"units": {
			"<1>": [["1", "<1>"], 1]
		}
	},
	"acceleration": {
		"numerator": ["<meter>"],
		"denominator": ["<second>", "<second>"],
		"units": {
			"<gee>": [["gee", "gforce", "gn"], STANDARD_GRAVITY],
		}
	},
	"angle": {
		"numerator": ["<radian>"],
		"units": {
			"<radian>": [["rad", "radian", "radians"], 1.0],
			"<degree>": [["deg", "degree", "degrees"], [RADIANS_PER_REVOLUTION, 360]],
			"<gradian>": [["gon", "grad", "gradian", "grads"], [RADIANS_PER_REVOLUTION, 400]],
			"<aminutes>": [["amin", "amins", "arcmin", "arcmins"], [RADIANS_PER_REVOLUTION, 21600]],
			"<aseconds>": [["asec", "asecs", "arcsec", "arcsecs"], [RADIANS_PER_REVOLUTION, 1296000]],
			"<amils>": [["amil", "amils"], [RADIANS_PER_REVOLUTION, 6400]],
			"<octant>": [["octant"], [RADIANS_PER_REVOLUTION, 8]],
			"<quadrant>": [["quadrant", "quadrants"], [RADIANS_PER_REVOLUTION, 4]],
			"<sextant>": [["sextant"], [RADIANS_PER_REVOLUTION, 6]],
			"<rev>": [["rev"], RADIANS_PER_REVOLUTION],
			"<compass-pt>": [["cpoint"], [RADIANS_PER_REVOLUTION, 32]]
		}
	},
	"area": {
		"numerator": ["<meter>", "<meter>"],
		"units": {
			"<acre>": [["acre", "acres"], ACRE_SQUARE_METRES],
			"<acre-us>": [["acre(us)", "acres(us)"], SURVEY_ACRE],
			"<ares>": [["are", "ares"], 100],
			"<barn>": [["barn", "barns"], 1E-28],
			"<dunam>": [["dunam"], 1000],
			"<hectare>": [["ha", "hectare"], 10000],
			"<rood>": [["rood", "roods"], [ACRE_SQUARE_METRES, 4]]
		}
	},
	"capacitance": {
		"numerator": ["<ampere>", "<ampere>", "<second>", "<second>", "<second>", "<second>"],
		"denominator": ["<kilogram>", "<meter>", "<meter>"],
		"units": {
			"<farad>": [["F", "farad", "Farad"], 1.0],
		}
	},
	"charge": {
		"numerator": ["<ampere>", "<second>"],
		"units": {
			"<coulomb>": [["C", "coulomb", "Coulomb"], 1.0],
			"<esu>": [["ESU", "esu", "Fr", "statC", "StatC"], STATAMPERE]
		}
	},
	"currency": {
		"numerator": ["<dollar>"],
		"units": {
			"<dollar>": [["dollar", "dollars"], 1.0],
			"<cents>": [["cents"], 0.01]
		}
	},
	"current": {
		"numerator": ["<ampere>"],
		"units": {
			"<ampere>": [["A", "Ampere", "ampere", "amp", "amps"], 1.0],
			"<biot>": [["Biot"], 10],
			"<statampere>": [["StatAmpere", "statA", "StatA"], STATAMPERE]
		}
	},
	"data": {
		"numerator": ["<byte>"],
		"units": {
			"<byte>": [["B", "byte"], 1.0],
			"<bit>": [["b", "bit"], 0.125],
			"<nibble>": [["nibble"], 0.5],
		}
	},
	"electricalConductance": {
		"numerator": ["<second>", "<second>", "<second>", "<ampere>", "<ampere>"],
		"denominator": ["<kilogram>", "<meter>", "<meter>"],
		"units": {
			"<siemens>": [["S", "Siemen", "Siemens", "siemens", "mho", "mhos"], 1.0],
			"<statmho>": [["statmho"], [1, STATOHM]]
		}
	},
	"electricalInductance": {
		"numerator": ["<meter>", "<meter>", "<kilogram>"],
		"denominator": ["<second>", "<second>", "<ampere>", "<ampere>"],
		"units": {
			"<henry>": [["H", "Henry", "henry"], 1],
			"<abhenry>": [["abH"], 1E-9],
			"<statH>": [["statH", "StatH"], STATOHM] // one statohm second
		}
	},
	"electricalPotential": {
		"numerator": ["<meter>", "<meter>", "<kilogram>"],
		"denominator": ["<second>", "<second>", "<second>", "<ampere>"],
		"units": {
			"<volt>": [["V", "Volt", "volt", "volts"], 1.0],
			"<abvolt>": [["abV", "abVolt"], 1E-8],
			"<statvolts>": [["statV"], STATVOLT]
		}
	},
	"electricalResistance": {
		"numerator": ["<meter>", "<meter>", "<kilogram>"],
		"denominator": ["<second>", "<second>", "<second>", "<ampere>", "<ampere>"],
		"units": {
			"<ohm>": [["Ohm", "ohm", "\u03A9", "\u2126"], 1.0],
			"<abohm>": [["abOhm"], 1e-9]
		}
	},
	"energy": {
		"numerator": ["<meter>", "<meter>", "<kilogram>"],
		"denominator": ["<second>", "<second>"],
		"units": {
			"<btu>": [["BTU", "btu", "BTUs", "Btu"], '1055.05585262'],
			// 453.59237 grams per pound × 4.184 J per thermochemical calorie × 5/9.
			"<btu-thermo>": [["BTU(th)", "btu(th)", "btus(th)", "Btu(th)"], [23_722_880_951n, 22_500_000n]],
			"<calorie>": [["cal", "calorie", "calories"], 4.1868],
			"<calorie-IUNS>": [["cal(N)"], 4.182],
			"<calorie-thermo>": [["cal(th)"], 4.184],
			"<erg>": [["erg", "ergs"], 1e-7],
			// Exact SI definition: https://www.nist.gov/si-redefinition/meet-constants
			"<electron-volts>": [["eV"], '1.602176634e-19'],
			"<joule>": [["J", "joule", "Joule", "joules"], 1.0],
			"<therm-euro>": [["thm", "therm", "therms", "Therm"], 105506000],
			"<therm-US>": [["thm(us)", "therm(us)", "therms(us)", "Therm(us)"], 105480400],
			"<TNT>": [["tTNT"], 4184000000],
		}
	},
	"force": {
		"numerator": ["<kilogram>", "<meter>"],
		"denominator": ["<second>", "<second>"],
		"units": {
			"<newton>": [["N", "Newton", "newton"], 1.0],
			"<dyne>": [["dyn", "dyne"], 1e-5],
			"<gram-force>": [["gf", "gram-force", "pond"], 0.00980665],
			"<kg-force>": [["kgf", "kg-force", "kpond"], STANDARD_GRAVITY],
			"<pound-force>": [["lbf", "pound-force"], POUND_FORCE_NEWTONS],
			"<ounce-force>": [["ozf", "ounce-force"], [POUND_FORCE_NEWTONS, 16]],
			"<poundal>": [["pdl", "poundal"], `${POUND_MICROGRAMS * FOOT_MICROMETRES}e-15`],
			"<tonne-force>": [["tf", "tonnef"], 9806.65],
			"<ton-force-long>": [["tonlf"], `${2240n * POUND_FORCE_FEMTONEWTONS}e-15`],
			"<ton-force-short>": [["tonsf"], `${2000n * POUND_FORCE_FEMTONEWTONS}e-15`],
		}
	},
	"frequency": {
		"numerator": ["<radian>"],
		"denominator": ["<second>"],
		"units": {
			"<hertz>": [["Hz", "hertz", "Hertz", "pers"], RADIANS_PER_REVOLUTION],
			"<rpm>": [["rpm", "RPM"], [RADIANS_PER_REVOLUTION, 60]],
		}
	},
	"length": {
		"numerator": ["<meter>"],
		"units": {
			"<meter>": [["m", "meter", "meters", "metre", "metres"], 1.0],
			"<angstrom>": [["Å", "ang", "angstrom", "angstroms"], 1e-10],
			"<AU>": [["AU", "au", "astronomical-unit"], ASTRONOMICAL_UNIT_METRES],
			"<caliber>": [["caliber",], 0.0254],
			"<chain>": [["chain", "chains",], 20.1168],
			"<chain-us>": [["chain(us)"], surveyFeet(66)],
			"<cubit>": [["cubit",], 0.4572],
			"<cubit-long>": [["cubit(l)",], 0.5334],
			"<fathom>": [["fathom", "fathoms"], 1.8288],
			"<fermi>": [["Fermi"], 1e-15],
			"<finger>": [["finger", "fingers"], 0.1143],
			"<foot>": [["ft", "foot", "feet", "'"], `${FOOT_MICROMETRES}e-6`],
			"<furlong>": [["furlong", "furlongs"], 201.168],
			"<furlong-us>": [["furlong(us)", "furlong(uss)"], surveyFeet(660)],
			"<gmile>": [["gmile"], 1855.3257],
			"<hand>": [["hand", "hands"], 0.1016],
			"<league>": [["league", "league(us)"], surveyFeet(15_840)],
			"<inch>": [["in", "inch", "inches", "\""], INCH_METRES],
			"<link>": [["link", "links"], 0.201168],
			"<link-us>": [["link(us)"], surveyFeet(66, 100)],
			"<light-minute>": [["lmin", "light-minute"], 17987547480],
			"<light-second>": [["ls", "light-second"], SPEED_OF_LIGHT],
			"<light-year>": [["ly", "light-year"], 9460730472580800],
			"<micron>": [["micron"], 1e-6],
			"<mil>": [["mil", "mils"], 0.0000254],
			"<mile>": [["mi", "mile", "miles"], 1609.344],
			"<nail>": [["nail", "nails"], 0.05715],
			"<naut-league>": [["nleague"], 5556],
			"<naut-league-uk>": [["nleague(uk)"], 5559.552],
			"<naut-mile>": [["nmi"], 1852],
			"<parsec>": [["pc", "parsec", "parsecs"], PARSEC_METRES],
			"<pica>": [["pica", "picas"], [INCH_METRES, 6]],
			"<planck-length>": [["Planck"], '1.616255e-35'],
			"<point>": [["point", "points"], [INCH_METRES, 72]],
			"<rod>": [["rd", "rod", "rods"], 5.0292],
			"<rod-us>": [["rod(us)"], surveyFeet(66, 4)],
			"<rope>": [["rope", "ropes"], 6.096],
			"<thou>": [["th"], 0.0000254],
			"<span>": [["span"], 0.2286],
			"<yard>": [["yd", "yard", "yards"], 0.9144]
		}
	},
	"magneticFlux": {
		"numerator": ["<meter>", "<meter>", "<kilogram>"],
		"denominator": ["<second>", "<second>", "<ampere>"],
		"units": {
			"<weber>": [["Wb", "weber", "webers"], 1.0],
			"<maxwell>": [["Mx", "maxwell", "maxwells"], 1e-8],
			"<line>": [["line"], 1E-8]
		}
	},
	"magneticFluxDensity": {
		"numerator": ["<kilogram>"],
		"denominator": ["<second>", "<second>", "<ampere>"],
		"units": {
			"<tesla>": [["T", "tesla", "teslas"], 1],
			"<gauss>": [["G", "gauss"], 1e-4]
		}
	},
	"mass": {
		"numerator": ["<kilogram>"],
		"units": {
			"<kilogram>": [["kg", "kilogram", "kilograms"], 1.0],
			"<AMU>": [["u", "AMU", "amu"], ATOMIC_MASS_UNIT],
			"<carat>": [["ct", "carat", "carats"], 0.0002],
			"<dalton>": [["Da", "Dalton", "Daltons", "dalton", "daltons"], ATOMIC_MASS_UNIT],
			"<dram>": [["dram", "drams", "dr"], [POUND_KILOGRAMS, 256]],
			"<gram>": [["g", "gram", "grams", "gramme", "grammes"], 1e-3],
			"<grain>": [["grain", "grains", "gr"], grainsInKilograms(1n)],
			"<hundredweight-short>": [["cwt(s)"], 45.359237],
			"<hundredweight-long>": [["cwt(l)"], 50.80234544],
			"<ounce>": [["oz", "ounce", "ounces"], [POUND_KILOGRAMS, 16]],
			"<ounce-troy>": [["ozt"], grainsInKilograms(480n)],
			"<pennyweight>": [["dwt"], grainsInKilograms(24n)],
			"<pound>": [["lbs", "lb", "pound", "pounds", "#"], POUND_KILOGRAMS],
			"<pound-troy>": [["lbt"], grainsInKilograms(12n * 480n)],
			"<quarter-short>": [["qr(s)"], 11.33980925],
			"<quarter-long>": [["qr(l)"], 12.70058636],
			"<slug>": [["slug", "slugs"], [POUND_FORCE_NEWTONS, `${FOOT_MICROMETRES}e-6`]],
			"<stone>": [["stone", "stones", "st"], 6.35029318],
			"<ton-metric>": [["t", "tonne"], 1000],
			"<ton-long>": [["tnl", "ton(l)", "tonl"], 1016.0469088],
			"<ton-short>": [["tn", "ton", "ton(s)", "tons"], 907.18474],
		}
	},
	"power": {
		"numerator": ["<kilogram>", "<meter>", "<meter>"],
		"denominator": ["<second>", "<second>", "<second>"],
		"units": {
			"<watt>": [["W", "watt", "watts"], 1.0],
			"<horsepower>": [["Hp", "hp", "horsepower"], `${550n * FOOT_MICROMETRES * POUND_FORCE_FEMTONEWTONS}e-21`],
			"<horsepower-electric>": [["Hp(e)", "hp(e)", "hp(electric)"], 746],
			"<horsepower-metric>": [["Hp(m)", "hp(m)"], 735.49875]
		}
	},
	"pressure": {
		"numerator": ["<kilogram>"],
		"denominator": ["<meter>", "<second>", "<second>"],
		"units": {
			"<pascal>": [["Pa", "pascal", "Pascal"], 1.0],
			"<at>": [["at"], 98066.5],
			"<atm>": [["atm", "atmosphere", "atmospheres"], STANDARD_ATMOSPHERE],
			"<bar>": [["bar", "bars"], 100000],
			"<barye>": [["barye"], 0.1],
			"<cmh2o>": [["cmH2O"], columnPascals(WATER_GRAMS_PER_CUBIC_METRE, 10_000n)],
			"<cmHg>": [["cmHg"], columnPascals(MERCURY_GRAMS_PER_CUBIC_METRE, 10_000n)],
			"<inh2o>": [["inH2O"], columnPascals(WATER_GRAMS_PER_CUBIC_METRE, INCH_MICROMETRES)],
			"<inHg>": [["inHg"], columnPascals(MERCURY_GRAMS_PER_CUBIC_METRE, INCH_MICROMETRES)],
			"<mmh2o>": [["mmH2O"], columnPascals(WATER_GRAMS_PER_CUBIC_METRE, 1000n)],
			"<mmHg>": [["mmHg"], columnPascals(MERCURY_GRAMS_PER_CUBIC_METRE, 1000n)],
			"<pieze>": [["pieze"], 1000],
			"<psf>": [["psf"], [POUND_FORCE_NEWTONS, `${FOOT_MICROMETRES ** 2n}e-12`]],
			"<psi>": [["psi"], PSI_PASCALS],
			"<torr>": [["torr"], [STANDARD_ATMOSPHERE, 760]],
		}
	},
	"radiation": {
		"numerator": ["<meter>", "<meter>"],
		"denominator": ["<second>", "<second>"],
		"units": {
			"<gray>": [["Gy", "gray", "grays"], 1.0],
			"<sievert>": [["Sv", "sievert", "sieverts"], 1.0]
		}
	},
	"radiationExposure": {
		"numerator": ["<ampere>", "<second>"],
		"denominator": ["<kilogram>"],
		"units": {
			// Exposure, not absorbed dose: 1 roentgen = 2.58e-4 C/kg exactly.
			// https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b9
			"<roentgen>": [["R", "roentgen"], '0.000258']
		}
	},
	"radioactivity": {
		"numerator": ["<1>"],
		"denominator": ["<second>"],
		"units": {
			"<becquerel>": [["Bq", "becquerel", "becquerels", "bequerel", "bequerels"], 1.0],
			"<curie>": [["Ci", "curie", "curies"], 3.7e10]
		}
	},
	"sound": {
		"numerator": ["<bel>"],
		"units": {
			"<bel>": [["Bels", "Bel", "bel", "bels"], 1],
			"<decibel>": [["dB", "decibel", "decibels"], 0.1],
			// 2 / ln(10) bels per neper, rounded to 51 significant digits.
			"<neper>": [["Neper"], '0.868588963806503655302257837833210164588794011607333']
		}
	},
	"substance": {
		"numerator": ["<mole>"],
		"units": {
			"<mole>": [["mol", "mole"], 1.0]
		}
	},
	"temperature": {
		"numerator": ["<kelvin>"],
		"units": {
			"<kelvin>": [["degK", "kelvin", "K"], 1.0],
			"<celsius>": [["degC", "celsius", "centigrade", "C"], 1.0],
			"<fahrenheit>": [["degF", "fahrenheit", "F"], FIVE_NINTHS],
			"<rankine>": [["degR", "rankine", "R"], FIVE_NINTHS],
			"<temp-K>": [["tempK"], 1.0],
			"<temp-C>": [["tempC"], 1.0],
			"<temp-F>": [["tempF"], FIVE_NINTHS],
			"<temp-R>": [["tempR"], FIVE_NINTHS]
		}
	},
	"time": {
		"numerator": ["<second>"],
		"units": {
			"<second>": [["s", "sec", "secs", "second", "seconds"], 1],
			"<minute>": [["min", "mins", "minute", "minutes"], 60],
			"<hour>": [["h", "hr", "hrs", "hour", "hours"], 3600],
			"<day>": [["d", "day", "days"], 86400],
			"<week>": [["wk", "week", "weeks"], 604800],
			"<fortnight>": [["fortnight", "fortnights"], 1209600],
			"<month>": [["month", "months"], 2629740],
			"<year>": [["y", "yr", "year", "years", "annum"], 31536000],
			"<year-julian>": [["y(j)", "yr(j)", "year(j)", "years(j)"], 31557600],
			"<year-leap>": [["y(l)", "yr(l)", "year(l)", "years(l)"], 31622400],
			"<year-tropical>": [["tyr", "tyrs"], 31556925.19],
			"<decade>": [["decade", "decades"], 315360000],
			"<century>": [["century", "centuries"], 3153600000],
			"<millienia>": [["millennium", "millennia", "millenniums", "millienia", "millenium"], 31536000000],
			"<shake>": [["shake"], 1e-8]
		}
	},
	"velocity": {
		"numerator": ["<meter>"],
		"denominator": ["<second>"],
		"units": {
			"<kph>": [["kph"], [1000, 3600] as const],
			"<mph>": [["mph"], 0.44704],
			"<knot>": [["kn", "knot", "knots"], [1852, 3600] as const],
			"<mach>": [["mach"], 295.0464],
			"<light-speed>": [["lspeed", "light"], SPEED_OF_LIGHT]
		}
	},
	"viscosity": {
		"numerator": ["<kilogram>"],
		"denominator": ["<meter>", "<second>"],
		"units": {
			"<poise>": [["P", "poise"], 0.1],
			"<reyn>": [["reyn"], PSI_PASCALS]
		}
	},
	"viscosityKinematic": {
		"numerator": ["<meter>", "<meter>"],
		"denominator": ["<second>"],
		"units": {
			"<stoke>": [["St", "Stokes"], 1E-4]
		}
	},
	"volume": {
		"numerator": ["<meter>", "<meter>", "<meter>"],
		"units": {
			"<barrels-us-petroleum>": [["bbl(us)", "bbl"], usLiquidGallons(42n)],
			"<barrels-uk>": [["bl(uk)", "bl(imp)"], 0.16365924],
			"<barrels-us-dry>": [["bl(usd)"], `${7056n * CUBIC_INCH}e-18`],
			"<barrels-us-liquid>": [["bl(usl)"], [usLiquidGallons(63n), 2]],
			"<bushels-us>": [["bu", "bsh", "bushel", "bushel(us)"], US_BUSHEL],
			"<bushels-uk>": [["bu(uk)", "bushel(uk)", "bushel(imp)"], 0.03636872],
			"<cup-metric>": [["cup", "cup(metric)"], 0.00025],
			"<cup-imperial>": [["cup(imp)"], 2.84130625e-4],
			"<cup-us-customary>": [["cup(usc)"], 2.365882365e-4],
			"<cup-us-legal>": [["cup(usl)"], 0.00024],
			"<dram-fluid>": [["dr(f)", "dram(f)"], [US_LIQUID_GALLON, 1024]],
			"<drum-metric-petroleum>": [["drum(mp)"], 0.2],
			"<drum-us-petroleum>": [["drum(usp)"], usLiquidGallons(55n)],
			"<fluid-ounce>": [["floz", "fluid-ounce", "fluid-ounces"], 2.84130625e-5],
			"<fluid-ounce-us>": [["oz(usl)", "oz(usf)", "floz(us)"], [US_LIQUID_GALLON, 128]],
			"<gallon-uk>": [["gal", "gal(imp)", "gal(uk)"], 0.00454609],
			"<gallon-us-dry>": [["gal(usd)", "gal(us dry)"], [US_BUSHEL, 8]],
			"<gallon-us-liquid>": [["gal(us)", "gal(usl)", "gal(us fl)"], US_LIQUID_GALLON],
			"<liter>": [["l", "L", "liter", "liters", "litre", "litres"], 0.001],
			"<pecks-uk>": [["peck(uk)", "pecks(uk)"], 0.00909218],
			"<pecks-us>": [["peck(us)", "pecks(us)"], [US_BUSHEL, 4]],
			"<pint>": [["pt", "pint", "pints", "pint(us fl)"], US_LIQUID_PINT],
			"<pint-uk>": [["pt(uk)", "pint(uk)", "pints(uk)"], 0.00056826125],
			"<pint-us-dry>": [["pt(usd)", "pint(usd)", "pints(usd)"], [US_BUSHEL, 64]],
			"<pint-us-liquid>": [["pt(usl)", "pint(usl)", "pints(usl)"], US_LIQUID_PINT],
			"<quart>": [["qt", "quart", "quarts"], US_LIQUID_QUART],
			"<quart-uk>": [["qt(uk)", "quart(uk)", "quarts(uk)"], 0.0011365225],
			"<quart-us-dry>": [["qt(usd)", "quart(usd)", "quarts(usd)"], [US_BUSHEL, 32]],
			"<quart-us-liquid>": [["qt(usl)", "quart(usl)", "quarts(usl)"], US_LIQUID_QUART],
			"<tablespoon-metric>": [["tb", "tbs", "tablespoon", "tablespoons"], 0.000015],
			"<tablespoon-uk>": [["tb(uk)", "tbs(uk)", "tablespoon(uk)", "tablespoons(uk)"], 1.420653125e-5],
			"<tablespoon-us>": [["tb(us)", "tbs(us)", "tablespoon(us)", "tablespoons(us)"], [US_LIQUID_GALLON, 256]],
			"<teaspoon-metric>": [["tsp", "teaspoon", "teaspoons"], 0.000005],
			"<teaspoon-us>": [["tsp(us)", "teaspoon(us)", "teaspoons(us)"], [US_LIQUID_GALLON, 768]]
		}
	}
}

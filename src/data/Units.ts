export const UNITS = {
	"": {
		"units": {
			"<1>": [["1", "<1>"], 1]
		}
	},
	"acceleration": {
		"numerator": ["<meter>"],
		"denominator": ["<second>", "<second>"],
		"units": {
			"<gee>": [["gee", "gforce", "gn"], 9.80665],
		}
	},
	"angle": {
		"numerator": ["<radian>"],
		"units": {
			"<radian>": [["rad", "radian", "radians"], 1.0],
			"<degree>": [["deg", "degree", "degrees"], Math.PI / 180.0],
			"<gradian>": [["gon", "grad", "gradian", "grads"], Math.PI / 200.0],
			"<aminutes>": [["amin", "amins", "arcmin", "arcmins"], 0.0002908882],
			"<aseconds>": [["asec", "asecs", "arcsec", "arcsecs"], 4.8481366667e-6],
			"<amils>": [["amil", "amils"], 9.817477e-4],
			"<octant>": [["octant"], 0.785398163],
			"<quadrant>": [["quadrant", "quadrants"], 1.570796327],
			"<sextant>": [["sextant"], 1.047197551],
			"<rev>": [["rev"], 6.283185307],
			"<compass-pt>": [["cpoint"], 0.196349540849362]
		}
	},
	"area": {
		"numerator": ["<meter>", "<meter>"],
		"units": {
			"<acre>": [["acre", "acres"], 4046.856422],
			"<acre-us>": [["acre(us)", "acres(us)"], 4046.873],
			"<ares>": [["are", "ares"], 100],
			"<barn>": [["barn", "barns"], 1E-28],
			"<dunam>": [["dunam"], 1000],
			"<hectare>": [["ha", "hectare"], 10000],
			"<rood>": [["rood", "roods"], 1011.714106]
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
			"<esu>": [["ESU", "esu", "Fr", "statC", "StatC"], 3.335640952e-10]
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
			"<statampere>": [["StatAmpere", "statA", "StatA"], 3.335641E-10]
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
			"<statmho>": [["statmho"], 1.112347052e-12]
		}
	},
	"electricalInductance": {
		"numerator": ["<meter>", "<meter>", "<kilogram>"],
		"denominator": ["<second>", "<second>", "<ampere>", "<ampere>"],
		"units": {
			"<henry>": [["H", "Henry", "henry"], 1],
			"<abhenry>": [["abH"], 1E-9],
			"<statH>": [["statH", "StatH"], 8.987552E+11]
		}
	},
	"electricalPotential": {
		"numerator": ["<meter>", "<meter>", "<kilogram>"],
		"denominator": ["<second>", "<second>", "<second>", "<ampere>"],
		"units": {
			"<volt>": [["V", "Volt", "volt", "volts"], 1.0],
			"<abvolt>": [["abV", "abVolt"], 1E-8],
			"<statvolts>": [["statV"], 299.7925]
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
			"<btu>": [["BTU", "btu", "BTUs", "Btu"], 1055.055853],
			"<btu-thermo>": [["BTU(th)", "btu(th)", "btus(th)", "Btu(th)"], 1054.35026444],
			"<calorie>": [["cal", "calorie", "calories"], 4.1868],
			"<calorie-IUNS>": [["cal(N)"], 4.182],
			"<calorie-thermo>": [["cal(th)"], 4.184],
			"<erg>": [["erg", "ergs"], 1e-7],
			"<electron-volts>": [["eV"], 1.60217653e-19],
			"<joule>": [["J", "joule", "Joule", "joules"], 1.0],
			"<therm-euro>": [["thm", "therm", "therms", "Therm"], 105505590],
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
			"<kg-force>": [["kgf", "kg-force", "kpond"], 9.80665],
			"<pound-force>": [["lbf", "pound-force"], 4.448221615],
			"<ounce-force>": [["ozf", "ounce-force"], 0.278013851],
			"<poundal>": [["pdl", "poundal"], 0.138254954],
			"<tonne-force>": [["tf", "tonnef"], 9806.65],
			"<ton-force-long>": [["tonlf"], 9964.016418],
			"<ton-force-short>": [["tonsf"], 8896.4432],
		}
	},
	"frequency": {
		"numerator": ["<radian>"],
		"denominator": ["<second>"],
		"units": {
			"<hertz>": [["Hz", "hertz", "Hertz", "pers"], 2 * Math.PI],
			"<rpm>": [["rpm", "RPM"], 2 * Math.PI / 60],
		}
	},
	"length": {
		"numerator": ["<meter>"],
		"units": {
			"<meter>": [["m", "meter", "meters", "metre", "metres"], 1.0],
			"<angstrom>": [["Å", "ang", "angstrom", "angstroms"], 1e-10],
			"<AU>": [["AU", "au", "astronomical-unit"], 149597870700],
			"<caliber>": [["caliber",], 0.0254],
			"<chain>": [["chain", "chains",], 20.1168],
			"<chain-us>": [["chain(us)"], 20.116840234],
			"<cubit>": [["cubit",], 0.4572],
			"<cubit-long>": [["cubit(l)",], 0.5334],
			"<fathom>": [["fathom", "fathoms"], 1.8288],
			"<fermi>": [["Fermi"], 1e-15],
			"<finger>": [["finger", "fingers"], 0.1143],
			"<foot>": [["ft", "foot", "feet", "'"], 0.3048],
			"<furlong>": [["furlong", "furlongs"], 201.168],
			"<furlong-us>": [["furlong(us)", "furlong(uss)"], 201.16840234],
			"<gmile>": [["gmile"], 1855.3257],
			"<hand>": [["hand", "hands"], 0.1016],
			"<league>": [["league", "league(us)"], 4828.0417],	// Need to check this is the same as nleage(us)
			"<inch>": [["in", "inch", "inches", "\""], 0.0254],
			"<link>": [["link", "links"], 0.201168],
			"<link-us>": [["link(us)"], 0.20116840234],
			"<light-minute>": [["lmin", "light-minute"], 17987547480],
			"<light-second>": [["ls", "light-second"], 299792458],
			"<light-year>": [["ly", "light-year"], 9460730472580800],
			"<micron>": [["micron"], 1e-6],
			"<mil>": [["mil", "mils"], 0.0000254, ["<meter>"]],
			"<mile>": [["mi", "mile", "miles"], 1609.344],
			"<nail>": [["nail", "nails"], 0.05715],
			"<naut-league>": [["nleague"], 5556],
			"<naut-league-uk>": [["nleague(uk)"], 5559.552],
			"<naut-mile>": [["nmi"], 1852],
			"<parsec>": [["pc", "parsec", "parsecs"], 30856780000000000],
			"<pica>": [["pica", "picas"], 0.00423333333],
			"<planck-length>": [["Planck"], 1.616252E-35],
			"<point>": [["point", "points"], 0.000352777777777778],
			"<rod>": [["rd", "rod", "rods"], 5.0292],
			"<rod-us>": [["rod(us)"], 5.029210058],
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
			"<AMU>": [["u", "AMU", "amu"], 1.660538921e-27],
			"<carat>": [["ct", "carat", "carats"], 0.0002],
			"<dalton>": [["Da", "Dalton", "Daltons", "dalton", "daltons"], 1.660538921e-27],
			"<dram>": [["dram", "drams", "dr"], 0.0017718452],
			"<gram>": [["g", "gram", "grams", "gramme", "grammes"], 1e-3],
			"<grain>": [["grain", "grains", "gr"], 6.479891E-5],
			"<hundredweight-short>": [["cwt(s)"], 45.359237],
			"<hundredweight-long>": [["cwt(l)"], 50.80234544],
			"<ounce>": [["oz", "ounce", "ounces"], 0.0283495231],
			"<ounce-troy>": [["ozt"], 0.031103477],
			"<pennyweight>": [["dwt"], 0.00155517384],
			"<pound>": [["lbs", "lb", "pound", "pounds", "#"], 0.45359237],
			"<pound-troy>": [["lbt"], 0.3732417],
			"<quarter-short>": [["qr(s)"], 11.33980925],
			"<quarter-long>": [["qr(l)"], 12.70058636],
			"<slug>": [["slug", "slugs"], 14.5939029],
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
			"<horsepower>": [["Hp", "hp", "horsepower"], 745.699872],
			"<horsepower-electric>": [["Hp(e)", "hp(e)", "hp(electric)"], 746],
			"<horsepower-metric>": [["Hp(m)", "hp(m)", "Hp(m)"], 735.49875]
		}
	},
	"pressure": {
		"numerator": ["<kilogram>"],
		"denominator": ["<meter>", "<second>", "<second>"],
		"units": {
			"<pascal>": [["Pa", "pascal", "Pascal"], 1.0],
			"<at>": [["at"], 98066.5],
			"<atm>": [["atm", "atmosphere", "atmospheres"], 101325],
			"<bar>": [["bar", "bars"], 100000],
			"<barye>": [["barye"], 0.1],
			"<cmh2o>": [["cmH2O"], 98.0638],
			"<cmHg>": [["cmHg"], 1333.223874],
			"<inh2o>": [["inH2O"], 249.082052],
			"<inHg>": [["inHg"], 3386.3881472],
			"<mmh2o>": [["mmH2O"], 9.80665],
			"<mmHg>": [["mmHg"], 133.322387415],
			"<pieze>": [["pieze"], 1000],
			"<psf>": [["psf"], 47.880259],
			"<psi>": [["psi"], 6894.757293],
			"<torr>": [["torr"], 133.322368],
		}
	},
	"radiation": {
		"numerator": ["<meter>", "<meter>"],
		"denominator": ["<second>", "<second>"],
		"units": {
			"<gray>": [["Gy", "gray", "grays"], 1.0],
			"<roentgen>": [["R", "roentgen"], 0.009330],
			"<sievert>": [["Sv", "sievert", "sieverts"], 1.0]
		}
	},
	"radioactivity": {
		"numerator": ["<1>"],
		"denominator": ["<second>"],
		"units": {
			"<becquerel>": [["Bq", "bequerel", "bequerels"], 1.0],
			"<curie>": [["Ci", "curie", "curies"], 3.7e10]
		}
	},
	"sound": {
		"numerator": ["<bel>"],
		"units": {
			"<bel>": [["Bels", "Bel"], 1],
			"<neper>": [["Neper"], 0.8686]
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
			"<celsius>": [["degC", "celsius", "celsius", "centigrade", "C"], 1.0],
			"<fahrenheit>": [["degF", "fahrenheit", "F"], 5/9],
			"<rankine>": [["degR", "rankine", "R"], 5/9],
			"<temp-K>": [["tempK"], 1.0],
			"<temp-C>": [["tempC"], 1.0],
			"<temp-F>": [["tempF"], 5/9],
			"<temp-R>": [["tempR"], 5/9]
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
			"<millienia>": [["millienia", "millenium"], 31536000000],
			"<shake>": [["shake"], 1e-8]
		}
	},
	"velocity": {
		"numerator": ["<meter>"],
		"denominator": ["<second>"],
		"units": {
			"<kph>": [["kph"], 0.277777778],
			"<mph>": [["mph"], 0.44704],
			"<knot>": [["kn", "knot", "knots"], 0.514444444],
			"<mach>": [["mach"], 295.0464],
			"<light-speed>": [["lspeed", "light"], 299792458]
		}
	},
	"viscosity": {
		"numerator": ["<kilogram>"],
		"denominator": ["<meter>", "<second>"],
		"units": {
			"<poise>": [["P", "poise"], 0.1],
			"<reyn>": [["reyn"], 6894.75729]
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
			"<barrels-us-petroleum>": [["bbl(us)", "bbl"], 0.158987295],
			"<barrels-uk>": [["bl(uk)", "bl(imp)"], 0.16365924],
			"<barrels-us-dry>": [["bl(usd)"], 0.115627124],
			"<barrels-us-liquid>": [["bl(usl)"], 0.119240471],
			"<bushels-us>": [["bu", "bsh", "bushel", "bushel(us)"], 0.035239072],
			"<bushels-uk>": [["bu(uk)", "bushel(uk)", "bushel(imp)"], 0.03636872],
			"<cup-metric>": [["cup", "cup(metric)"], 0.00025],
			"<cup-imperial>": [["cup(imp)"], 2.84130625e-4],
			"<cup-us-customary>": [["cup(usc)"], 2.365882365e-4],
			"<cup-us-legal>": [["cup(usl)"], 0.00024],
			"<dram-fluid>": [["dr(f)", "dram(f)"], 3.6966911953E-06],
			"<drum-metric-petroleum>": [["drum(mp)"], 0.2],
			"<drum-us-petroleum>": [["drum(usp)"], 0.208197648],
			"<fluid-ounce>": [["floz", "fluid-ounce", "fluid-ounces"], 2.84130625e-5],
			"<fluid-ounce-us>": [["oz(usl)", "oz(usf)", "floz(us)"], 2.95735296e-5],
			"<gallon-uk>": [["gal", "gal(imp)", "gal(uk)"], 0.00454609],
			"<gallon-us-dry>": [["gal(usd)", "gal(us dry)"], 0.004404884],
			"<gallon-us-liquid>": [["gal(us)", "gal(usl)", "gal(us fl)"], 0.003785412],
			"<liter>": [["l", "L", "liter", "liters", "litre", "litres"], 0.001],
			"<pecks-uk>": [["peck(uk)", "pecks(uk)"], 0.00909218],
			"<pecks-us>": [["peck(us)", "pecks(us)"], 0.008809768],
			"<pint>": [["pt", "pint", "pints", "pint(us fl)"], 0.000473176475],
			"<pint-uk>": [["pt(uk)", "pint(uk)", "pints(uk)"], 0.00056826125],
			"<pint-us-dry>": [["pt(usd)", "pint(usd)", "pints(usd)"], 0.000550610475],
			"<pint-us-liquid>": [["pt(usl)", "pint(usl)", "pints(usl)"], 0.000473176473],
			"<quart>": [["qt", "quart", "quarts"], 0.00094635295],
			"<quart-uk>": [["qt(uk)", "quart(uk)", "quarts(uk)"], 0.0011365225],
			"<quart-us-dry>": [["qt(usd)", "quart(usd)", "quarts(usd)"], 1.10122095e-3],
			"<quart-us-liquid>": [["qt(usl)", "quart(usl)", "quarts(usl)"], 9.46352946e-4],
			"<tablespoon-metric>": [["tb", "tbs", "tablespoon", "tablespoons"], 0.000015],
			"<tablespoon-uk>": [["tb(uk)", "tbs(uk)", "tablespoon(uk)", "tablespoons(uk)"], 1.420653125e-5],
			"<tablespoon-us>": [["tb(us)", "tbs(us)", "tablespoon(us)", "tablespoons(us)"], 1.478676478125e-5],
			"<teaspoon-metric>": [["tsp", "teaspoon", "teaspoons"], 0.000005],
			"<teaspoon-us>": [["tsp(us)", "teaspoon(us)", "teaspoons(us)"], 4.92892161e-6]
		}
	}
}
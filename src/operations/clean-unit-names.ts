import { UnitTokenManager } from "../UnitTokenManager.js";

const UNITY = "<1>";

// Cleans up the the units so that they have consistent naming
// e.g. convert ["rad", "radian", "radians"] = ["rad", "rad", "rad"]
export function cleanUnitNames(num: string[], den: string[]) : string[][]
{
	const tokenMapper = UnitTokenManager.instance;

	num = num.filter(function (val) { return val !== UNITY; });
	den = den.filter(function (val) { return val !== UNITY; });

	let combined = {},
		k;

	for (let i = 0, len = num.length; i < len; i++)
	{
		let unit = tokenMapper.getUnit(num[i]);
		k = [num[i]];

		if (unit.category === 'prefix')
		{
			k.push(num[i + 1])
			i++;
		}

		if (k && k !== UNITY)
		{
			if (combined[k])
			{
				combined[k][0]++;
			}
			else
			{
				combined[k] = [1, k];
			}
		}
	}

	for (let j = 0; j < den.length; j++)
	{
		let unit = tokenMapper.getUnit(den[j]);
		k = [den[j]];

		if (unit.category === 'prefix')
		{
			k.push(den[j + 1])
			j++;
		}

		if (k && k !== UNITY)
		{
			if (combined[k])
			{
				combined[k][0]--;
			}
			else
			{
				combined[k] = [-1, k];
			}
		}
	}

	num = [];
	den = [];

	for (let prop in combined)
	{
		if (combined.hasOwnProperty(prop))
		{
			let item = combined[prop],
				n;

			if (item[0] > 0)
			{
				for (n = 0; n < item[0]; n++)
				{
					num.push(item[1]);
				}
			}
			else if (item[0] < 0)
			{
				for (n = 0; n < -item[0]; n++)
				{
					den.push(item[1]);
				}
			}
		}
	}

	if (num.length === 0)
	{
		num = [UNITY];
	}

	if (den.length === 0)
	{
		den = [UNITY];
	}

	// Flatten
	num = num.reduce(function (a: string[], b: string) {
		return a.concat(b);
	}, []);

	den = den.reduce(function (a: string[], b: string) {
		return a.concat(b);
	}, []);

	return [num, den];
}
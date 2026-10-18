import { NumberAdapter } from '@neutrium/utilities/number';

// A consumer-supplied binary32 policy, used to verify that Quantity preserves
// custom native arithmetic without depending on a built-in float adapter.
class FloatAdapter extends NumberAdapter
{
	id = 'custom-float32';
	from(value) { return Math.fround(super.from(value)); }
}

for (const method of ['add', 'sub', 'mul', 'div', 'neg', 'rem', 'abs', 'floor', 'ceil', 'trunc', 'round',
	'sqrt', 'cbrt', 'exp', 'ln', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh',
	'asinh', 'acosh', 'atanh', 'pow', 'powInteger', 'log', 'atan2', 'pi'])
{
	FloatAdapter.prototype[method] = function (...args) {
		return Math.fround(NumberAdapter.prototype[method].apply(this, args));
	};
}

export const floatAdapter = new FloatAdapter();

/** Instrument class-based adapters while preserving their private-field receiver. */
export function overrideAdapter(base, overrides)
{
	const wrapper = Object.create(Object.getPrototypeOf(base));

	for (let object = base; object !== Object.prototype; object = Object.getPrototypeOf(object))
	{
		for (const key of Reflect.ownKeys(object))
		{
			if (key === 'constructor' || Object.hasOwn(wrapper, key)) continue;

			const value = base[key];
			Object.defineProperty(wrapper, key, { value: typeof value === 'function' ? value.bind(base) : value,
				writable: true, configurable: true, enumerable: true });
		}
	}

	return Object.assign(wrapper, overrides);
}

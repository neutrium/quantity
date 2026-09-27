# Quantity benchmarks

```sh
npm run benchmark
npm run benchmark -- parsers
npm run benchmark -- -t conversion
```

Each command builds fresh `dist` output. The first runs all benchmarks once; the other commands filter by file or benchmark name. Vitest's module runner is disabled so Node executes the compiled ESM without Vite's import getter instrumentation. Benchmarks use a separate configuration, run one file at a time, and do not run with ordinary tests or gate CI. Vitest prints statistics and comparisons to `benchmark/results/vitest.json` (ignored by Git). Each run replaces this report; copy it elsewhere before the next run if you need to retain a baseline. Commit metadata does not describe uncommitted working-tree changes.

By default, generated reports are local artifacts in the Git-ignored `benchmark/results/` directory. The standalone scripts create this directory automatically and save to:

| Script | Default report |
| --- | --- |
| `tools/benchmark-powers.mjs` | `benchmark/results/powers.json` |
| `tools/benchmark-base-values.mjs` | `benchmark/results/base-values.json` |
| `tools/benchmark-nearley-cold.mjs` | `benchmark/results/nearley-cold.json` |

An optional first argument overrides a standalone script's output path. To keep a baseline in the ignored directory, for example, pass `benchmark/results/base-values-before.json`. Default paths resolve relative to the repository; explicit relative paths resolve from the current working directory. Historical `*-results.json` reports referenced below also live in this directory when available locally; they are not distributed with a fresh checkout. New runs use the default filenames above and do not overwrite those historical reports.

The standalone scripts share `benchmark/measure.js`: five samples of at least 200 ms, reporting median microseconds per operation. Powers and cold parsing use 20 warmup calls; base-value workloads use 1,000. All retain and validate the last result after warmup and after each sample, outside timing. Cold parsing clears its cache before each operation outside the timer; warm workloads time a batch of calls. The Vitest suite retains its statistical runner and the settings described below.

## Workloads

- Parser comparisons cover simple, compound, powered and scientific-notation expressions. Each compares constructing a wrapper and parsing with reusing the wrapper. A separate case covers Nearley's parenthesized expressions, which the Regex parser does not support.
- A Nearley-only workload varies the scalar in `n/2 (kg·m/s)²` to exercise cached scalar operations and Unicode notation.
- Construction covers the public Quantity API with the default parser, an explicit Regex parser, separate scalar/units, and a preparsed definition.
- Conversions cover length, speed and absolute temperature. Each measures construction plus conversion, first conversion on a fresh instance prepared outside the timer, and repeated conversion on a warmed instance.
- Arithmetic uses prepared operands for addition, subtraction, multiplication, division, scalar multiplication and positive/negative integer powers. Different-unit addition combines exact unit factors before final rounding; it does not benchmark a call to `to()`.
- Comparisons cover `lte` and `gte` with string operands and `compareTo` with an existing quantity.

All workloads validate their results before timing and consume and validate the last measured result afterwards. Assertions and expected-value construction are outside timed callbacks. Setup hooks allocate fresh instances outside the timer; their allocations can still affect garbage collection during a run.

These are steady-state measurements: module initialization and both parsers' shared unit-expression caches are warmed. Constructing a new parser wrapper does not clear these caches. Nearley evaluates the scalar on every call and creates an internal Nearley parser only on a unit-expression cache miss, with isolated lexer state. The compiled grammar is shared across calls and wrappers. Fresh-instance conversion
cases measure an empty instance conversion cache, not a cold process.

The changing-scalar parser workload cycles through 2,048 values with fixed units, while the distinct-unit workload cycles through 2,048 unit powers to exceed the 1,024-entry expression caches. The latter includes parsing and cache maintenance on misses, with grammar initialization and individual unit definitions still warm.

The scalar-expression/Unicode implementation was also compared with the preceding LRU/deferred-resolution implementation on an Apple M4 Pro, Node 26.5.0. Using `tools/benchmark-nearley-cold.mjs` (five samples of at least 200 ms, clearing the expression cache outside timing), simple and two-unit misses were essentially unchanged: 1.56 → 1.58 µs and 4.88 → 4.77 µs. Long uncached chains were about 11–12% slower: 400 distinct terms took 706 → 783 µs. The broader grammar has a measurable cost despite eliminating repeated prefix lexing. These are local microbenchmarks, not application-wide estimates; raw settings and results are in `benchmark/results/nearley-expression-results.json`.

The cached-conversion cases time **100 calls per operation** across 100 warmed instances, retaining every result in a preallocated array. This reduces timer overhead and avoids a loop whose identical results are discarded. Array access and result storage are included. Their reported throughput is batches/second: multiply by 100 for calls/second, or divide latency by 100 for average time/call. Other cases perform one library operation per measurement. Rankings across different workloads show relative costs, not interchangeable implementations.

## Measurement settings

The defaults are 250 ms warmup and 500 ms measurement per case, with at least 64 iterations in each phase. For more stable local comparisons:

```sh
BENCH_WARMUP_MS=1000 BENCH_TIME_MS=2000 npm run benchmark
```

For a fast correctness smoke run (not useful performance evidence):

```sh
BENCH_WARMUP_MS=10 BENCH_TIME_MS=20 npm run benchmark
```

Compare repeated runs on the same machine and Node version with other intensive work stopped. Inspect sample variation and relative margin of error before attributing small changes to the code. Shared CI runners are suitable for smoke
checks and collecting artifacts, but should not impose timing thresholds without first establishing a reliable baseline.

## Version 5 counted powers

Measured on an Apple M4 Pro, Node 26.5.0, macOS arm64, against version 4.0.0 (commit `fd536c4`). The following results are medians of five samples of at least 200 ms each, after 20 warmup calls. Shared caches are warm. These are local microbenchmarks, not application-wide speedups or confidence intervals.

| Workload | v4 µs/op | v5 µs/op | Speedup |
| --- | ---: | ---: | ---: |
| Construct `1 m`, then `.pow(100)` | 37.380 | 3.410 | 10.96× |
| Construct `1 m`, then `.pow(1000)` | 1,002.004 | 3.471 | 288.66× |
| Construct `1 m`, then `.pow(10000)` | 69,450.347 | 3.435 | 20,219.06× |
| Nearley Quantity `1 m10000` | 4,314.611 | 3.262 | 1,322.80× |
| Regex Quantity `1 m10000` | 285.707 | 0.417 | 685.53× |
| Add prepared quantities (`2 m` + `3 m`) | 0.406 | 0.347 | 1.17× |
| Multiply prepared quantities (`2 m` × `3 s`) | 1.239 | 0.847 | 1.46× |
| Nearley Quantity `2 km/h` | 5.282 | 4.522 | 1.17× |
| Regex Quantity `2 km/h` | 1.140 | 0.959 | 1.19× |

At a million, constructing `1 m` and applying `.pow(1000000)` took about 3.7 µs; Nearley and Regex construction of `1 m1000000` took 3.5 and 0.44 µs respectively. Version 4 was not run at a million to avoid its excessive allocation. Version 5 stores one numerator record at both 10,000 and 1,000,000,
instead of one entry per unit occurrence. This measures unit handling with a scalar of 1; other scalar powers still incur Decimal arithmetic costs.

The ordinary workloads above also improved, but their smaller differences are more sensitive to runtime and machine noise. Regex results include its warm unit cache; they do not measure cold pattern initialization or uncached expressions.

Reproduce the candidate measurements after building:

```sh
npm run build
LARGE_POWERS=1 node tools/benchmark-powers.mjs
```

Omit `LARGE_POWERS` for the baseline workloads. Historical local reports retain raw medians and environment in `benchmark/results/counted-units-results.json`. The benchmark script imports compiled `dist` files and must be run against the version being measured. Unit regression tests separately verify large-power results and stored record counts; timing is not a test assertion.

## Scalar-only base resolution

Construction now calculates base scalars and dimensional signatures from cached unit metadata, without creating temporary base quantities. Conversion maps are allocated on first use. Existing Quantity conversion targets provide their unit factor directly, without a scalar-one copy; temperature interval conversion also uses a scalar calculation instead of a temporary kelvin Quantity. Explicit `toBase()` continues to return a Quantity.

Measured on an Apple M4 Pro, Node 26.5.0, macOS arm64. The baseline is the v5 working tree after structural unit identity, formatter round trips, and capacitance fixes; the candidate adds the allocation changes above. Each result is the median of five samples of at least 200 ms after 1,000 warmup calls, with shared caches warm. These are local microbenchmarks, not application-wide speedups or confidence
intervals. Small differences, especially the base-quantity control, are sensitive to machine and runtime noise. Copy and arithmetic cases use prepared operands; the parser cases construct from strings on every iteration.

| Workload | Before µs/op | After µs/op | Time reduction |
| --- | ---: | ---: | ---: |
| Copy base quantity (`2 m`) | 0.251 | 0.231 | 8% |
| Copy scaled quantity (`2 km`) | 0.570 | 0.320 | 44% |
| Copy derived quantity (`2 farad`) | 0.795 | 0.337 | 58% |
| Copy temperature (`32 tempF`) | 1.201 | 0.614 | 49% |
| Multiply prepared `2 km` by 2 | 0.709 | 0.456 | 36% |
| Clone prepared `2 km` | 0.566 | 0.314 | 44% |
| Prepared `2 km` → base units | 0.444 | 0.247 | 44% |
| Nearley construction (`2 km`) | 3.487 | 3.141 | 10% |
| Regex construction (`2 km`) | 0.767 | 0.483 | 37% |

Construction-count regression tests verify one Quantity per requested non-base construction (including cold unit metadata), arithmetic result, and direct conversion to an existing target. They also cover both parser entry points, absolute-zero validation, target scalar zero, and temperature interval semantics.
Timing is not a test assertion.

Reproduce the candidate measurements after building:

```sh
npm run build
node tools/benchmark-base-values.mjs
```

The script imports compiled `dist` files and must be run against the version being measured. Raw medians and environment are retained in `benchmark/results/base-values-results.json`. It validates result scalars and base scalars outside the timed loops. The benchmark table measures construction, copying, scalar multiplication, and base conversion; it does not quantify the separate existing-target or temperature interval conversion changes.

## Cold Nearley unit expressions

Nearley now retains product and division operands in an internal expression tree instead of repeatedly copying accumulated unit records. An iterative traversal consolidates records after the complete parse. Powered groups resolve their children before scaling, preserving intermediate count-overflow checks, including under an outer zero power. Simple expressions reuse resolved arrays directly. The public counted-unit definitions, frozen records, unit order, and operator precedence are unchanged.

Measured on an Apple M4 Pro, Node 26.5.0, macOS arm64. The baseline is the working tree immediately before deferred resolution; both versions include the existing Nearley unit-expression cache. Each result is the median of five samples of at least 200 ms after 20 warmup calls. The benchmark clears the unit-expression cache before every parse, outside timing; grammar and unit-alias caches remain warm.

| Workload | Before µs/op | After µs/op | Speedup |
| --- | ---: | ---: | ---: |
| Simple unit (`m`) | 1.657 | 1.671 | 0.99× |
| Compound units (`2 km/s`) | 5.189 | 5.303 | 0.98× |
| Product of 50 distinct terms | 322.965 | 87.830 | 3.68× |
| Product of 100 distinct terms | 1,141.720 | 182.172 | 6.27× |
| Product of 200 distinct terms | 4,371.792 | 373.077 | 11.72× |
| Product of 400 distinct terms | 17,357.920 | 764.130 | 22.72× |

The 400-term case takes 95.6% less time, and the measured flat-product cost now grows roughly in proportion to term count. Deeply nested powered groups can still revisit resolved units at each power boundary. Simple controls are slightly slower in this run; differences this small are sensitive to machine and runtime noise. These are local cold-cache parser microbenchmarks, not application-wide speedups or confidence intervals. They include per-operation timer overhead and do not measure repeated cache hits or Quantity construction.

Reproduce the candidate measurements after building:

```sh
npm run build
node tools/benchmark-nearley-cold.mjs
```

The script imports compiled `dist` files and uses the public `parser.clearCache()` method to clear the expression cache. It verifies definitions against the Regex parser outside timing. Raw medians and environment are retained in `benchmark/results/nearley-cold-results.json`. Regression tests separately cover long expressions, grouping, division, powers, ordering, immutable cached records, and safe-integer overflow; timing is not a test assertion.

## Lazy base values and read-only quantity fields

Construction now validates units and dimensions without calculating numerical base values. `baseScalar` evaluates on first access, caches the result, and refreshes when the shared Decimal settings change. These measurements include the getter-only public fields and frozen input snapshots.

Local Node 26.5.0 measurements using `node tools/benchmark-base-values.mjs`: warm inputs, median of five samples of at least 200 ms each. Scalar and base-value correctness is checked outside the timed loop.

| Operation | Before (µs/op) | After (µs/op) | Speedup |
| --- | ---: | ---: | ---: |
| Construct `1 degF` | 3.90 | 0.64 | 6.1× |
| Construct `1 tempF` | 3.97 | 0.92 | 4.3× |
| Construct `1 ft10000` | 99.81 | 0.57 | 174× |
| Copy a scaled quantity | 0.64 | 0.26 | 2.5× |
| Copy a base quantity | 0.23 | 0.25 | 0.95× |
| Explicit `toBase()` | 0.25 | 0.26 | 0.96× |

The improvements apply when the numerical base value is unused. A first base-value read still pays for that calculation; these are microbenchmarks, not application speedups. Raw results are in `benchmark/results/lazy-base-values-results.json`.

# Quantity benchmarks

```sh
npm run benchmark
npm run benchmark -- parsers
npm run benchmark -- -t conversion
```

Each command builds fresh `dist` output. The first runs all benchmarks once; the other commands filter by file or benchmark name. Vitest's module runner is disabled so Node executes the compiled ESM without Vite's import getter instrumentation. Benchmarks use a separate configuration, run one file at a time, and do not run with ordinary tests or gate CI. Vitest prints statistics and comparisons to `benchmark/results/vitest.json` (ignored by Git). Each run replaces this report; copy it elsewhere before the next run if you need to retain a baseline. Commit metadata does not describe uncommitted working-tree changes.

## Workloads

- Parser comparisons cover simple, compound, powered and scientific-notation expressions. Each compares constructing a wrapper and parsing with reusing the wrapper. A separate case covers Nearley's parenthesized expressions, which the Regex parser does not support.
- Construction covers the public Quantity API with the default parser, an explicit Regex parser, separate scalar/units, and a preparsed definition.
- Conversions cover length, speed and absolute temperature. Each measures construction plus conversion, first conversion on a fresh instance prepared outside the timer, and repeated conversion on a warmed instance.
- Arithmetic uses prepared operands for addition, subtraction, multiplication, division, scalar multiplication and positive/negative integer powers. Different unit addition uses a warmed conversion cache.

All workloads validate their results before timing and consume and validate the last measured result afterwards. Assertions and expected-value construction are outside timed callbacks. Setup hooks allocate fresh instances outside the timer; their allocations can still affect garbage collection during a run.

These are steady-state measurements: module initialization, shared unit caches, and the Regex parser's static cache are warmed. Constructing a new Regex parser does not clear its static cache. Reusing the Nearley wrapper does not reuse its
internal Nearley parser, which is recreated on each call. Fresh-instance conversion cases measure an empty instance conversion cache, not a cold process.

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

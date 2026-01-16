Benchmark helper

Open `test/benchmark.html` while the dev server is running (e.g. `npm run dev`).

This page will:

- generate a synthetic payload of N keywords (configurable on the page)
- run import via the existing worker `src/workers/keywords.worker.ts` using multiple `chunkSize` values
- clear the `keywords` store between runs
- report timings and inserted counts

Notes:

- The page must be opened from the dev server (Vite) so the module worker resolves correctly.
- Default sizes: 100000 keywords, chunk sizes [1000,2000,5000,10000]. Adjust as needed.
- After run, check browser DevTools Console and Application > IndexedDB to inspect results.

If you want, I can add an automated Puppeteer script to run this headlessly, but that requires adding dependencies and CI setup. For quick local profiling, open this page in your browser and run the benchmark.

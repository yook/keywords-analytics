// Benchmark harness for import via worker + IndexedDB
// Usage: open test/benchmark.html while running dev server

const runBtn = document.getElementById("run");
const clearBtn = document.getElementById("clear");
const status = document.getElementById("status");
const resultsDiv = document.getElementById("results");

// Default chunk sizes (will be rebuilt from UI inputs before run)
let CHUNK_SIZES = [500, 1000, 1500, 2000];

// utility to create module worker referencing project worker
function makeWorker() {
  // Use module URL so Vite resolves the TS worker source
  return new Worker(
    new URL("../src/workers/keywords.worker.ts", import.meta.url),
    { type: "module" }
  );
}

function postWithResponse(worker, type, payload) {
  return new Promise((resolve, reject) => {
    const requestId =
      String(Date.now()) + "-" + Math.random().toString(36).slice(2);
    function handler(e) {
      const msg = e.data || {};
      if (msg.requestId && msg.requestId !== requestId) return;
      if (msg.type === "error") {
        worker.removeEventListener("message", handler);
        reject(msg.error || "worker error");
        return;
      }
      if (msg.type === `${type}:done`) {
        worker.removeEventListener("message", handler);
        resolve(msg);
        return;
      }
      // progress messages are forwarded as-is
      if (msg.type === `${type}:progress`) {
        // fallthrough - user can listen by separate handler
      }
    }
    worker.addEventListener("message", handler);
    worker.postMessage({ type, payload, requestId });
  });
}

async function clearKeywords(worker) {
  return postWithResponse(worker, "clearKeywords", undefined);
}

async function runImport(worker, raw, projectId, chunkSize, onProgress) {
  return new Promise((resolve, reject) => {
    const requestId =
      String(Date.now()) + "-" + Math.random().toString(36).slice(2);

    function handler(e) {
      const msg = e.data || {};
      if (msg.requestId && msg.requestId !== requestId) return;
      if (msg.type === "error") {
        worker.removeEventListener("message", handler);
        reject(new Error(msg.error || "worker error"));
        return;
      }
      if (msg.type === "saveKeywords:progress") {
        if (onProgress) onProgress(msg);
        return;
      }
      if (msg.type === "saveKeywords:done") {
        worker.removeEventListener("message", handler);
        resolve(msg);
        return;
      }
    }

    worker.addEventListener("message", handler);
    worker.postMessage({
      type: "saveKeywords",
      payload: { raw, projectId, chunkSize },
      requestId,
    });
  });
}

function generateRaw(count) {
  // simple predictable keywords; avoid heavy RNG to be repeatable
  const arr = new Array(count);
  for (let i = 0; i < count; i++) {
    arr[i] = `kw-${i}`;
  }
  return arr.join("\n");
}

function appendStatus(txt) {
  status.innerText = txt;
}

function renderResultsTable(rows) {
  let html =
    "<table><thead><tr><th>chunk</th><th>count</th><th>inserted</th><th>ms</th><th>ms/rec</th></tr></thead><tbody>";
  for (const r of rows) {
    html += `<tr><td>${r.chunk}</td><td>${r.count}</td><td>${
      r.inserted
    }</td><td>${r.ms}</td><td>${(r.ms / r.inserted).toFixed(3)}</td></tr>`;
  }
  html += "</tbody></table>";
  resultsDiv.innerHTML = html;
}

runBtn.addEventListener("click", async () => {
  const count = Number(document.getElementById("count").value) || 100000;
  const projectId =
    document.getElementById("projectId").value || "bench-project";
  // Build chunk sizes from inputs (min..max step)
  const min = Math.max(
    1,
    Number(document.getElementById("chunkMin").value) || 500
  );
  const max = Math.max(
    min,
    Number(document.getElementById("chunkMax").value) || 2000
  );
  const step = Math.max(
    1,
    Number(document.getElementById("chunkStep").value) || 500
  );
  CHUNK_SIZES = [];
  for (let v = min; v <= max; v += step) CHUNK_SIZES.push(v);

  runBtn.disabled = true;
  runBtn.disabled = true;
  clearBtn.disabled = true;
  appendStatus("Generating raw payload...");
  await new Promise((r) => setTimeout(r, 20));
  const raw = generateRaw(count);

  const worker = makeWorker();
  const rows = [];

  // Add a global progress listener to show last progress
  worker.addEventListener("message", (e) => {
    const m = e.data || {};
    if (m.type === "saveKeywords:progress") {
      appendStatus(
        `chunk ${m.requestId || ""} progress ${m.written} / ${m.total}`
      );
    }
  });

  for (const chunk of CHUNK_SIZES) {
    appendStatus(`Clearing DB before run chunk=${chunk}...`);
    try {
      await clearKeywords(worker);
    } catch (err) {
      appendStatus("clear failed: " + String(err));
      break;
    }
    await new Promise((r) => setTimeout(r, 50));

    appendStatus(`Running import: count=${count}, chunk=${chunk} ...`);
    const t0 = performance.now();
    let result;
    try {
      result = await runImport(worker, raw, projectId, chunk, (p) => {
        appendStatus(`chunk=${chunk}: ${p.written}/${p.total}`);
      });
    } catch (err) {
      appendStatus("import failed: " + String(err));
      break;
    }
    const t1 = performance.now();
    const ms = Math.round(t1 - t0);
    rows.push({ chunk, count, inserted: result.count || 0, ms });
    renderResultsTable(rows);
    await new Promise((r) => setTimeout(r, 200));
  }

  appendStatus("Benchmark finished");
  runBtn.disabled = false;
  clearBtn.disabled = false;
});

clearBtn.addEventListener("click", async () => {
  const worker = makeWorker();
  appendStatus("Clearing keywords store...");
  try {
    await clearKeywords(worker);
    appendStatus("Cleared");
  } catch (e) {
    appendStatus("Clear failed: " + String(e));
  }
});

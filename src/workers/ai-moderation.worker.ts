type ModerationItem = { id: string; keyword: string };

type ModerationResult = {
  id: string;
  flagged: boolean;
  categories: string[];
};

const OPENAI_MODERATION_URL = 'https://api.openai.com/v1/moderations';

async function fetchModeration(
  texts: string[],
  apiKey: string,
  model: string,
) {
  const response = await fetch(OPENAI_MODERATION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input: texts }),
  });

  if (!response.ok) {
    let details = '';
    try {
      const err = await response.json();
      details = JSON.stringify(err).slice(0, 1024);
    } catch (e) {}
    throw new Error(`OpenAI moderation error ${response.status}: ${details}`);
  }

  return response.json();
}

function mapResults(
  items: ModerationItem[],
  results: any[],
): ModerationResult[] {
  const mapped: ModerationResult[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const r = results && results[i] ? results[i] : null;
    const categories = (r && r.categories) || {};
    const categoryList = Object.keys(categories).filter(
      (key) => !!categories[key],
    );
    const flagged = categoryList.length > 0;
    mapped.push({
      id: item.id,
      flagged,
      categories: categoryList,
    });
  }
  return mapped;
}

self.onmessage = async (event: MessageEvent) => {
  const msg = event.data || {};
  if (msg.type !== 'moderation') return;

  const requestId = msg.requestId;
  const payload = msg.payload || {};
  const items: ModerationItem[] = Array.isArray(payload.items)
    ? payload.items
    : [];
  const apiKey: string = String(payload.apiKey || '');
  const model: string = String(payload.model || 'omni-moderation-latest');
  const chunkSize: number = Number(payload.chunkSize || 50);

  try {
    const total = items.length;
    let processed = 0;
    const results: ModerationResult[] = [];

    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      const texts = chunk.map((it) => it.keyword);
      const data = await fetchModeration(texts, apiKey, model);
      const batchResults = Array.isArray(data?.results) ? data.results : [];
      results.push(...mapResults(chunk, batchResults));
      processed += chunk.length;
      const percent = Math.round((processed / Math.max(1, total)) * 100);
      (self as any).postMessage({
        type: "moderation:progress",
        requestId,
        processed,
        total,
        percent,
      });
    }

    (self as any).postMessage({
      type: 'moderation:done',
      requestId,
      results,
    });
  } catch (err: any) {
    (self as any).postMessage({
      type: 'error',
      requestId,
      error: err?.message || String(err),
      stack: err?.stack || '',
    });
  }
};

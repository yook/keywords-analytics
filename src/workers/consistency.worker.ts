import { LemmasDict, loadLemmaDict } from './lemma-dict';

type ResolvedEntry = {
  lemma: string;
  grammemes?: string[];
};

let sharedPort: MessagePort | null = null;
let requestSeq = 0;
const pending = new Map<string, { resolve: (v: any) => void; reject: (e: any) => void }>();
const entryCache = new Map<string, ResolvedEntry | null>();
let sharedDictReady = false;
let sharedDictReadyPromise: Promise<void> | null = null;
let sharedDictReadyResolve: (() => void) | null = null;
let sharedDictReadyReject: ((error: any) => void) | null = null;
const supportsSharedWorker = typeof SharedWorker !== 'undefined';
let localDict: LemmasDict | null = null;
let localGrammarTable: string[] | null = null;
let localLoadPromise: Promise<void> | null = null;

function initSharedPort() {
  if (!supportsSharedWorker) return null;
  if (sharedPort) return sharedPort;
  const shared = new SharedWorker(new URL('./lemma-dict.shared.ts', import.meta.url), {
    type: 'module',
    name: 'lemma-dict-shared',
  });
  const port = shared.port;
  port.onmessage = (ev: MessageEvent) => {
    const msg = (ev as any).data || {};
    if (msg.type === 'lemma:ready') {
      markSharedDictReady();
      return;
    }
    if (msg.type === 'lemma:entries' && msg.requestId) {
      const pendingReq = pending.get(msg.requestId);
      if (pendingReq) {
        pending.delete(msg.requestId);
        pendingReq.resolve(msg.entries || {});
      }
    }
    if (msg.type === 'lemma:error' && msg.requestId) {
      const pendingReq = pending.get(msg.requestId);
      if (pendingReq) {
        pending.delete(msg.requestId);
        pendingReq.reject(new Error(msg.error || 'lemma shared error'));
      }
    }
    if (msg.type === 'lemma:error' && !msg.requestId) {
      markSharedDictFailed(new Error(msg.error || 'lemma shared error'));
    }
  };
  try {
    port.start?.();
  } catch (_) {}
  sharedPort = port;
  return port;
}

function markSharedDictReady() {
  sharedDictReady = true;
  if (sharedDictReadyResolve) {
    sharedDictReadyResolve();
    sharedDictReadyResolve = null;
    sharedDictReadyReject = null;
    sharedDictReadyPromise = null;
  }
}

function markSharedDictFailed(error: any) {
  sharedDictReady = false;
  if (sharedDictReadyReject) {
    sharedDictReadyReject(error);
    sharedDictReadyResolve = null;
    sharedDictReadyReject = null;
    sharedDictReadyPromise = null;
  }
}

async function fetchEntries(words: string[]) {
  if (!words.length) return;
  if (supportsSharedWorker) {
    const port = initSharedPort();
    if (!port) return;
    const requestId = `${Date.now()}-${requestSeq++}`;
    const promise = new Promise<Record<string, ResolvedEntry | null>>((resolve, reject) => {
      pending.set(requestId, { resolve, reject });
    });
    port.postMessage({ type: 'lemma:get', requestId, words });
    const entries = await promise;
    Object.entries(entries || {}).forEach(([k, v]) => {
      if (!entryCache.has(k)) entryCache.set(k, v || null);
    });
  } else {
    await loadLocalEntries(words);
  }
}

function resolveLocalEntry(word: string): ResolvedEntry | null {
  if (!localDict) return null;
  const entry = localDict[word];
  if (!entry) return null;
  const grammemes: string[] | undefined = entry.grammemeIndexes && localGrammarTable
    ? Array.from(entry.grammemeIndexes).map((idx) => localGrammarTable![idx]).filter(Boolean)
    : undefined;
  return { lemma: entry.lemma, grammemes };
}

async function ensureLocalDictLoaded() {
  if (localDict) return;
  if (!localLoadPromise) {
    localLoadPromise = loadLemmaDict()
      .then(({ dict, grammarTable }) => {
        localDict = dict;
        localGrammarTable = grammarTable;
        markSharedDictReady();
      })
      .catch((err) => {
        markSharedDictFailed(err);
        throw err;
      });
  }
  await localLoadPromise;
}

async function loadLocalEntries(words: string[]) {
  await ensureLocalDictLoaded();
  for (const word of words) {
    const key = String(word || '').toLowerCase();
    if (!key) continue;
    if (entryCache.has(key)) continue;
    entryCache.set(key, resolveLocalEntry(key));
  }
}

async function ensureEntries(words: string[]) {
  const missing: string[] = [];
  for (const w of words) {
    const key = String(w || '').toLowerCase();
    if (!key) continue;
    if (!entryCache.has(key)) missing.push(key);
  }
  if (missing.length) {
    await fetchEntries(missing);
  }
}

async function waitForSharedLemmaDictReady() {
  if (sharedDictReady) return;
  if (!supportsSharedWorker) {
    await ensureLocalDictLoaded();
    return;
  }
  const port = initSharedPort();
  if (!port) return;
  if (!sharedDictReadyPromise) {
    sharedDictReadyPromise = new Promise<void>((resolve, reject) => {
      sharedDictReadyResolve = resolve;
      sharedDictReadyReject = reject;
    });
  }
  try {
    port.postMessage({ type: 'lemma:load' });
  } catch (err) {
    markSharedDictFailed(err);
  }
  return sharedDictReadyPromise;
}

let currentRequestId: string | null = null;

self.addEventListener('error', (event) => {
  try {
    self.console?.error(
      '[consistency worker] uncaught error event',
      event.message,
      event.filename,
      event.lineno,
      event.colno,
      event.error
    );
    self.postMessage({
      type: 'consistency:error',
      requestId: currentRequestId,
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error ? String(event.error) : null,
      stack: event.error?.stack || null,
    });
  } catch (e) {
    // ignore logging failure
  }
  event.preventDefault?.();
});

self.addEventListener('unhandledrejection', (event) => {
  try {
    self.console?.error('[consistency worker] unhandled rejection', event.reason);
    self.postMessage({
      type: 'consistency:error',
      requestId: currentRequestId,
      message: event.reason ? String(event.reason) : 'Unhandled rejection',
      error: event.reason ? String(event.reason) : null,
    });
  } catch (e) {}
  event.preventDefault?.();
});

type ParseCandidate = {
  pos: string;
  grammemes: string[];
  normal: string;
};

const NOMINATIVE_TAGS = ['ИМ', 'ИМЯ', 'NOM', 'NOMN'];
const ACCUSATIVE_TAGS = ['ВН', 'ACC', 'ACCS'];
const GENITIVE_TAGS = ['РД', 'GEN', 'GENT'];
const GENDER_TAGS = ['МР', 'ЖР', 'СР', 'MASC', 'FEM', 'FEMN', 'NEUT'];
const NUMBER_TAGS = ['ЕД', 'МН', 'SING', 'PL', 'PLUR'];
const PREPOSITIONS = [
  'ДЛЯ',
  'НА',
  'В',
  'ВО',
  'К',
  'О',
  'ОБ',
  'ОБО',
  'ПО',
  'ПРИ',
  'У',
  'С',
  'ИЗ',
  'ИЗО',
  'ПОД',
  'ПОДО',
  'ПЕРЕД',
  'ПЕРЕДО',
  'ОТ',
];
const PRODUCT_WHITELIST = new Set(['бафф', 'парео', 'клатч', 'шопер', 'дартс', 'легинсы']);

function _normTokensFromArray(arr: unknown[]) {
  if (!Array.isArray(arr)) return [];
  const out: string[] = [];
  for (const item of arr) {
    if (!item && item !== 0) continue;
    const s = String(item).toUpperCase();
    const parts = s
      .split(/[^A-ZА-Я0-9]+/u)
      .map((p) => p.trim())
      .filter(Boolean);
    for (const p of parts) out.push(p);
  }
  return out;
}

const NORM_NOMINATIVE = new Set(_normTokensFromArray(NOMINATIVE_TAGS));
const NORM_ACCUSATIVE = new Set(_normTokensFromArray(ACCUSATIVE_TAGS));
const NORM_GENITIVE = new Set(_normTokensFromArray(GENITIVE_TAGS));
const NORM_GENDER = new Set(_normTokensFromArray(GENDER_TAGS));
const NORM_NUMBER = new Set(_normTokensFromArray(NUMBER_TAGS));

function tokenise(text: string) {
  return String(text || '')
     // Keep letters, numbers, spaces, hyphens, apostrophes; drop everything else
     .replace(/[^\p{L}\p{N}\s'-]+/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.trim());
}

function grammemeIncludes(grammemes: unknown, probes: string[]) {
  if (!Array.isArray(grammemes)) return false;
  const tokens = _normTokensFromArray(grammemes);
  if (!tokens.length) return false;
  let probeSet: Set<string> | null = null;
  if (probes === NOMINATIVE_TAGS) probeSet = NORM_NOMINATIVE;
  else if (probes === ACCUSATIVE_TAGS) probeSet = NORM_ACCUSATIVE;
  else if (probes === GENITIVE_TAGS) probeSet = NORM_GENITIVE;
  else if (probes === GENDER_TAGS) probeSet = NORM_GENDER;
  else if (probes === NUMBER_TAGS) probeSet = NORM_NUMBER;
  else probeSet = new Set(_normTokensFromArray(probes));
  return tokens.some((t) => probeSet?.has(t));
}

function parseHasGender(p: ParseCandidate, probeGender: string[]) {
  if (!p.grammemes) return false;
  const tokens = _normTokensFromArray(p.grammemes);
  if (!tokens.length) return false;
  let probeSet: Set<string> | null = null;
  if (probeGender === GENDER_TAGS) probeSet = NORM_GENDER;
  else probeSet = new Set(_normTokensFromArray(probeGender));
  return tokens.some((t) => probeSet?.has(t));
}

function parseHasNumber(p: ParseCandidate, probeNumber: string[]) {
  if (!p.grammemes) return false;
  const tokens = _normTokensFromArray(p.grammemes);
  if (!tokens.length) return false;
  let probeSet: Set<string> | null = null;
  if (probeNumber === NUMBER_TAGS) probeSet = NORM_NUMBER;
  else probeSet = new Set(_normTokensFromArray(probeNumber));
  return tokens.some((t) => probeSet?.has(t));
}

function guessPosFromGrammemes(grammemes: string[]) {
  const normalized = grammemes.map((g) => String(g).toUpperCase());
  if (normalized.some((g) => ['S', 'С', 'NOUN', 'SUBST', 'СУЩ'].some((token) => g.includes(token)))) return 'S';
  if (normalized.some((g) => ['A', 'ADJ', 'ПРИЛ', 'QUAL'].some((token) => g.includes(token)))) return 'A';
  if (normalized.some((g) => ['V', 'INF', 'VERB', 'ГЛ'].some((token) => g.includes(token)))) return 'V';
  if (normalized.some((g) => ['NUM', 'ЧИС'].some((token) => g.includes(token)))) return 'NUM';
  return normalized[0] || '';
}

function getParses(word: string) {
  const lowered = String(word || '').toLowerCase();
  const entry = entryCache.get(lowered) || null;
  if (!entry) return [];
  const grammemes = entry.grammemes ? entry.grammemes.filter(Boolean) : [];
  const pos = guessPosFromGrammemes(grammemes);
  return [
    {
      pos,
      grammemes,
      normal: entry.lemma || word,
    },
  ];
}

function describeLexicalGap(tokens: string[]) {
  for (const token of tokens) {
    const raw = String(token || '').trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (!entryCache.has(key)) continue;
    const entry = entryCache.get(key);
    if (entry === null) {
      return `Слово "${raw}" отсутствует в словаре, поэтому морфологию не удалось разобрать.`;
    }
    const grammemes = entry.grammemes || [];
    if (!grammemes.length) {
      return `Не удалось получить граммему для слова "${raw}" — словарь её не содержит.`;
    }
  }
  return null;
}

function nounAdjAgree(nounParses: ParseCandidate[], adjParses: ParseCandidate[]) {
  for (const n of nounParses) {
    for (const a of adjParses) {
      const nHasNom = grammemeIncludes(n.grammemes, NOMINATIVE_TAGS);
      const aHasNom = grammemeIncludes(a.grammemes, NOMINATIVE_TAGS);
      const nHasAcc = grammemeIncludes(n.grammemes, ACCUSATIVE_TAGS);
      const aHasAcc = grammemeIncludes(a.grammemes, ACCUSATIVE_TAGS);
      const nHasGen = grammemeIncludes(n.grammemes, GENITIVE_TAGS);
      const aHasGen = grammemeIncludes(a.grammemes, GENITIVE_TAGS);
      let caseTag: 'nom' | 'acc' | 'gen' | null = null;
      if ((nHasNom || aHasNom) && nHasNom && aHasNom) caseTag = 'nom';
      else if ((nHasAcc || aHasAcc) && nHasAcc && aHasAcc) caseTag = 'acc';
      else if ((nHasGen || aHasGen) && nHasGen && aHasGen) caseTag = 'gen';
      else if (!nHasNom && !nHasAcc && !aHasNom && !aHasAcc) caseTag = null;
      else continue;
      const nHasGender = parseHasGender(n, GENDER_TAGS);
      const aHasGender = parseHasGender(a, GENDER_TAGS);
      if (nHasGender && aHasGender) {
        const nGender = n.grammemes.map((g) => String(g).toLowerCase()).find((g) => GENDER_TAGS.includes(g));
        const aGender = a.grammemes.map((g) => String(g).toLowerCase()).find((g) => GENDER_TAGS.includes(g));
        if (nGender && aGender && nGender !== aGender) {
          const nHasNumberInner = parseHasNumber(n, NUMBER_TAGS);
          const aHasNumberInner = parseHasNumber(a, NUMBER_TAGS);
          if (!(nHasNumberInner && aHasNumberInner)) continue;
          const nNumInner = n.grammemes.map((g) => String(g).toLowerCase()).find((g) => NUMBER_TAGS.includes(g));
          const aNumInner = a.grammemes.map((g) => String(g).toLowerCase()).find((g) => NUMBER_TAGS.includes(g));
          if (!nNumInner || !aNumInner || nNumInner !== aNumInner) continue;
        }
      }
      const nHasNumber = parseHasNumber(n, NUMBER_TAGS);
      const aHasNumber = parseHasNumber(a, NUMBER_TAGS);
      if (nHasNumber && aHasNumber) {
        const nNum = n.grammemes.map((g) => String(g).toLowerCase()).find((g) => NUMBER_TAGS.includes(g));
        const aNum = a.grammemes.map((g) => String(g).toLowerCase()).find((g) => NUMBER_TAGS.includes(g));
        if (nNum && aNum && nNum !== aNum) continue;
      }
      return caseTag;
    }
  }
  return null;
}

function checkHeadlineGrammar(tokens: string[]) {
  const firstTok = tokens[0] ? String(tokens[0]).toUpperCase() : null;
  const lexicalGap = describeLexicalGap(tokens);
  if (lexicalGap) {
    return { ok: false, reason: lexicalGap };
  }
  if (firstTok && PREPOSITIONS.includes(firstTok)) {
    return {
      ok: false,
      reason: `Первое слово "${tokens[0]}" — предлог; заголовок выглядит как фрагмент/объект без действия.`,
    };
  }
  const allParses = tokens.map((t) => ({ token: t, parses: getParses(t) }));
  for (const ap of allParses) {
    if (ap.parses && ap.parses.length) continue;
    try {
      const t = ap.token;
      let alt: string | null = null;
      if (t.match(/[ыи]$/u)) alt = t.slice(0, -1);
      else if (t.match(/ов$/u)) alt = t.replace(/ов$/u, '');
      else if (t.match(/ев$/u)) alt = t.replace(/ев$/u, '');
      if (alt) {
        const altParses = getParses(alt);
        if (altParses && altParses.length) {
          ap.parses = altParses;
        }
      }
    } catch (_) {}
  }
  const hasVerb = allParses.some((tp) =>
    tp.parses.some((p) => {
      const pos = (p.pos || '').toString().toUpperCase();
      if (pos.includes('V') || pos.includes('INF') || pos.includes('VERB') || pos === 'ИНФИНИТИВ') return true;
      if (p.grammemes && p.grammemes.some((g) => String(g).toLowerCase().includes('инф'))) return true;
      return false;
    })
  );
  if (hasVerb) {
    return { ok: true, reason: 'Есть глагол/инфинитив — заголовок содержит предикат.' };
  }
  const isNounPos = (pos: string) => {
    const p = String(pos || '').toUpperCase();
    return p === 'S' || p === 'С' || p === 'NOUN';
  };
  const isAdjPos = (pos: string) => {
    const p = String(pos || '').toUpperCase();
    return p === 'A' || p === 'П' || p === 'ADJ';
  };
  const nounCandidates: Array<any> = [];
  let adjCandidates: Array<any> = [];
  allParses.forEach((tp, idx) => {
    let nounParses = tp.parses.filter((p) => {
      if (isNounPos(p.pos)) return true;
      if (p.grammemes && p.grammemes.some((g) => String(g).toLowerCase().includes('сущ'))) return true;
      try {
        const hasGender = parseHasGender(p, GENDER_TAGS);
        const hasNumber = parseHasNumber(p, NUMBER_TAGS);
        const gramsStr = (p.grammemes || []).join(',').toLowerCase();
        const hasInf = gramsStr.includes('инф');
        if ((hasGender || hasNumber) && !hasInf) return true;
      } catch (_) {}
      return false;
    });
    try {
      if ((!nounParses || nounParses.length === 0) && tp.token) {
        const tl = String(tp.token || '').toLowerCase();
        if (PRODUCT_WHITELIST.has(tl)) {
          nounParses = [
            {
              pos: 'С',
              grammemes: ['ИМ'],
              normal: String(tp.token || '').toUpperCase(),
            },
          ];
        }
      }
    } catch (_) {}
    if (nounParses.length) {
      const prevToken = tokens[idx - 1] ? tokens[idx - 1].toUpperCase() : null;
      const inPrepositional = prevToken ? PREPOSITIONS.includes(prevToken) : false;
      const hasAdjParseOnToken = tp.parses.some((pp) => isAdjPos(pp.pos));
      let explicit = nounParses.some((p) => {
        try {
          if (isNounPos(p.pos)) return true;
          const grams = (p.grammemes || []).map((g) => String(g).toUpperCase());
          if (grams.some((g) => g.includes('СУЩ'))) return true;
          if (String(p.pos || '').toUpperCase() === 'С') {
            if (grams.some((g) => g.includes('КАЧ') || g.includes('КАЧЕ'))) {
              return false;
            }
            return true;
          }
        } catch (_) {}
        return false;
      });
      let hasQualityMarker = false;
      let hasAdjParse = hasAdjParseOnToken;
      let explicitFinal = explicit && !(hasQualityMarker && hasAdjParse);
      try {
        if (!explicitFinal) {
          const tnorm = String(tp.token || '').toLowerCase();
          if (!hasQualityMarker && /[ыи]$/u.test(tnorm)) explicitFinal = true;
        }
      } catch (_) {}
      nounCandidates.push({
        token: tp.token,
        parses: nounParses,
        idx,
        explicit: explicitFinal,
        inPrepositional,
      });
    }
    const adjParses = tp.parses.filter((p) => {
      if (isAdjPos(p.pos)) return true;
      return p.grammemes && p.grammemes.some((g) => String(g).toLowerCase().includes('прил'));
    });
    if (adjParses.length) adjCandidates.push({ token: tp.token, parses: adjParses, idx });
  });
  adjCandidates = adjCandidates.filter((adj) => {
    const prev = tokens[adj.idx - 1] ? tokens[adj.idx - 1].toUpperCase() : null;
    return !(prev && PREPOSITIONS.includes(prev));
  });
  adjCandidates = adjCandidates.filter((adj) => !nounCandidates.some((nc) => nc.idx === adj.idx && nc.explicit));
  try {
    if (nounCandidates.length > 1) {
      const explicitLeft = nounCandidates
        .filter((nc) => nc.explicit && !nc.inPrepositional)
        .sort((a, b) => a.idx - b.idx)[0];
      const laterGen = nounCandidates.find(
        (nc) =>
          nc.idx > (explicitLeft ? explicitLeft.idx : -1) &&
          nc.parses.some((p) => grammemeIncludes(p.grammemes, GENITIVE_TAGS))
      );
      if (explicitLeft && laterGen) {
        const headToken = explicitLeft.token;
        return {
          ok: true,
          reason: `Главное существительное "${headToken}" выбрано как тема: найден явный левый noun перед генитивным оборотом.`,
        };
      }
    }
  } catch (_) {}
  if (nounCandidates.length === 0) {
    return { ok: false, reason: 'Нет глагола и не обнаружено явного существительного — возможно неполный заголовок.' };
  }
  try {
    if (!hasVerb) {
      const firstNoun = [...nounCandidates].sort((a, b) => a.idx - b.idx)[0];
      try {
        if (
          firstNoun &&
          firstNoun.parses.some((p) => grammemeIncludes(p.grammemes, ACCUSATIVE_TAGS)) &&
          !firstNoun.parses.some((p) => grammemeIncludes(p.grammemes, NOMINATIVE_TAGS))
        ) {
          return {
            ok: false,
            reason: `Первое существительное "${firstNoun.token}" согласовано в винительном падеже и нет глагола — вероятный фрагмент/объект без действия.`,
          };
        }
      } catch (_) {}
    }
  } catch (_) {}
  let chosen: any = null;
  let chosenCase: 'nom' | 'acc' | 'gen' | null = null;
  let agreementFound = false;
  let chosenAdjIdx: number | null = null;
  if (adjCandidates.length > 0) {
    for (const adj of adjCandidates) {
      const adjPrevToken = tokens[adj.idx - 1] ? tokens[adj.idx - 1].toUpperCase() : null;
      if (adjPrevToken && PREPOSITIONS.includes(adjPrevToken)) continue;
      const sortedByDist = [...nounCandidates].sort((a, b) => {
        if (a.explicit && !b.explicit) return -1;
        if (!a.explicit && b.explicit) return 1;
        return Math.abs(a.idx - adj.idx) - Math.abs(b.idx - adj.idx);
      });
      for (const n of sortedByDist) {
        if (n.idx === adj.idx) continue;
        const agreeCase = nounAdjAgree(n.parses, adj.parses);
        if (agreeCase !== null) {
          if (!n.explicit) {
            const tolerantAccept = n.parses.some((p) => {
              try {
                const hasG = parseHasGender(p, GENDER_TAGS);
                const hasN = parseHasNumber(p, NUMBER_TAGS);
                const gramsStr = (p.grammemes || []).join(',').toLowerCase();
                const looksQuality = gramsStr.includes('кач') || gramsStr.includes('качe') || gramsStr.includes('каченн');
                return hasG && hasN && !looksQuality;
              } catch (_) {
                return false;
              }
            });
            if (!tolerantAccept) continue;
          }
          chosen = n;
          chosenCase = agreeCase;
          if (!chosen.explicit) {
            const explicitCandidates = nounCandidates
              .filter((nc) => nc.explicit && !nc.inPrepositional)
              .map((nc) => ({ nc, dist: Math.abs(nc.idx - adj.idx) }))
              .sort((a, b) => a.dist - b.dist);
            if (explicitCandidates.length) {
              const rep = explicitCandidates[0].nc;
              chosen = rep;
              chosenCase = rep.parses.some((p) => grammemeIncludes(p.grammemes, NOMINATIVE_TAGS)) ? 'nom' : chosenCase;
            }
          }
          agreementFound = true;
          chosenAdjIdx = adj.idx;
          break;
        }
      }
      if (chosen) break;
    }
    if (!agreementFound) {
      for (const adj of adjCandidates) {
        const sortedByDist = [...nounCandidates].sort((a, b) => {
          if (a.explicit && !b.explicit) return -1;
          if (!a.explicit && b.explicit) return 1;
          return Math.abs(a.idx - adj.idx) - Math.abs(b.idx - adj.idx);
        });
        for (const n of sortedByDist) {
          if (n.idx === adj.idx) continue;
          if (n.explicit) {
            const nHasNom = n.parses.some((p) => grammemeIncludes(p.grammemes, NOMINATIVE_TAGS));
            const adjHasNom = adj.parses.some((p) => grammemeIncludes(p.grammemes, NOMINATIVE_TAGS));
            if (nHasNom || adjHasNom) {
              chosen = n;
              chosenCase = 'nom';
              agreementFound = true;
              break;
            }
            const nHasNum = n.parses.some((p) => parseHasNumber(p, NUMBER_TAGS));
            const adjHasNum = adj.parses.some((p) => parseHasNumber(p, NUMBER_TAGS));
            if (nHasNum && adjHasNum) {
              chosen = n;
              chosenCase = 'nom';
              agreementFound = true;
              break;
            }
          } else {
            const nHasG = n.parses.some((p) => parseHasGender(p, GENDER_TAGS));
            const adjHasG = adj.parses.some((p) => parseHasGender(p, GENDER_TAGS));
            const nHasN = n.parses.some((p) => parseHasNumber(p, NUMBER_TAGS));
            const adjHasN = adj.parses.some((p) => parseHasNumber(p, NUMBER_TAGS));
            if ((nHasG && adjHasG) || (nHasN && adjHasN)) {
              chosen = n;
              chosenCase = 'nom';
              agreementFound = true;
              break;
            }
          }
        }
        if (agreementFound) break;
      }
      if (!agreementFound) {
        return { ok: false, reason: 'Прилагательные не согласованы с существительными — ошибка согласования.' };
      }
    }
    if (chosen && !chosen.explicit) {
      const sameCasePrefer = (nc) => {
        if (!chosenCase) return false;
        return nc.parses.some((p) => {
          if (chosenCase === 'nom') return grammemeIncludes(p.grammemes, NOMINATIVE_TAGS);
          if (chosenCase === 'acc') return grammemeIncludes(p.grammemes, ACCUSATIVE_TAGS);
          return false;
        });
      };
      const adjIdx = typeof chosenAdjIdx === 'number' ? chosenAdjIdx : null;
      const explicitCandidates = nounCandidates
        .filter((nc) => nc.explicit)
        .map((nc) => ({ nc, dist: adjIdx === null ? 0 : Math.abs(nc.idx - adjIdx) }))
        .sort((a, b) => a.dist - b.dist);
      let replacement = null;
      for (const item of explicitCandidates) {
        const nc = item.nc;
        if (sameCasePrefer(nc)) {
          replacement = nc;
          break;
        }
      }
      if (!replacement) {
        replacement = explicitCandidates.find((it) =>
          it.nc.parses.some((p) => grammemeIncludes(p.grammemes, NOMINATIVE_TAGS))
        )?.nc;
      }
      if (replacement) {
        chosen = replacement;
        chosenCase = chosen.parses.some((p) => grammemeIncludes(p.grammemes, NOMINATIVE_TAGS)) ? 'nom' : chosenCase;
      }
    }
  }
  if (chosen && chosenCase === 'acc') {
    if (
      chosen.explicit &&
      (chosen.parses.some((p) => parseHasNumber(p, NUMBER_TAGS)) || /[ыи]$/u.test(String(chosen.token || '').toLowerCase()))
    ) {
      return {
        ok: true,
        reason: `Главное существительное "${chosen.token}" выглядит как название (явное существительное) — принимаем как именительный.`,
      };
    }
    const earlierNom = nounCandidates.find(
      (nc) =>
        nc.idx < chosen.idx &&
        nc.explicit &&
        nc.parses.some((p) => grammemeIncludes(p.grammemes, NOMINATIVE_TAGS))
    );
    if (earlierNom) {
      chosen = earlierNom;
      chosenCase = 'nom';
    }
  }
  if (chosen && chosenCase !== 'nom' && chosenCase !== 'acc') {
    const nomOverride = nounCandidates.find(
      (nc) =>
        nc.explicit &&
        nc.parses.some((p) => grammemeIncludes(p.grammemes, NOMINATIVE_TAGS))
    );
    if (nomOverride) {
      chosen = nomOverride;
      chosenCase = 'nom';
    }
  }
  if (chosen) {
    const nomOutsidePrep = nounCandidates.find(
      (nc) =>
        nc.explicit &&
        !nc.inPrepositional &&
        nc.parses.some((p) => grammemeIncludes(p.grammemes, NOMINATIVE_TAGS))
    );
    if (nomOutsidePrep) {
      const chosenIsPrep = !!chosen.inPrepositional;
      if (chosenIsPrep || chosenCase !== 'nom') {
        chosen = nomOutsidePrep;
        chosenCase = 'nom';
      }
    }
  }
  if (chosen) {
    try {
      const chosenHasGen =
        chosenCase === 'gen' ||
        chosen.parses.some((p) => grammemeIncludes(p.grammemes, GENITIVE_TAGS));
      if (chosenHasGen) {
        const earlierExplicit = nounCandidates.find(
          (nc) => nc.idx < chosen.idx && nc.explicit && !nc.inPrepositional
        );
        if (earlierExplicit) {
          chosen = earlierExplicit;
          chosenCase = 'nom';
        }
      }
    } catch (_) {}
  }
  if (!chosen) {
    const nomCandidate = nounCandidates.find(
      (nc) =>
        nc.explicit &&
        nc.parses.some((p) => grammemeIncludes(p.grammemes, NOMINATIVE_TAGS))
    );
    if (nomCandidate) {
      chosen = nomCandidate;
      chosenCase = 'nom';
    } else {
      const tolerant = nounCandidates.find(
        (nc) =>
          !nc.inPrepositional &&
          nc.parses.some((p) => {
            try {
              const hasG = parseHasGender(p, GENDER_TAGS);
              const hasN = parseHasNumber(p, NUMBER_TAGS);
              const grams = (p.grammemes || []).join(',').toLowerCase();
              const looksQuality = grams.includes('кач');
              return (hasG || hasN) && !looksQuality;
            } catch (_) {
              return false;
            }
          })
      );
      if (tolerant) {
        chosen = tolerant;
        chosenCase = 'nom';
      } else {
        return {
          ok: false,
          reason: 'Нет явного существительного в именительном падеже (только субстантивированные прилагательные) — считаем некорректным.',
        };
      }
    }
  }
  if (!chosen) {
    chosen = nounCandidates[nounCandidates.length - 1];
    chosenCase = null;
  }
  const headToken = chosen.token;
  if (chosenCase === 'nom') {
    return {
      ok: true,
      reason: `Главное существительное "${headToken}" согласовано в именительном падеже — заголовок корректен как название.`,
    };
  }
  if (chosenCase === 'acc') {
    return {
      ok: false,
      reason: `Главное существительное "${headToken}" согласовано в винительном падеже и нет глагола — вероятный фрагмент/объект без действия.`,
    };
  }
  const hasNom =
    chosen.parses.some((p) => {
      const grams = Array.isArray(p.grammemes) ? p.grammemes.map(String) : [];
      const hasZero = grams.some((g) => String(g).trim() === '0');
      return (grammemeIncludes(p.grammemes, NOMINATIVE_TAGS) || (chosen.explicit && hasZero));
    }) ||
    (chosen.explicit && /[ыи]$/u.test(String(chosen.token || '').toLowerCase()));
  if (hasNom) {
    return {
      ok: true,
      reason: `Главное существительное "${headToken}" может быть в именительном падеже — заголовок корректен как название.`,
    };
  }
  const hasAcc = chosen.parses.some((p) => grammemeIncludes(p.grammemes, ACCUSATIVE_TAGS));
  if (hasAcc) {
    return {
      ok: false,
      reason: `Главное существительное "${headToken}" в винительном падеже и нет глагола — вероятный фрагмент/объект без действия.`,
    };
  }
  return {
    ok: false,
    reason: `Нет глагола; падеж основного существительного ("${headToken}") не однозначен — нужен контекст.`,
  };
}

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('app-db');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => {};
  });
}

self.addEventListener('message', async (event) => {
  const { type, payload, requestId } = event.data || {};
  currentRequestId = requestId || null;
  try {
    if (type !== 'consistency') return;
    const projectId = payload?.projectId ? String(payload.projectId) : 'anon';
    const BATCH = payload?.batchSize ? Number(payload.batchSize) : 10;
    await waitForSharedLemmaDictReady();
    const db = await openIDB();
    if (!db.objectStoreNames.contains('keywords')) {
      self.postMessage({ type: 'consistency:done', requestId, processed: 0, total: 0 });
      return;
    }
    let total = 0;
    await new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction('keywords', 'readonly');
        const store = tx.objectStore('keywords');
        const req = store.openCursor();
        req.onsuccess = async (e) => {
          const cur = (e.target as IDBRequest).result;
          if (!cur) return resolve();
          const v = cur.value || {};
          const matchesProject = String(v.projectId || 'anon') === projectId;
          const needsCheck = matchesProject && (v.is_valid_headline === null || v.is_valid_headline === undefined);
          if (needsCheck) total++;
          cur.continue();
        };
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
    if (total === 0) {
      self.postMessage({ type: 'consistency:done', requestId, processed: 0, total: 0 });
      return;
    }
    let processed = 0;
    let batchItems: any[] = [];
    await new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction('keywords', 'readwrite');
        const store = tx.objectStore('keywords');
        const req = store.openCursor();
        req.onsuccess = async (e) => {
          const cur = (e.target as IDBRequest).result;
          if (!cur) {
            if (batchItems.length > 0) {
              for (const it of batchItems) store.put(it);
              processed += batchItems.length;
              const percent = total > 0 ? Math.round((processed / total) * 100) : 100;
              self.postMessage({ type: 'consistency:progress', requestId, processed, total, percent });
              batchItems = [];
            }
            return resolve();
          }
          const v = cur.value || {};
          const matchesProject = String(v.projectId || 'anon') === projectId;
          const needsCheck = matchesProject && (v.is_valid_headline === null || v.is_valid_headline === undefined);
          if (needsCheck) {
            const text = String(v.keyword || '');
            const tokens = tokenise(text);
            await ensureEntries(tokens);
            const res = checkHeadlineGrammar(tokens);
            v.is_valid_headline = res.ok ? 1 : 0;
            v.validation_reason = res.reason || null;
            batchItems.push(v);
            if (batchItems.length >= BATCH) {
              for (const it of batchItems) store.put(it);
              processed += batchItems.length;
              const percent = total > 0 ? Math.round((processed / total) * 100) : 100;
              self.postMessage({ type: 'consistency:progress', requestId, processed, total, percent });
              batchItems = [];
            }
          }
          cur.continue();
        };
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
    self.postMessage({ type: 'consistency:done', requestId, processed, total });
  } catch (err: any) {
    const message = err && typeof err.message === 'string' ? err.message : String(err);
    const stack = err && typeof err.stack === 'string' ? err.stack : null;
    self.postMessage({
      type: 'consistency:error',
      requestId,
      message,
      error: message,
      stack,
    });
  } finally {
    currentRequestId = null;
  }
});

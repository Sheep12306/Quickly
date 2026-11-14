import type { NoteItem } from "../types";

export interface SearchHit {
  noteId: string;
  topic: string;
  snippet: string;
  score: number;
}

const STOP_CHARS = new Set([
  "的", "了", "是", "在", "和", "与", "哪", "里", "什", "么", "怎", "如", "何",
  "进", "行", "发", "生", "一", "个", "有", "吗", "呢", "中", "为", "对", "可",
  "以", "需", "要", "这", "那", "我", "你", "他", "她", "它", "们", "就", "都",
  "也", "还", "而", "并", "或", "但", "把", "被", "让", "给", "从", "到", "会",
]);

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "of", "to", "in",
  "on", "at", "for", "with", "and", "or", "but", "what", "how", "why", "where",
  "when", "which", "who", "does", "do", "did", "can", "could", "should", "would",
  "please", "tell", "me", "about", "it", "this", "that", "these", "those",
]);

/** Chinese characters are indexed as unigrams + bigrams; ASCII is indexed as words. */
function tokenize(text: string): string[] {
  const cleaned = text.toLowerCase().replace(/[^\p{Script=Han}a-z0-9]+/gu, " ");
  const tokens: string[] = [];

  for (const part of cleaned.split(/\s+/).filter(Boolean)) {
    if (/^[a-z0-9]+$/.test(part)) {
      if (part.length > 1 && !STOP_WORDS.has(part)) tokens.push(part);
      continue;
    }
    const chars = [...part];
    for (let i = 0; i < chars.length; i += 1) {
      const current = chars[i];
      if (!STOP_CHARS.has(current)) tokens.push(current);
      const next = chars[i + 1];
      if (next && !STOP_CHARS.has(current) && !STOP_CHARS.has(next)) {
        tokens.push(current + next);
      }
    }
  }

  return tokens;
}

export function splitIntoSentences(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split(/\n+/)
    .flatMap((paragraph) => paragraph.split(/(?<=[。！？!?；;])/))
    .map((sentence) => sentence.replace(/^[#>*\-\d.\s]+/, "").trim())
    .filter((sentence) => sentence.length >= 6);
}

interface IndexedDoc {
  note: NoteItem;
  sentence: string;
  tf: Record<string, number>;
  length: number;
  topicTokens: Set<string>;
}

/**
 * Local, offline retrieval over the user's notes.
 * Finds the most relevant sentences so the chat can "locate" material
 * without any large-model call.
 */
export function searchNotes(query: string, notes: NoteItem[], limit = 4): SearchHit[] {
  const queryTokens = Array.from(new Set(tokenize(query)));
  if (queryTokens.length === 0 || notes.length === 0) return [];

  const docs: IndexedDoc[] = [];
  for (const note of notes) {
    const topicTokens = new Set(tokenize(note.topic));
    for (const sentence of splitIntoSentences(note.content)) {
      const tokens = tokenize(sentence);
      if (tokens.length === 0) continue;
      const tf: Record<string, number> = {};
      for (const token of tokens) tf[token] = (tf[token] || 0) + 1;
      docs.push({ note, sentence, tf, length: tokens.length, topicTokens });
    }
  }
  if (docs.length === 0) return [];

  const documentFrequency: Record<string, number> = {};
  for (const doc of docs) {
    for (const token of Object.keys(doc.tf)) {
      documentFrequency[token] = (documentFrequency[token] || 0) + 1;
    }
  }

  const totalDocs = docs.length;
  const averageLength = docs.reduce((sum, doc) => sum + doc.length, 0) / totalDocs;
  const idf = (token: string) => {
    const df = documentFrequency[token] || 0;
    return Math.log(1 + (totalDocs - df + 0.5) / (df + 0.5));
  };

  const k1 = 1.4;
  const b = 0.72;
  const scored = docs.map((doc) => {
    let score = 0;
    for (const token of queryTokens) {
      const frequency = doc.tf[token] || 0;
      if (frequency === 0) continue;
      const denominator = frequency + k1 * (1 - b + (b * doc.length) / averageLength);
      score += idf(token) * ((frequency * (k1 + 1)) / denominator);
    }
    const topicOverlap = queryTokens.reduce(
      (count, token) => count + (doc.topicTokens.has(token) ? 1 : 0),
      0,
    );
    score += Math.min(topicOverlap * 0.4, 1.2);
    return { doc, score };
  }).sort((a, b) => b.score - a.score);

  const bestScore = scored[0]?.score ?? 0;
  if (bestScore < 1.8) return [];
  const cutoff = Math.max(1.4, bestScore * 0.12);

  const hits: SearchHit[] = [];
  const perNote = new Map<string, number>();
  const seenSnippets = new Set<string>();

  for (const { doc, score } of scored) {
    if (score < cutoff || hits.length >= limit) break;
    if (seenSnippets.has(doc.sentence)) continue;
    const noteCount = perNote.get(doc.note.id) || 0;
    if (noteCount >= 3) continue;

    perNote.set(doc.note.id, noteCount + 1);
    seenSnippets.add(doc.sentence);
    hits.push({
      noteId: doc.note.id,
      topic: doc.note.topic,
      snippet: doc.sentence.length > 220 ? `${doc.sentence.slice(0, 220)}…` : doc.sentence,
      score: Math.round(score * 10) / 10,
    });
  }

  return hits;
}

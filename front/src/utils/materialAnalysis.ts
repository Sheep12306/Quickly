import type { MaterialAnalysis, QuestionType, QuestionTypeCounts } from "../types";

const MIN_QUESTIONS = 5;
const MAX_QUESTIONS = 30;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Split material into rough sentences (works for Chinese + English punctuation). */
export function splitMaterialSentences(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split(/\n+/)
    .flatMap((paragraph) => paragraph.split(/(?<=[。！？!?；;])/))
    .map((s) => s.trim())
    .filter((s) => s.length >= 8);
}

/**
 * Allocate `total` questions across types using the given weights,
 * rounding so the counts always add up to exactly `total`.
 */
function allocateCounts(total: number, weights: Record<QuestionType, number>): QuestionTypeCounts {
  const entries = (Object.keys(weights) as QuestionType[])
    .filter((type) => weights[type] > 0)
    .map((type) => {
      const raw = total * weights[type];
      return { type, count: Math.floor(raw), fraction: raw - Math.floor(raw) };
    });

  let remaining = total - entries.reduce((sum, e) => sum + e.count, 0);
  const byFraction = [...entries].sort((a, b) => b.fraction - a.fraction);

  let i = 0;
  while (remaining > 0 && byFraction.length > 0) {
    byFraction[i % byFraction.length].count += 1;
    remaining -= 1;
    i += 1;
  }

  const result: QuestionTypeCounts = { choice: 0, truefalse: 0, fill: 0, short: 0 };
  for (const entry of entries) result[entry.type] = entry.count;
  return result;
}

/**
 * Analyze an uploaded study material and recommend a question count + type mix.
 * Pure local heuristic — instant, offline, no API call.
 */
export function analyzeMaterial(fileName: string, text: string): MaterialAnalysis {
  const clean = text.replace(/\r/g, "").trim();
  const charCount = clean.replace(/\s/g, "").length;
  const sentences = splitMaterialSentences(clean);
  const sentenceCount = sentences.length;

  const headingCount =
    (clean.match(/^#{1,6}\s+\S+/gm) || []).length +
    (clean.match(/^第[一二三四五六七八九十百\d]+[章节部分讲]/gm) || []).length +
    (clean.match(/^\d+[.、)]\s*\S+/gm) || []).length;

  // Roughly one question per 210 non-whitespace characters, plus a bonus for
  // well-structured material. Clamped to a sane quiz length.
  const estimatedTotal = clamp(
    Math.round(charCount / 210) + Math.min(headingCount, 6),
    MIN_QUESTIONS,
    MAX_QUESTIONS,
  );

  // Definition-dense material (formulas, "X 是指…") suits more fill-in-the-blank.
  const definitionCount =
    (clean.match(/是指|定义为|称为|是一种|等于|公式/g) || []).length +
    (clean.match(/[：:]/g) || []).length;
  const definitionDensity = charCount > 0 ? definitionCount / Math.max(charCount / 100, 1) : 0;

  let weights: Record<QuestionType, number>;
  if (charCount < 1200) {
    weights = { choice: 0.4, truefalse: 0.3, fill: 0.3, short: 0 };
  } else if (charCount < 2500) {
    weights = { choice: 0.38, truefalse: 0.22, fill: 0.28, short: 0.12 };
  } else {
    weights = { choice: 0.35, truefalse: 0.2, fill: 0.25, short: 0.2 };
  }

  if (definitionDensity > 3) {
    weights.fill = Math.min(0.4, weights.fill + 0.05);
    weights.short = Math.max(0, weights.short - 0.05);
  }

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  for (const key of Object.keys(weights) as QuestionType[]) {
    weights[key] = weights[key] / totalWeight;
  }

  const recommended = allocateCounts(estimatedTotal, weights);

  return {
    fileName,
    charCount,
    sentenceCount,
    headingCount,
    estimatedTotal,
    estimatedMinutes: Math.max(3, Math.round(estimatedTotal * 0.9)),
    recommended,
    difficulty: charCount < 1500 ? "easy" : charCount < 5000 ? "medium" : "hard",
  };
}

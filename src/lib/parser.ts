import type { QuestionDraft, QuestionType } from "./types";

/**
 * Heuristic document → question-draft parser.
 * Understands numbered questions, lettered options, answer keys, points and
 * explanations. Pure function so it can run client-side on OCR / PDF output.
 *
 * Example input:
 *   1. What is 2 + 2? (1 pt)
 *   A) 3
 *   B) 4
 *   C) 5
 *   Answer: B
 *   Explanation: basic arithmetic
 */
export function parseQuestionsFromText(text: string): QuestionDraft[] {
  const lines = text.split(/\r?\n/);
  const qStart = /^\s*(?:Q(?:uestion)?\s*)?(\d{1,3})\s*[.)\]:]\s*(.*)$/i;
  const optStart = /^\s*\(?\s*([A-Fa-f])\s*[).\]:]\s*(.*)$/;
  const ansLine = /^\s*(?:ans(?:wer)?|correct(?:\s*answer)?|key)\s*[:.)\-]\s*(.+)$/i;
  const explLine = /^\s*(?:explanation|why|rationale|note)\s*[:.)\-]\s*(.*)$/i;
  const ptsIn = /(\d{1,2})\s*(?:pts?|points?|marks?)\b/i;
  const tfWords = /^(true|false)\b/i;

  const drafts: QuestionDraft[] = [];
  let cur: QuestionDraft | null = null;

  const flush = () => {
    if (!cur) return;
    finishDraft(cur);
    drafts.push(cur);
    cur = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const explM = line.match(explLine);
    if (explM && cur) {
      cur.explanation = (cur.explanation ? cur.explanation + " " : "") + explM[1];
      continue;
    }

    const ansM = line.match(ansLine);
    if (ansM && cur) {
      applyAnswer(cur, ansM[1]);
      continue;
    }

    const optM = line.match(optStart);
    if (optM && cur && cur.prompt) {
      const key = optM[1].toUpperCase();
      if (!cur.options.some((o) => o.key === key)) {
        cur.options.push({ key, text: optM[2].trim() });
        continue;
      }
    }

    const qM = line.match(qStart);
    if (qM) {
      flush();
      let prompt = qM[2].trim();
      let points = 1;
      const ptsM = prompt.match(ptsIn);
      if (ptsM) {
        points = Math.min(100, Math.max(1, parseInt(ptsM[1], 10) || 1));
        prompt = prompt.replace(ptsIn, "").replace(/\s{2,}/g, " ").trim();
      }
      cur = {
        id: crypto.randomUUID(),
        ord: drafts.length,
        type: "mcq",
        prompt,
        options: [],
        correct: [],
        points,
        explanation: "",
      };
      continue;
    }

    // Continuation text
    if (cur) {
      if (cur.options.length === 0) {
        cur.prompt = (cur.prompt ? cur.prompt + " " : "") + line;
      } else {
        cur.explanation = (cur.explanation ? cur.explanation + " " : "") + line;
      }
    }
  }
  flush();

  return drafts.map((d, i) => ({ ...d, ord: i }));
}

function applyAnswer(d: QuestionDraft, raw: string): void {
  const val = raw.trim();
  if (/^(true|false)\.?$/i.test(val)) {
    d.type = "truefalse";
    d.correct = [val.toLowerCase().replace(/\.$/, "")];
    d.options = [];
    return;
  }
  const letters = val.toUpperCase().match(/\b[A-F]\b/g);
  if (letters && letters.length > 0 && d.options.length > 0) {
    d.correct = Array.from(new Set(letters));
    d.type = letters.length > 1 ? "multi" : "mcq";
    return;
  }
  // Free-text answer
  d.correct = [val.replace(/\.$/, "")];
}

function finishDraft(d: QuestionDraft): void {
  // Detect True/False option pairs
  if (d.options.length === 2) {
    const texts = d.options.map((o) => o.text.toLowerCase());
    if (texts[0].startsWith("true") && texts[1].startsWith("false")) {
      d.type = "truefalse";
      if (d.correct.length === 0) d.correct = ["true"];
      return;
    }
  }
  if (d.options.length === 0 && d.type !== "truefalse") {
    d.type = "short";
    return;
  }
  if (d.correct.length > 1) d.type = "multi";
  else if (d.correct.length === 1) d.type = d.type === "multi" ? "multi" : "mcq";
  else d.correct = [];
}

export function draftToRow(d: QuestionDraft): {
  ord: number;
  type: QuestionType;
  prompt: string;
  options: { key: string; text: string }[];
  correct: string[];
  points: number;
  explanation: string;
} {
  return {
    ord: d.ord,
    type: d.type,
    prompt: d.prompt,
    options: d.options,
    correct: d.correct,
    points: d.points,
    explanation: d.explanation,
  };
}

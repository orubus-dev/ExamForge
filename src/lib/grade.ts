import type { QuestionType } from "./types";

export interface GradeableQuestion {
  id: string;
  type: QuestionType;
  correct: string[];
  points: number;
}

export interface GradeOutcome {
  correct: boolean | null; // null = pending (short answers)
  points: number;
}

/**
 * Auto-grading for objective question types.
 * mcq / truefalse → exact single-key match; multi → set equality; short → pending.
 */
export function gradeResponse(
  q: GradeableQuestion,
  response: unknown
): GradeOutcome {
  if (q.type === "short") {
    // Free-text answers stay pending until a teacher grades them.
    return { correct: null, points: 0 };
  }
  if (response === null || response === undefined) {
    return { correct: false, points: 0 };
  }
  const norm = Array.isArray(response)
    ? response.map((x) => String(x).trim().toUpperCase()).filter(Boolean)
    : [String(response).trim().toUpperCase()];

  if (norm.length === 0) return { correct: false, points: 0 };

  const expected = q.correct.map((c) => String(c).trim().toUpperCase());

  if (q.type === "truefalse") {
    const ok = norm.length === 1 && expected.includes(norm[0]);
    return { correct: ok, points: ok ? q.points : 0 };
  }
  if (q.type === "mcq") {
    const ok = norm.length === 1 && expected.includes(norm[0]);
    return { correct: ok, points: ok ? q.points : 0 };
  }
  // multi — set equality, no partial credit
  const a = Array.from(new Set(norm)).sort();
  const b = Array.from(new Set(expected)).sort();
  const ok = a.length === b.length && a.every((v, i) => v === b[i]);
  return { correct: ok, points: ok ? q.points : 0 };
}

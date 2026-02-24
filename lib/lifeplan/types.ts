import type { LifePlanQuestion } from "./questions";

export type QuestionStatus = "unanswered" | "partial" | "complete";

export type LifePlanAnswer = {
  questionId: string;
  status: QuestionStatus;
  // We store text in the user's voice (first person, no quotes).
  answerText: string;
  updatedAtISO?: string;
  confidence?: number;
};

export type LifePlanState = {
  userId: string;
  createdAtISO: string;
  updatedAtISO: string;

  // Full transcript log (in-order)
  transcript: Array<{
    atISO: string;
    role: "user" | "assistant";
    text: string;
    itemId?: string;
  }>;

  // Answers keyed by questionId
  answers: Record<string, LifePlanAnswer>;

  // Any side notes / “off the beaten path” content
  notes: string[];

  // Track which wisdom snippets have been spoken, to avoid repeating.
  wisdomUsed: string[];
};

export type LifePlanProgress = {
  currentQuestion: LifePlanQuestion | null;
  done: boolean;
  requiredCompleteCount: number;
  requiredTotalCount: number;
};

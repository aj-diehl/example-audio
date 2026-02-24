import { promises as fs } from "fs";
import path from "path";
import { LIFEPLAN_QUESTIONS } from "./questions";
import type { LifePlanAnswer, LifePlanProgress, LifePlanState, QuestionStatus } from "./types";

const DATA_DIR = process.env.VERCEL
  ? path.join("/tmp", "data")
  : path.join(process.cwd(), "data");

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function statePath(userId: string) {
  return path.join(DATA_DIR, `${userId}.json`);
}

function nowISO() {
  return new Date().toISOString();
}

function initAnswers(): Record<string, LifePlanAnswer> {
  const answers: Record<string, LifePlanAnswer> = {};
  for (const q of LIFEPLAN_QUESTIONS) {
    answers[q.id] = {
      questionId: q.id,
      status: "unanswered",
      answerText: "",
    };
  }
  return answers;
}

export async function loadOrCreateState(userId: string): Promise<LifePlanState> {
  await ensureDataDir();
  const p = statePath(userId);
  try {
    const raw = await fs.readFile(p, "utf-8");
    const parsed = JSON.parse(raw) as LifePlanState;
    // Backfill new fields if older state exists
    parsed.answers = parsed.answers ?? initAnswers();
    parsed.transcript = parsed.transcript ?? [];
    parsed.notes = parsed.notes ?? [];
    parsed.wisdomUsed = parsed.wisdomUsed ?? [];
    parsed.updatedAtISO = parsed.updatedAtISO ?? nowISO();
    parsed.createdAtISO = parsed.createdAtISO ?? nowISO();
    // Ensure all questions exist
    for (const q of LIFEPLAN_QUESTIONS) {
      if (!parsed.answers[q.id]) {
        parsed.answers[q.id] = { questionId: q.id, status: "unanswered", answerText: "" };
      }
    }
    return parsed;
  } catch {
    const created: LifePlanState = {
      userId,
      createdAtISO: nowISO(),
      updatedAtISO: nowISO(),
      transcript: [],
      notes: [],
      wisdomUsed: [],
      answers: initAnswers(),
    };
    await saveState(created);
    return created;
  }
}

export async function saveState(state: LifePlanState): Promise<void> {
  await ensureDataDir();
  state.updatedAtISO = nowISO();
  await fs.writeFile(statePath(state.userId), JSON.stringify(state, null, 2), "utf-8");
}

export async function resetState(userId: string): Promise<void> {
  await ensureDataDir();
  try {
    await fs.unlink(statePath(userId));
  } catch {
    // ignore
  }
}

export function computeProgress(state: LifePlanState): LifePlanProgress {
  const required = LIFEPLAN_QUESTIONS.filter((q) => q.required);
  const requiredTotalCount = required.length;
  const requiredCompleteCount = required.filter((q) => state.answers[q.id]?.status === "complete").length;

  const done = requiredCompleteCount >= requiredTotalCount;

  let currentQuestion = null as (typeof LIFEPLAN_QUESTIONS)[number] | null;
  if (!done) {
    currentQuestion =
      LIFEPLAN_QUESTIONS
        .slice()
        .sort((a, b) => a.order - b.order)
        .find((q) => state.answers[q.id]?.status !== "complete") ?? null;
  }

  return { currentQuestion, done, requiredCompleteCount, requiredTotalCount };
}

export function setAnswer(args: {
  state: LifePlanState;
  questionId: string;
  status: QuestionStatus;
  answerText: string;
  confidence?: number;
}) {
  const { state, questionId, status, answerText, confidence } = args;
  const prev = state.answers[questionId] ?? { questionId, status: "unanswered" as QuestionStatus, answerText: "" };

  state.answers[questionId] = {
    ...prev,
    status,
    answerText,
    confidence,
    updatedAtISO: nowISO(),
  };
}

export function addTranscript(state: LifePlanState, text: string, itemId?: string) {
  state.transcript.push({ atISO: nowISO(), text, itemId });
}

export function addNote(state: LifePlanState, note: string) {
  const cleaned = note.trim();
  if (!cleaned) return;
  state.notes.push(cleaned);
}


export function pickTransitionWisdomWithId(state: LifePlanState): { questionId: string; wisdom: string } | null {
  // Pick the most recently updated complete answer with a wisdom snippet that hasn't been used yet.
  const complete = Object.values(state.answers)
    .filter((a) => a.status === "complete" && a.updatedAtISO)
    .sort((a, b) => (b.updatedAtISO ?? "").localeCompare(a.updatedAtISO ?? ""));

  for (const ans of complete) {
    const q = LIFEPLAN_QUESTIONS.find((qq) => qq.id === ans.questionId);
    const wisdom = q?.wisdom?.trim();
    if (!wisdom) continue;
    if (state.wisdomUsed.includes(ans.questionId)) continue;
    return { questionId: ans.questionId, wisdom };
  }
  return null;
}

export function pickTransitionWisdom(state: LifePlanState): string | null {
  const picked = pickTransitionWisdomWithId(state);
  return picked ? picked.wisdom : null;
}

export function markWisdomUsed(state: LifePlanState, questionId: string) {
  if (!state.wisdomUsed.includes(questionId)) state.wisdomUsed.push(questionId);
}

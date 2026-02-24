import { LIFEPLAN_QUESTIONS } from "./questions";
import type { LifePlanProgress, LifePlanState } from "./types";

function recentConversation(state: LifePlanState, maxTurns = 10): string {
  if (!state.transcript.length) return "No conversation yet — this is the opening turn.";

  // Take the last N entries to give the agent conversation context
  const recent = state.transcript.slice(-maxTurns);
  return recent
    .map((t) => {
      const label = t.role === "user" ? "User" : "You";
      // Trim long entries to keep instructions within token budget
      const text = t.text.length > 300 ? t.text.slice(0, 300).trim() + "…" : t.text.trim();
      return `${label}: ${text}`;
    })
    .join("\n");
}

function summarizeCompleted(state: LifePlanState, max = 6): string {
  const completed = Object.values(state.answers)
    .filter((a) => a.status === "complete" && a.answerText.trim().length > 0)
    .sort((a, b) => (b.updatedAtISO ?? "").localeCompare(a.updatedAtISO ?? ""))
    .slice(0, max);

  if (completed.length === 0) return "None yet.";
  return completed
    .map((a) => {
      const q = LIFEPLAN_QUESTIONS.find((qq) => qq.id === a.questionId);
      const title = q ? `${q.moduleTitle}:` : "";
      const preview =
        a.answerText.length > 140 ? a.answerText.slice(0, 140).trim() + "…" : a.answerText.trim();
      return `- ${title} ${preview}`;
    })
    .join("\n");
}

export function buildVoiceGuideInstructions(args: {
  state: LifePlanState;
  progress: LifePlanProgress;
  // Optional “nugget” to speak once (very short) before asking the next question.
  transitionWisdom?: string | null;
}): string {
  const { state, progress, transitionWisdom } = args;

  const current = progress.currentQuestion;

  const styleRules = [
    "You are a calm, warm, practical voice guide having a real conversation — not conducting an interview.",
    "The user should NOT feel like they are filling out a form. Do not mention questionnaires, modules, worksheets, or that you are storing anything.",
    "Keep responses short (1–3 sentences) and ask ONE question at a time.",
    "CRITICAL: Use the conversation history below to maintain continuity. Reference what the user has already shared to create natural transitions (e.g. 'You mentioned X earlier — building on that…' or 'That connects to something interesting…').",
    "Do not over-paraphrase or repeat the user's words back to them. Acknowledge briefly and move forward.",
    "When transitioning to a new topic, bridge naturally from what was just discussed. Never abruptly jump to a new question without connecting it to the flow of conversation.",
    "If the user goes off-topic, respond naturally, capture the useful part mentally, then gently steer back to the current question.",
    "If a user answer is thin, ask ONE follow-up question; otherwise advance to the next topic.",
    "Avoid therapy claims. Encourage professional support if the user asks for mental health treatment advice.",
  ].join("\n");

  const progressLine = progress.done
    ? "Status: COMPLETE (all required areas are covered)."
    : `Status: IN PROGRESS. Required complete: ${progress.requiredCompleteCount}/${progress.requiredTotalCount}.`;

  const completedSummary = summarizeCompleted(state);

  // What to do now
  let actionBlock = "";
  if (progress.done) {
    actionBlock = [
      "Wrap up with a brief, encouraging summary of what was created.",
      "Ask if they want to stop here, or if they want to refine anything.",
      "If they say they’re done, say goodbye clearly and stop prompting."
    ].join("\n");
  } else if (current) {
    const hints = current.coverageHints?.length ? `Follow-up hints (use at most ONE):\n- ${current.coverageHints.join("\n- ")}` : "";
    const maybeWisdom = transitionWisdom ? `Optional 1-sentence insight to share before moving on:\n- ${transitionWisdom}` : "";
    actionBlock = [
      maybeWisdom,
      `Ask this next question (exactly one question, conversational tone):\n- ${current.prompt}`,
      hints,
      "If they already answered this earlier, smoothly confirm if they'd like to update it; otherwise move to the next topic."
    ].filter(Boolean).join("\n\n");
  } else {
    actionBlock = "Ask a gentle clarifying question to identify what they want to focus on first.";
  }

  const conversationHistory = recentConversation(state);

  return [
    "LIFEPLAN VOICE GUIDE INSTRUCTIONS",
    "",
    styleRules,
    "",
    progressLine,
    "",
    "Conversation so far (use this to maintain flow and make natural transitions):",
    conversationHistory,
    "",
    "Recent completed highlights (for your context only; do not read verbatim):",
    completedSummary,
    "",
    "What to do now:",
    actionBlock,
  ].join("\n");
}

export const runtime = "nodejs";

import { LIFEPLAN_QUESTIONS } from "@/lib/lifeplan/questions";
import { openaiPOST } from "@/lib/openai";
import { addNote, addTranscript, computeProgress, loadOrCreateState, saveState, setAnswer } from "@/lib/lifeplan/store";
import type { QuestionStatus } from "@/lib/lifeplan/types";

type ExtractionUpdate = {
  question_id: string;
  status: "unanswered" | "partial" | "complete";
  answer_text: string;
  confidence: number; // 0..1
};

type ExtractionResult = {
  updates: ExtractionUpdate[];
  side_notes: string[];
};

function outputTextFromResponses(resp: any): string {
  const chunks: string[] = [];
  for (const item of resp?.output ?? []) {
    for (const c of item?.content ?? []) {
      if (c?.type === "output_text" && typeof c?.text === "string") chunks.push(c.text);
    }
  }
  return chunks.join("").trim();
}

function safeJsonParse(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { userId?: string; transcript?: string; itemId?: string };
    const userId = body.userId;
    const transcript = body.transcript;

    if (!userId) return Response.json({ error: "Missing userId" }, { status: 400 });
    if (!transcript) return Response.json({ error: "Missing transcript" }, { status: 400 });

    const state = await loadOrCreateState(userId);
    addTranscript(state, transcript, body.itemId);

    const questionTable = LIFEPLAN_QUESTIONS
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((q) => ({
        id: q.id,
        module: q.moduleTitle,
        required: q.required,
        prompt: q.prompt,
      }));

    const currentAnswers = LIFEPLAN_QUESTIONS.map((q) => {
      const a = state.answers[q.id];
      return {
        id: q.id,
        status: a?.status ?? "unanswered",
        answer_text: a?.answerText ?? "",
      };
    });

    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        updates: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              question_id: { type: "string" },
              status: { type: "string", enum: ["unanswered", "partial", "complete"] },
              answer_text: { type: "string" },
              confidence: { type: "number" },
            },
            required: ["question_id", "status", "answer_text", "confidence"],
          },
        },
        side_notes: { type: "array", items: { type: "string" } },
      },
      required: ["updates", "side_notes"],
    };

    const model = process.env.OPENAI_EXTRACT_MODEL ?? "gpt-4o-mini";

    const resp = await openaiPOST<any>("/responses", {
      model,
      input: [
        {
          role: "system",
          content:
            "You extract structured LifePlan answers from a user's most recent utterance. " +
            "You MUST output JSON that matches the given schema. " +
            "Write answers in the user's voice (first-person, natural), without quotation marks and without attributing ('I said', 'the user said'). " +
            "If the utterance does not meaningfully answer any LifePlan question, return updates:[] and maybe a side_note capturing anything useful. " +
            "Only mark status='complete' if the answer feels sufficiently covered for a first draft; otherwise use 'partial'.",
        },
        {
          role: "user",
          content: JSON.stringify(
            {
              question_table: questionTable,
              current_answers: currentAnswers,
              latest_utterance: transcript,
            },
            null,
            2
          ),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "lifeplan_extraction",
          strict: true,
          schema,
        },
      },
      max_output_tokens: 450,
    });

    const text = outputTextFromResponses(resp);
    const parsed = safeJsonParse(text) as ExtractionResult | null;

    const applied: Array<{ questionId: string; status: QuestionStatus; confidence: number }> = [];
    const ignored: Array<{ questionId: string; reason: string }> = [];

    if (parsed?.updates?.length) {
      for (const u of parsed.updates) {
        const q = LIFEPLAN_QUESTIONS.find((qq) => qq.id === u.question_id);
        if (!q) {
          ignored.push({ questionId: u.question_id, reason: "Unknown question_id" });
          continue;
        }
        const cleaned = (u.answer_text ?? "").trim();
        const conf = typeof u.confidence === "number" ? u.confidence : 0;

        // Simple guardrails.
        if (conf < 0.35) {
          ignored.push({ questionId: u.question_id, reason: "Low confidence" });
          continue;
        }
        if (!cleaned) {
          ignored.push({ questionId: u.question_id, reason: "Empty answer_text" });
          continue;
        }

        const status = (u.status ?? "partial") as QuestionStatus;
        setAnswer({ state, questionId: u.question_id, status, answerText: cleaned, confidence: conf });
        applied.push({ questionId: u.question_id, status, confidence: conf });
      }
    }

    if (parsed?.side_notes?.length) {
      for (const n of parsed.side_notes) addNote(state, n);
    }

    await saveState(state);

    const progress = computeProgress(state);

    return Response.json({
      ok: true,
      applied,
      ignored,
      sideNotesAdded: parsed?.side_notes?.length ?? 0,
      progress,
      state,
      rawModelText: text,
    });
  } catch (e: any) {
    return Response.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

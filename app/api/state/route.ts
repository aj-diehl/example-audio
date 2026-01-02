export const runtime = "nodejs";

import { buildVoiceGuideInstructions } from "@/lib/lifeplan/instructions";
import { computeProgress, loadOrCreateState, markWisdomUsed, pickTransitionWisdomWithId, saveState } from "@/lib/lifeplan/store";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");

  if (!userId) return Response.json({ error: "Missing userId" }, { status: 400 });

  const state = await loadOrCreateState(userId);
  const progress = computeProgress(state);

  // Choose a wisdom nugget once (optional) to gently wrap the previous answer.
  const picked = pickTransitionWisdomWithId(state);
  const transitionWisdom = picked?.wisdom ?? null;

  if (picked) {
    // Mark as used immediately so we don't repeat it on refresh.
    markWisdomUsed(state, picked.questionId);
    await saveState(state);
  }

  const instructions = buildVoiceGuideInstructions({ state, progress, transitionWisdom });

  return Response.json({ userId, state, progress, instructions });
}

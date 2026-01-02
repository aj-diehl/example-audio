export const runtime = "nodejs";

import { resetState } from "@/lib/lifeplan/store";

export async function POST(req: Request) {
  try {
    const { userId } = (await req.json()) as { userId?: string };
    if (!userId) return Response.json({ error: "Missing userId" }, { status: 400 });
    await resetState(userId);
    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export const runtime = "nodejs";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}. Set it in .env.local.`);
  return v;
}

function extractCallId(locationHeader: string | null): string | null {
  if (!locationHeader) return null;
  // Example might look like: /v1/realtime/calls/call_123 or full URL.
  const parts = locationHeader.split("/");
  return parts[parts.length - 1] || null;
}

export async function POST(req: Request) {
  try {
    const { sdp, userId } = (await req.json()) as { sdp?: string; userId?: string };
    if (!sdp) {
      return Response.json({ error: "Missing 'sdp' in request body." }, { status: 400 });
    }

    const apiKey = requireEnv("OPENAI_API_KEY");

    const session = {
      type: "realtime",
      model: process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime",
      // Start with audio in/out. We'll override instructions dynamically via session.update from the client.
      audio: {
        input: {
          transcription: process.env.OPENAI_ASR_MODEL
            ? { model: process.env.OPENAI_ASR_MODEL }
            : { model: "gpt-4o-mini-transcribe" },
          // We want manual control over when the assistant responds (we'll send response.create events),
          // so set create_response=false.
          turn_detection: {
            type: "server_vad",
            threshold: 0.6,
            prefix_padding_ms: 300,
            silence_duration_ms: 600,
            create_response: false,
            interrupt_response: true,
          },
        },
        output: {
          voice: process.env.OPENAI_VOICE ?? "marin",
        },
      },
    };

    const fd = new FormData();
    // Send fields as plain form values; the API expects "sdp" and "session" fields.
    fd.set("sdp", sdp);
    fd.set("session", JSON.stringify(session));

    const r = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: fd,
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      return Response.json(
        { error: `OpenAI /v1/realtime/calls failed: ${r.status} ${r.statusText}`, details: errText },
        { status: 500 }
      );
    }

    const answerSdp = await r.text();
    const callId = extractCallId(r.headers.get("location"));

    return Response.json({ answerSdp, callId, userId: userId ?? null });
  } catch (e: any) {
    return Response.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

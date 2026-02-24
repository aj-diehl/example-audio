'use client';

import { useEffect, useMemo, useRef, useState } from "react";
import { LIFEPLAN_QUESTIONS } from "@/lib/lifeplan/questions";

type ConnectionStatus = "idle" | "connecting" | "connected" | "stopped" | "error";

type ExtractResponse = {
  ok?: boolean;
  error?: string;
  applied?: Array<{ questionId: string; status: string; confidence: number }>;
  ignored?: Array<{ questionId: string; reason: string }>;
  rawModelText?: string;
  progress?: any;
  state?: any;
};

type StateResponse = {
  error?: string;
  userId?: string;
  state?: any;
  progress?: any;
  instructions?: string;
};

function shortId(id: string, n = 6) {
  if (!id) return "";
  return id.length > n ? id.slice(0, n) + "…" : id;
}

function badgeClass(status: string) {
  if (status === "complete") return "badge good";
  if (status === "partial") return "badge warn";
  if (status === "unanswered") return "badge";
  return "badge";
}

export default function Page() {
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const [userId, setUserId] = useState<string>("");
  const [callId, setCallId] = useState<string | null>(null);

  const [instructions, setInstructions] = useState<string>("");
  const [progress, setProgress] = useState<any>(null);
  const [state, setState] = useState<any>(null);

  const [transcripts, setTranscripts] = useState<Array<{ at: string; text: string }>>([]);
  const [assistantText, setAssistantText] = useState<string>("");
  const lastAssistantTurnRef = useRef<string>("");
  const currentAssistantTurnRef = useRef<string>("");
  const [eventsLog, setEventsLog] = useState<string[]>([]);
  const [lastExtract, setLastExtract] = useState<ExtractResponse | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize / persist userId locally
  useEffect(() => {
    const existing = window.localStorage.getItem("lifeplan_user_id");
    if (existing) {
      setUserId(existing);
    } else {
      const created = "lp_" + crypto.randomUUID();
      window.localStorage.setItem("lifeplan_user_id", created);
      setUserId(created);
    }
  }, []);

  const questionsDF = useMemo(() => {
    // “Mock dataframe”
    return LIFEPLAN_QUESTIONS.slice().sort((a, b) => a.order - b.order);
  }, []);

  function logEvent(line: string) {
    setEventsLog((prev) => [new Date().toLocaleTimeString() + "  " + line, ...prev].slice(0, 60));
  }

  async function fetchState(): Promise<StateResponse> {
    const r = await fetch(`/api/state?userId=${encodeURIComponent(userId)}`);
    const j = (await r.json()) as StateResponse;
    if (j.error) throw new Error(j.error);
    setState(j.state);
    setProgress(j.progress);
    setInstructions(j.instructions ?? "");
    return j;
  }

  async function extractFromTranscript(text: string, itemId?: string, assistantText?: string) {
    const r = await fetch(`/api/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, transcript: text, itemId, assistantText }),
    });
    const j = (await r.json()) as ExtractResponse;
    setLastExtract(j);
    if (j.error) throw new Error(j.error);
    setState(j.state);
    setProgress(j.progress);
    return j;
  }

  function sendDC(event: any) {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== "open") return;
    dc.send(JSON.stringify(event));
  }

  async function sendInstructionsAndPrompt() {
    const s = await fetchState();
    if (!s.instructions) return;

    // Update the session instructions, then trigger a response.
    sendDC({
      type: "session.update",
      session: {
        type: "realtime",
        instructions: s.instructions,
      },
    });

    // Kick a response. (We keep turn_detection.create_response=false, so we manually do this.)
    sendDC({ type: "response.create" });
  }

  async function connect() {
    setError(null);
    setStatus("connecting");
    logEvent("Connecting…");

    try {
      // 1) Local mic
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      // 2) Peer connection
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // Remote audio playback
      pc.ontrack = (ev) => {
        const audioEl = audioRef.current;
        if (!audioEl) return;
        audioEl.srcObject = ev.streams[0];
        audioEl.play().catch(() => {});
      };

      // Add local track
      for (const track of stream.getTracks()) pc.addTrack(track, stream);

      // Data channel for Realtime events
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;

      dc.onopen = async () => {
        logEvent("Data channel open.");

        // Start by fetching instructions and prompting the assistant to begin.
        await sendInstructionsAndPrompt();
      };

      dc.onmessage = async (ev) => {
        let msg: any = null;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }

        const t = msg?.type ?? "unknown";
        if (t === "response.output_text.delta") {
          const delta = msg.delta ?? "";
          setAssistantText((prev) => prev + delta);
          currentAssistantTurnRef.current += delta;
        }

        if (t === "response.output_text.done") {
          // Snapshot the completed assistant turn for sending with the next extraction
          lastAssistantTurnRef.current = currentAssistantTurnRef.current;
          currentAssistantTurnRef.current = "";
          setAssistantText((prev) => prev + "\n");
        }

        if (t === "conversation.item.input_audio_transcription.completed") {
          const text = msg.transcript as string;
          const itemId = msg.item_id as string | undefined;

          setTranscripts((prev) => [{ at: new Date().toLocaleTimeString(), text }, ...prev].slice(0, 50));

          // 1) Run extraction to fill the LifePlan (include the assistant's last response for conversation context)
          const prevAssistant = lastAssistantTurnRef.current;
          await extractFromTranscript(text, itemId, prevAssistant);

          // 2) Update instructions and ask the next question / continue
          await sendInstructionsAndPrompt();
        }

        if (t === "error") {
          logEvent("Realtime error: " + JSON.stringify(msg.error ?? msg));
        }
      };

      // Create offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Wait for ICE gathering to complete (helps reliability)
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === "complete") return resolve();
        const onState = () => {
          if (pc.iceGatheringState === "complete") {
            pc.removeEventListener("icegatheringstatechange", onState);
            resolve();
          }
        };
        pc.addEventListener("icegatheringstatechange", onState);
      });

      const localDesc = pc.localDescription;
      if (!localDesc?.sdp) throw new Error("Missing local SDP offer.");

      // Ask our server to create a Realtime call and return the answer SDP
      const resp = await fetch("/api/webrtc/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sdp: localDesc.sdp, userId }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error ?? "Failed to connect.");

      setCallId(json.callId ?? null);

      // Set remote description
      await pc.setRemoteDescription({ type: "answer", sdp: json.answerSdp });

      setStatus("connected");
      logEvent("Connected.");
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Unknown error");
      setStatus("error");
      logEvent("Connection failed.");
      stop();
    }
  }

  function stop() {
    logEvent("Stopping…");

    try {
      dcRef.current?.close();
    } catch {}
    dcRef.current = null;

    try {
      pcRef.current?.close();
    } catch {}
    pcRef.current = null;

    try {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {}
    localStreamRef.current = null;

    setStatus("stopped");
    logEvent("Stopped.");
  }

  async function resetLifePlan() {
    await fetch("/api/state/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    setAssistantText("");
    setTranscripts([]);
    setLastExtract(null);
    await fetchState();
    logEvent("State reset.");
  }

  useEffect(() => {
    if (!userId) return;
    fetchState().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const done = Boolean(progress?.done);

  return (
    <div className="container">
      <div className="panel" style={{ marginBottom: 12 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <div className="h1">LifePlan realtime voice demo</div>
            <div className="muted">
              WebRTC mic → Realtime voice agent → transcripts → structured extraction → LifePlan state.
            </div>
          </div>
          <div className={done ? "badge good" : "badge"}>{done ? "LifePlan complete" : status}</div>
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <label className="muted">User ID</label>
          <input
            value={userId}
            onChange={(e) => {
              setUserId(e.target.value);
              window.localStorage.setItem("lifeplan_user_id", e.target.value);
            }}
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: "8px 10px",
              minWidth: 320,
              color: "var(--text)",
            }}
          />

          <button
            onClick={() => {
              const created = "lp_" + crypto.randomUUID();
              setUserId(created);
              window.localStorage.setItem("lifeplan_user_id", created);
            }}
            style={{
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "transparent",
              padding: "8px 10px",
              color: "var(--text)",
            }}
          >
            New ID
          </button>

          <button
            disabled={status === "connecting" || status === "connected"}
            onClick={connect}
            style={{
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "transparent",
              padding: "8px 10px",
              color: "var(--text)",
            }}
          >
            Start voice session
          </button>

          <button
            disabled={status !== "connected" && status !== "connecting"}
            onClick={stop}
            style={{
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "transparent",
              padding: "8px 10px",
              color: "var(--text)",
            }}
          >
            Stop
          </button>

          <button
            onClick={resetLifePlan}
            style={{
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "transparent",
              padding: "8px 10px",
              color: "var(--text)",
            }}
          >
            Reset LifePlan
          </button>

          <span className="muted">Call: {callId ? shortId(callId, 12) : "—"}</span>
        </div>

        {error ? (
          <div style={{ marginTop: 10 }} className="badge bad">
            {error}
          </div>
        ) : null}

        <div style={{ marginTop: 12 }}>
          <audio ref={audioRef} autoPlay />
        </div>
      </div>

      <div className="grid">
        <div className="panel">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div className="h1">Live transcripts</div>
            <div className="muted">Triggered by Realtime transcription events.</div>
          </div>

          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            {transcripts.length === 0 ? (
              <div className="muted">No transcript yet. Click “Start voice session” and speak.</div>
            ) : (
              transcripts.map((t, i) => (
                <div key={i} className="panel" style={{ padding: 10 }}>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {t.at}
                  </div>
                  <div style={{ marginTop: 4 }}>{t.text}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="panel">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div className="h1">Assistant text (debug)</div>
            <div className="muted">From response.output_text.* events.</div>
          </div>

          <div className="panel" style={{ marginTop: 10, padding: 10 }}>
            <pre>{assistantText || "—"}</pre>
          </div>

          <div style={{ marginTop: 12 }} className="row">
            <div className="h1" style={{ fontSize: 16 }}>
              Extraction result (last utterance)
            </div>
          </div>

          <div className="panel" style={{ marginTop: 8, padding: 10 }}>
            <pre>{lastExtract ? JSON.stringify(lastExtract, null, 2) : "—"}</pre>
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 12 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="h1">LifePlan answers</div>
          <div className="muted">
            Required complete: {progress?.requiredCompleteCount ?? 0}/{progress?.requiredTotalCount ?? 0}
          </div>
        </div>

        <table className="table" style={{ marginTop: 10 }}>
          <thead>
            <tr>
              <th style={{ width: 180 }}>Module</th>
              <th style={{ width: 120 }}>Question</th>
              <th style={{ width: 110 }}>Status</th>
              <th>Answer (stored in the user’s voice)</th>
            </tr>
          </thead>
          <tbody>
            {questionsDF.map((q) => {
              const a = state?.answers?.[q.id];
              const st = a?.status ?? "unanswered";
              return (
                <tr key={q.id}>
                  <td>{q.moduleTitle}</td>
                  <td>{q.id}</td>
                  <td>
                    <span className={badgeClass(st)}>{st}</span>
                  </td>
                  <td style={{ color: st === "unanswered" ? "var(--muted)" : "var(--text)" }}>
                    {a?.answerText?.trim() ? a.answerText : q.prompt}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="row" style={{ marginTop: 12 }}>
          <div className="h1" style={{ fontSize: 16 }}>
            Question bank “dataframe”
          </div>
          <span className="muted">This is your mock table you’ll later replace with your real LifePlan workbook.</span>
        </div>

        <table className="table" style={{ marginTop: 10 }}>
          <thead>
            <tr>
              <th style={{ width: 70 }}>Order</th>
              <th style={{ width: 160 }}>Module</th>
              <th style={{ width: 120 }}>Required</th>
              <th style={{ width: 140 }}>Question ID</th>
              <th>Prompt</th>
            </tr>
          </thead>
          <tbody>
            {questionsDF.map((q) => (
              <tr key={q.id}>
                <td>{q.order}</td>
                <td>{q.moduleTitle}</td>
                <td>{q.required ? <span className="badge good">yes</span> : <span className="badge">no</span>}</td>
                <td>{q.id}</td>
                <td>{q.prompt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel" style={{ marginTop: 12 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="h1">Realtime events (debug)</div>
          <div className="muted">A short rolling log from the UI.</div>
        </div>
        <div className="panel" style={{ marginTop: 10, padding: 10 }}>
          <pre>{eventsLog.length ? eventsLog.join("\n") : "—"}</pre>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 12 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="h1">Current instructions (debug)</div>
          <div className="muted">What we send via session.update</div>
        </div>
        <div className="panel" style={{ marginTop: 10, padding: 10 }}>
          <pre>{instructions || "—"}</pre>
        </div>
      </div>
    </div>
  );
}

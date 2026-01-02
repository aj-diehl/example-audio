type FetchJSON = Record<string, any>;

export async function openaiPOST<T = any>(path: string, body: FetchJSON): Promise<T> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY. Set it in .env.local.");

  const r = await fetch(`https://api.openai.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`OpenAI POST ${path} failed: ${r.status} ${r.statusText}. ${text}`);
  }

  return (await r.json()) as T;
}

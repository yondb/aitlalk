import type { DebateMessage, Side } from "./types";

const ENDPOINT = "https://api.deepseek.com/v1/chat/completions";

/** domyślnie szybki chat — rozmowa; R1: ustaw DEEPSEEK_MODEL=deepseek-reasoner */
const DEFAULT_MODEL = "deepseek-chat";

export async function generateDebateTurn(params: {
  topic: string;
  side: Side;
  personaName: string;
  systemPrompt: string;
  moderatorInjection?: string;
  transcript: DebateMessage[];
}): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not set");

  const injection = params.moderatorInjection
    ? `\n\n[MODERATOR DIRECTION: ${params.moderatorInjection}]`
    : "";

  const system = [
    `You are "${params.personaName}" in a formal debate.`,
    `Debate topic: ${params.topic}`,
    `Reply in a natural, spoken debate style. Be concise: about 3–6 sentences per turn unless the topic demands more.`,
    `No long essays — this is a live back-and-forth.`,
    `Your persona: ${params.systemPrompt}`,
    injection,
  ].join("\n");

  const transcriptBlock = params.transcript
    .map((m) => `${m.side === "A" ? "Side A" : "Side B"}: ${m.content}`)
    .join("\n\n");

  const userPrompt = params.transcript.length
    ? `Transcript so far:\n${transcriptBlock}\n\nYou are Side ${params.side}. Give your next contribution in character.`
    : `The debate begins. You are Side ${params.side}. Deliver a short opening statement.`;

  const messages = [
    { role: "system" as const, content: system },
    { role: "user" as const, content: userPrompt },
  ];

  const preferred =
    process.env.DEEPSEEK_MODEL?.trim() || DEFAULT_MODEL;

  try {
    return await callChat(apiKey, preferred, messages);
  } catch (e) {
    if (preferred === "deepseek-reasoner") {
      console.warn(
        "[deepseek] reasoner failed, trying deepseek-chat:",
        e instanceof Error ? e.message : e
      );
      return await callChat(apiKey, "deepseek-chat", messages);
    }
    throw e;
  }
}

async function callChat(
  apiKey: string,
  model: string,
  messages: Array<{ role: "system" | "user"; content: string }>
): Promise<string> {
  const body = {
    model,
    temperature: 0.85,
    max_tokens: 220,
    messages,
  };

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 45_000);

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  }).finally(() => clearTimeout(t));

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[deepseek] HTTP ${res.status}`, errText.slice(0, 500));
    throw new Error(`DeepSeek error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{
      message?: { content?: string | null; reasoning_content?: string | null };
    }>;
  };
  const msg = json.choices?.[0]?.message;
  const content = msg?.content != null ? String(msg.content).trim() : "";
  if (content) return content;

  console.error("[deepseek] empty content", JSON.stringify(json).slice(0, 800));
  throw new Error("Empty DeepSeek content");
}

import type { DebateMessage, Side } from "./types";

const ENDPOINT = "https://api.deepseek.com/v1/chat/completions";

export async function generateDebateTurn(params: {
  topic: string;
  side: Side;
  personaName: string;
  systemPrompt: string;
  moderatorInjection?: string;
  transcript: DebateMessage[];
}): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not set");

  const injection = params.moderatorInjection
    ? `\n\n[MODERATOR DIRECTION: ${params.moderatorInjection}]`
    : "";

  const system = [
    `You are "${params.personaName}" in a formal debate.`,
    `Debate topic: ${params.topic}`,
    `Follow your role and perspective. Be concise and persuasive (no monologues).`,
    `Your persona and instructions: ${params.systemPrompt}`,
    injection,
  ].join("\n");

  const transcriptBlock = params.transcript
    .map((m) => `${m.side === "A" ? "Side A" : "Side B"}: ${m.content}`)
    .join("\n\n");

  const userPrompt = params.transcript.length
    ? `Transcript so far:\n${transcriptBlock}\n\nYou are Side ${params.side}. Give your next contribution in character.`
    : `The debate begins. You are Side ${params.side}. Deliver your opening statement on the topic.`;

  const body = {
    model: "deepseek-reasoner",
    temperature: 1,
    max_tokens: 300,
    messages: [
      { role: "system" as const, content: system },
      { role: "user" as const, content: userPrompt },
    ],
  };

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 60_000);

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
    throw new Error(`DeepSeek error ${res.status}: ${errText}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
  };
  const msg = json.choices?.[0]?.message;
  const text =
    (msg?.content && String(msg.content).trim()) ||
    (msg?.reasoning_content && String(msg.reasoning_content).trim()) ||
    "";
  if (!text) throw new Error("Empty DeepSeek response");
  return text;
}

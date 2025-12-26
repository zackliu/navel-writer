import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/index.js";

export async function openaiChatCompletion({
  apiKey,
  baseUrl,
  model,
  messages,
  temperature,
  maxTokens,
  timeoutMs = 180_000,
}: {
  apiKey: string;
  baseUrl: string;
  model: string;
  messages: ChatCompletionMessageParam[];
  temperature: number;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<{ text: string; usage: unknown; raw: unknown }> {
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY missing. Set env var or novel-engine/config.json openai.apiKey."
    );
  }

  const client = new OpenAI({
    apiKey,
    baseURL: baseUrl,
    timeout: timeoutMs,
  });

  const resp = await client.chat.completions.create(
    {
      model,
      messages,
      temperature,
      ...(typeof maxTokens === "number" ? { max_tokens: maxTokens } : {}),
    },
    { timeout: timeoutMs }
  );

  const text = resp?.choices?.[0]?.message?.content;
  if (typeof text !== "string") {
    throw new Error("OpenAI response missing text.");
  }

  return {
    text,
    usage: (resp as any)?.usage,
    raw: resp,
  };
}

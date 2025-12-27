import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/index.js";

function isRetryableError(error: unknown): boolean {
  if (!error) return false;

  const status = (error as any)?.status ?? (error as any)?.response?.status;
  if (typeof status === "number" && [408, 409, 429, 500, 502, 503, 504].includes(status)) {
    return true;
  }

  const code = (error as any)?.code;
  const retryableCodes = new Set([
    "ETIMEDOUT",
    "ECONNRESET",
    "ECONNREFUSED",
    "EAI_AGAIN",
    "ENOTFOUND",
    "EPIPE",
    "ECONNABORTED",
    "UND_ERR_CONNECT_TIMEOUT",
    "UND_ERR_SOCKET",
    "UND_ERR_HEADERS_TIMEOUT",
  ]);
  if (typeof code === "string" && retryableCodes.has(code)) {
    return true;
  }

  const message = String((error as any)?.message || "");
  return /timeout|network|ECONN|ENETUNREACH|EAI_AGAIN/i.test(message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function openaiChatCompletion({
  apiKey,
  baseUrl,
  model,
  messages,
  temperature,
  maxTokens,
  timeoutMs = 300_000,
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

  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const resp = await client.chat.completions.create(
        {
          model,
          messages,
          temperature,
          ...(typeof maxTokens === "number" ? { max_tokens: maxTokens } : {}),
        },
        { timeout: timeoutMs }
      );

      const choice = resp?.choices?.[0];
      const text = choice?.message?.content;
      if (typeof text !== "string") {
        throw new Error("OpenAI response missing text.");
      }

      const finishReason = (choice as any)?.finish_reason;
      console.info(`Finish reason: ${finishReason}, token: ${(resp as any)?.usage?.completion_tokens}`);
      if (finishReason === "length") {
        const usage = (resp as any)?.usage;
        const promptTokens = usage?.prompt_tokens;
        const completionTokens = usage?.completion_tokens;
        const usageMsg =
          typeof promptTokens === "number" && typeof completionTokens === "number"
            ? ` Token usage: prompt=${promptTokens}, completion=${completionTokens}.`
            : "";
        throw new Error(
          `OpenAI response truncated (finish_reason=length). Increase max tokens or reduce prompt size.${usageMsg}`
        );
      }

      return {
        text,
        usage: (resp as any)?.usage,
        raw: resp,
      };
    } catch (error: unknown) {
      const isLastAttempt = attempt >= maxAttempts;
      const delayMs = Math.min(1_000 * attempt, 5_000);
      // eslint-disable-next-line no-console
      console.warn(
        `[openaiChatCompletion] attempt ${attempt} failed: ${String((error as any)?.message || error)}`
      );

      if (isLastAttempt) {
        throw error;
      }

      await sleep(delayMs);
    }
  }
  throw new Error("OpenAI chat completion failed after retries.");
}

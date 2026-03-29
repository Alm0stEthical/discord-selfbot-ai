import type { AppConfig } from "../config";
import type { Logger } from "../utils/logger";

export type ChatCompletionContentPart =
  | {
      text: string;
      type: "text";
    }
  | {
      image_url: {
        url: string;
      };
      type: "image_url";
    };

export interface ChatCompletionMessage {
  content: string | ChatCompletionContentPart[];
  role: "system" | "user" | "assistant";
}

interface ModelRecord {
  architecture?: {
    input_modalities?: string[];
  };
  id: string;
}

interface ValidateModelSupportInput {
  model: string;
  requiredInputModality: "audio" | "image" | "text";
}

interface TranscriptionInput {
  audioBase64: string;
  format: string;
  prompt: string;
}

export interface OpenRouterClient {
  createChatCompletion(
    messages: ChatCompletionMessage[],
    options?: {
      maxTokens?: number;
      model?: string;
      temperature?: number;
    },
  ): Promise<string>;
  transcribeAudio(input: TranscriptionInput): Promise<string>;
  validateModelSupport(input: ValidateModelSupportInput): Promise<void>;
}

async function fetchJsonWithRetry<T>(input: {
  body?: string;
  config: AppConfig;
  logger: Logger;
  method: "GET" | "POST";
  path: string;
}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.config.openRouterTimeoutMs);

  try {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const response = await fetch(`${input.config.openRouterBaseUrl}${input.path}`, {
        method: input.method,
        headers: {
          Authorization: `Bearer ${input.config.openRouterApiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://coh.local",
          "X-Title": "Discord Bot",
        },
        body: input.body,
        signal: controller.signal,
      });

      if (response.ok) {
        return (await response.json()) as T;
      }

      if (attempt < 3 && (response.status === 429 || response.status >= 500)) {
        input.logger.warn("Retrying OpenRouter request", {
          attempt,
          path: input.path,
          status: response.status,
        });
        await Bun.sleep(attempt * 500);
        continue;
      }

      const errorText = await response.text();
      throw new Error(`OpenRouter request failed (${response.status}): ${errorText}`);
    }

    throw new Error("OpenRouter request exhausted retries.");
  } finally {
    clearTimeout(timeout);
  }
}

export function createOpenRouterClient(config: AppConfig, logger: Logger): OpenRouterClient {
  return {
    async createChatCompletion(messages, options) {
      const payload = await fetchJsonWithRetry<{
        choices?: Array<{ message?: { content?: string } }>;
      }>({
        body: JSON.stringify({
          model: options?.model ?? config.openRouterModel,
          messages,
          temperature: options?.temperature ?? config.openRouterTemperature,
          max_tokens: options?.maxTokens ?? config.openRouterMaxOutputTokens,
        }),
        config,
        logger,
        method: "POST",
        path: "/chat/completions",
      });

      const content = payload.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new Error("OpenRouter returned an empty response.");
      }
      return content;
    },
    async transcribeAudio(inputValue) {
      const payload = await fetchJsonWithRetry<{
        choices?: Array<{ message?: { content?: string } }>;
      }>({
        body: JSON.stringify({
          model: config.openRouterModel,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: inputValue.prompt,
                },
                {
                  type: "input_audio",
                  input_audio: {
                    data: inputValue.audioBase64,
                    format: inputValue.format,
                    type: "base64",
                  },
                },
              ],
            },
          ],
        }),
        config,
        logger,
        method: "POST",
        path: "/chat/completions",
      });

      const content = payload.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new Error("OpenRouter returned an empty transcription response.");
      }
      return content;
    },
    async validateModelSupport(inputValue) {
      const payload = await fetchJsonWithRetry<{ data?: ModelRecord[] }>({
        config,
        logger,
        method: "GET",
        path: "/models?output_modalities=all",
      });

      const model = payload.data?.find((entry) => entry.id === inputValue.model);
      if (!model) {
        throw new Error(`Configured OpenRouter model not found: ${inputValue.model}`);
      }

      const modalities = model.architecture?.input_modalities ?? [];
      if (!modalities.includes(inputValue.requiredInputModality)) {
        throw new Error(
          `OpenRouter model ${inputValue.model} does not support ${inputValue.requiredInputModality} input.`,
        );
      }
    },
  };
}

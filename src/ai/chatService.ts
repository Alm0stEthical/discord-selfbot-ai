import type { Message } from "discord.js-selfbot-v13";
import type { AppConfig } from "../config";
import type { ContextStore } from "../context/contextStore";
import type { StoredMessage } from "../context/types";
import type { Logger } from "../utils/logger";
import type {
  ChatCompletionContentPart,
  ChatCompletionMessage,
  OpenRouterClient,
} from "./openRouterClient";

const UNDERAGE_SELF_CLAIM_PATTERNS = [
  /^\s*i(?:['’]?m| am)\s+(1[0-2]|[1-9])(?:\b|[^\d])/iu,
  /^\s*myself\s+is\s+(1[0-2]|[1-9])(?:\b|[^\d])/iu,
  /^\s*me\s+is\s+(1[0-2]|[1-9])(?:\b|[^\d])/iu,
  /^\s*my age\s+is\s+(1[0-2]|[1-9])(?:\b|[^\d])/iu,
];

export interface ChatService {
  generateReply(input: {
    message: Message;
    normalizedMessage: StoredMessage;
    normalizeMessage: (message: Message) => Promise<StoredMessage>;
  }): Promise<string>;
}

export function createChatService(input: {
  config: AppConfig;
  openRouterClient: OpenRouterClient;
  contextStore: ContextStore;
  logger: Logger;
}): ChatService {
  return {
    async generateReply({ message, normalizedMessage, normalizeMessage }) {
      const context = await input.contextStore.buildContext({
        currentMessage: normalizedMessage,
        message,
        normalizeMessage,
        replyChainLimit: input.config.replyChainLimit,
      });

      const messages: ChatCompletionMessage[] = [
        { role: "system", content: input.config.systemPrompt },
        ...context.replyChain.map((entry) => ({
          role: entry.isBot ? ("assistant" as const) : ("user" as const),
          content: formatContextMessage(entry),
        })),
        ...context.recentMessages.map((entry) => ({
          role: entry.isBot ? ("assistant" as const) : ("user" as const),
          content: formatContextMessage(entry),
        })),
        {
          role: "user",
          content: buildCurrentUserContent(normalizedMessage),
        },
      ];

      input.logger.debug("Sending OpenRouter request", {
        count: messages.length,
        channelId: normalizedMessage.channelId,
      });
      const reply = await input.openRouterClient.createChatCompletion(messages);
      return shortenReply(reply, input.config.replyMaxCharacters);
    },
  };
}

function shortenReply(reply: string, maxCharacters: number): string {
  const trimmed = reply.trim();
  if (trimmed.length <= maxCharacters) {
    return normalizeReplyStyle(trimmed);
  }

  const compact = trimmed.replace(/\s+/g, " ").trim();
  if (compact.length <= maxCharacters) {
    return normalizeReplyStyle(compact);
  }

  const sentences = compact.match(/[^.!?]+[.!?]?/g)?.map((sentence) => sentence.trim()) ?? [];
  let shortened = "";

  for (const sentence of sentences) {
    const candidate = shortened ? `${shortened} ${sentence}` : sentence;
    if (candidate.length > maxCharacters) {
      break;
    }
    shortened = candidate;
  }

  if (shortened) {
    return normalizeReplyStyle(shortened);
  }

  return normalizeReplyStyle(`${compact.slice(0, Math.max(0, maxCharacters - 1)).trimEnd()}...`);
}

function normalizeReplyStyle(reply: string): string {
  const normalized = reply.replace(/\.(?=$|\n)/g, "").trim();
  return sanitizeAgeClaim(normalized);
}

function sanitizeAgeClaim(reply: string): string {
  if (UNDERAGE_SELF_CLAIM_PATTERNS.some((pattern) => pattern.test(reply))) {
    return "not doing the toddler bit";
  }

  return reply;
}

function buildCurrentUserContent(normalizedMessage: StoredMessage): ChatCompletionContentPart[] {
  const content: ChatCompletionContentPart[] = [
    {
      text: formatContextMessage(normalizedMessage),
      type: "text",
    },
  ];

  for (const imageUrl of normalizedMessage.imageUrls) {
    content.push({
      image_url: {
        url: imageUrl,
      },
      type: "image_url",
    });
  }

  return content;
}

function formatContextMessage(message: StoredMessage): string {
  return [
    `speaker=${message.authorLabel}`,
    `speaker_id=${message.authorId}`,
    `message=${message.content}`,
  ].join(" | ");
}

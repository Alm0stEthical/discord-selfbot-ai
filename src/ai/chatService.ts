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

const UNDERAGE_AGE_FRAGMENT = String.raw`(?:[1-9]|1[\s._-]*[0-2])`;
const UNDERAGE_SELF_CLAIM_PATTERNS = [
  new RegExp(
    String.raw`\b(?:i|ɪ)\s*(?:['’]\s*)?(?:m|ᴍ)\s+${UNDERAGE_AGE_FRAGMENT}(?:\b|[^\d])`,
    "iu",
  ),
  new RegExp(String.raw`\b(?:i|ɪ)\s+am\s+${UNDERAGE_AGE_FRAGMENT}(?:\b|[^\d])`, "iu"),
  new RegExp(String.raw`\bmyself\s+is\s+${UNDERAGE_AGE_FRAGMENT}(?:\b|[^\d])`, "iu"),
  new RegExp(String.raw`\bme\s+is\s+${UNDERAGE_AGE_FRAGMENT}(?:\b|[^\d])`, "iu"),
  new RegExp(String.raw`\bmy\s+age\s+is\s+${UNDERAGE_AGE_FRAGMENT}(?:\b|[^\d])`, "iu"),
];
const LEAK_GUARD_PATTERNS = [
  /\b(?:system|developer|hidden|internal)\s+(?:prompt|instruction|policy|message|rules?)\b/iu,
  /\bchain\s+of\s+thought\b/iu,
  /\binternal\s+reasoning\b/iu,
  /\b(?:dump|print|repeat|quote|show|reveal|leak|expose|display|summarize)\b.{0,40}\b(?:prompt|instruction|policy|memory|context|reasoning)\b/iu,
  /\bignore\s+(?:all\s+)?previous\s+instructions\b/iu,
  /\bdeveloper\s+mode\b/iu,
  /\bjailbreak\b/iu,
];
const CONFUSABLE_CHARACTER_MAP: Record<string, string> = {
  ɪ: "i",
  ᴍ: "m",
};
const DISCORD_USER_MENTION_PATTERN = /<@!?(\d+)>/gu;
const DISCORD_BROADCAST_MENTION_PATTERN = /@(everyone|here)\b/giu;
const ZERO_WIDTH_SPACE = "\u200b";

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
  return sanitizeMentions(sanitizePolicyViolations(sanitizeAgeClaim(normalized)));
}

function sanitizeAgeClaim(reply: string): string {
  const normalized = normalizeForPolicyScan(reply);
  if (UNDERAGE_SELF_CLAIM_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "not doing the toddler bit";
  }

  return reply;
}

function sanitizePolicyViolations(reply: string): string {
  const normalized = normalizeForPolicyScan(reply);
  if (LEAK_GUARD_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "nah not leaking the sauce";
  }

  return reply;
}

function sanitizeMentions(reply: string): string {
  return reply
    .replace(DISCORD_USER_MENTION_PATTERN, `<@${ZERO_WIDTH_SPACE}$1>`)
    .replace(DISCORD_BROADCAST_MENTION_PATTERN, `@${ZERO_WIDTH_SPACE}$1`);
}

function normalizeForPolicyScan(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Mark}+/gu, "")
    .split("")
    .map((character) => CONFUSABLE_CHARACTER_MAP[character] ?? character)
    .join("")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();
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

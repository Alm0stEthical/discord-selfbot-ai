import type { Message } from "discord.js-selfbot-v13";
import { parseCommand } from "../commands/parser";
import type { CommandRegistry } from "../commands/types";
import type { StoredMessage } from "../context/types";
import {
  buildAuthorLabel,
  replaceUserMentions,
  resolveMemberName,
} from "../discord/identityResolver";
import type { ServiceContainer } from "../types/services";

const IMAGE_CONTENT_TYPE_PREFIX = "image/";
const IMAGE_FILE_EXTENSIONS = new Set(["gif", "jpeg", "jpg", "png", "webp"]);
const AI_COMMAND_NAME = "a";
const BOT_MESSAGE_IGNORE_TTL_MS = 30_000;
const PROCESSED_AI_MESSAGE_TTL_MS = 5 * 60_000;
const SPAM_WINDOW_MS = 15_000;
const SPAM_IGNORE_AFTER_WARNING_MS = 60_000;
const SPAM_TRIGGER_COUNT = 3;

interface SpamBurstState {
  ignoreUntil?: number;
  timestamps: number[];
}

function isImageAttachmentName(name: string | null): boolean {
  if (!name) {
    return false;
  }

  const extension = name.split(".").pop()?.toLowerCase();
  return extension !== undefined && IMAGE_FILE_EXTENSIONS.has(extension);
}

function collectImageUrls(message: Message): string[] {
  return message.attachments
    .filter(
      (attachment) =>
        attachment.contentType?.startsWith(IMAGE_CONTENT_TYPE_PREFIX) ||
        isImageAttachmentName(attachment.name),
    )
    .map((attachment) => attachment.url);
}

async function normalizeMessage(
  message: Message,
  services: ServiceContainer,
  options?: { promptOverride?: string; stripBotMention?: boolean; stripPrefix?: boolean },
): Promise<StoredMessage> {
  const transcription = await services.attachmentTranscriptionService.transcribeVoiceNote(message);
  const displayName = resolveMemberName(message.member ?? null, message.author);
  const authorLabel = buildAuthorLabel(message.member ?? null, message.author);
  const sanitizedContent =
    options?.promptOverride ?? sanitizeIncomingContent(message, services, options);
  const parts = [sanitizedContent].filter(Boolean);
  const imageUrls = collectImageUrls(message);

  if (transcription) {
    parts.push(
      `Voice note transcript (${transcription.attachmentName}): ${transcription.transcript}`,
    );
  }

  if (parts.length === 0 && imageUrls.length > 0) {
    parts.push("Shared image attachment.");
  }

  return {
    attachmentTranscript: transcription?.transcript,
    authorDisplayName: displayName,
    authorId: message.author.id,
    authorLabel,
    authorUsername: message.author.username,
    channelId: message.channelId,
    content: parts.join("\n"),
    createdAt: message.createdTimestamp,
    id: message.id,
    imageUrls,
    isBot: isMessageFromClient(message),
    replyToMessageId: message.reference?.messageId,
  };
}

export function createMessageHandler(input: {
  services: ServiceContainer;
  commandRegistry: CommandRegistry;
}) {
  const { services, commandRegistry } = input;
  const ignoredBotMessages = new Map<string, number>();
  const processedAiMessages = new Map<string, number>();
  const randomPingState = new Map<string, number>();
  const spamBurstState = new Map<string, SpamBurstState>();
  const activeConversationKeys = new Set<string>();

  return async (message: Message): Promise<void> => {
    const aiCommand = prepareAiCommand(message, services.config.botPrefix, {
      ignoredBotMessages,
      processedAiMessages,
    });
    if (aiCommand.shouldIgnore) {
      return;
    }

    if (await maybeHandleCommand({ commandRegistry, message, services })) {
      return;
    }

    const decision = await services.messageFilter.evaluate(message);
    const normalizedMessage = await normalizeMessage(message, services, {
      promptOverride: aiCommand.prompt ?? undefined,
      stripBotMention: decision.isMentionToBot,
      stripPrefix: decision.isExplicitInvoke && aiCommand.prompt === null,
    });
    services.contextStore.remember(normalizedMessage);

    if (!decision.shouldRespond) {
      return;
    }

    if (shouldIgnoreSpamBurst({ decision, message, spamBurstState })) {
      return;
    }

    if (aiCommand.prompt !== null) {
      processedAiMessages.set(message.id, Date.now() + PROCESSED_AI_MESSAGE_TTL_MS);
    }

    const conversationKey = getConversationKey(message);
    if (!tryBeginConversation(activeConversationKeys, conversationKey)) {
      return;
    }

    let typingInterval: ReturnType<typeof setInterval> | undefined;

    try {
      await message.channel.sendTyping();
      typingInterval = setInterval(() => {
        message.channel.sendTyping().catch(() => undefined);
      }, 7000);
      const startedAt = Date.now();
      const reply = await services.chatService.generateReply({
        message,
        normalizedMessage,
        normalizeMessage: async (targetMessage) => normalizeMessage(targetMessage, services),
      });
      const elapsedMs = Date.now() - startedAt;
      const sent = await message.reply(
        `${reply}\n-# ${elapsedMs}ms - I'm open source: <https://github.com/Alm0stEthical/discord-selfbot-ai>`,
      );
      ignoredBotMessages.set(sent.id, Date.now() + BOT_MESSAGE_IGNORE_TTL_MS);
      services.contextStore.remember(await normalizeMessage(sent, services));
      await maybeSendRandomPing({
        channelId: message.channelId,
        message,
        randomPingState,
        services,
      });
    } catch (error) {
      services.logger.error("Failed to generate bot reply", error);
      await message.reply("Could not generate a response right now.");
    } finally {
      activeConversationKeys.delete(conversationKey);
      if (typingInterval) {
        clearInterval(typingInterval);
      }
    }
  };
}

function prepareAiCommand(
  message: Message,
  prefix: string,
  caches: {
    ignoredBotMessages: Map<string, number>;
    processedAiMessages: Map<string, number>;
  },
): { prompt: string | null; shouldIgnore: boolean } {
  cleanupExpiringMessageIds(caches.ignoredBotMessages);
  cleanupExpiringMessageIds(caches.processedAiMessages);

  if (caches.ignoredBotMessages.has(message.id) || isMessageFromClient(message)) {
    return { prompt: null, shouldIgnore: true };
  }

  const prompt = extractAiPrompt(message.content, prefix);
  if (prompt === null) {
    return { prompt: null, shouldIgnore: false };
  }

  if (prompt.length === 0 || caches.processedAiMessages.has(message.id)) {
    return { prompt, shouldIgnore: true };
  }

  return { prompt, shouldIgnore: false };
}

function cleanupExpiringMessageIds(cache: Map<string, number>): void {
  const now = Date.now();

  for (const [messageId, expiresAt] of cache.entries()) {
    if (expiresAt <= now) {
      cache.delete(messageId);
    }
  }
}

function extractAiPrompt(content: string, prefix: string): string | null {
  const parsed = parseCommand(content, prefix);
  if (parsed?.commandName !== AI_COMMAND_NAME) {
    return null;
  }

  return parsed.rawArgs.trim();
}

function getConversationKey(message: Message): string {
  return `${message.channelId}:${message.author.id}`;
}

function tryBeginConversation(
  activeConversationKeys: Set<string>,
  conversationKey: string,
): boolean {
  if (activeConversationKeys.has(conversationKey)) {
    return false;
  }

  activeConversationKeys.add(conversationKey);
  return true;
}

function isMessageFromClient(message: Message): boolean {
  return message.author.bot || message.author.id === message.client.user?.id;
}

async function maybeHandleCommand(input: {
  commandRegistry: CommandRegistry;
  message: Message;
  services: ServiceContainer;
}): Promise<boolean> {
  const parsed = parseCommand(input.message.content, input.services.config.botPrefix);
  if (!parsed) {
    return false;
  }

  const command = input.commandRegistry.get(parsed.commandName);
  if (!command) {
    return false;
  }

  if (command.adminOnly && !input.services.messageFilter.isAdmin(input.message)) {
    await input.message.reply("You do not have permission to use that command.");
    return true;
  }

  await command.execute({
    message: input.message,
    args: parsed.args,
    rawArgs: parsed.rawArgs,
    services: input.services,
  });
  return true;
}

function shouldIgnoreSpamBurst(input: {
  decision: {
    isExplicitInvoke: boolean;
    isMentionToBot: boolean;
    isReplyToBot: boolean;
  };
  message: Message;
  spamBurstState: Map<string, SpamBurstState>;
}): boolean {
  if (
    !(
      input.decision.isExplicitInvoke ||
      input.decision.isMentionToBot ||
      input.decision.isReplyToBot
    )
  ) {
    return false;
  }

  const key = getConversationKey(input.message);
  const now = Date.now();
  const existing = input.spamBurstState.get(key) ?? { timestamps: [] };

  if (existing.ignoreUntil !== undefined && now < existing.ignoreUntil) {
    existing.timestamps = [];
    input.spamBurstState.set(key, existing);
    return true;
  }

  existing.timestamps = existing.timestamps.filter(
    (timestamp) => now - timestamp <= SPAM_WINDOW_MS,
  );
  existing.timestamps.push(now);
  input.spamBurstState.set(key, existing);

  if (existing.timestamps.length < SPAM_TRIGGER_COUNT) {
    return false;
  }

  existing.ignoreUntil = now + SPAM_IGNORE_AFTER_WARNING_MS;
  existing.timestamps = [];
  return true;
}

async function maybeSendRandomPing(input: {
  channelId: string;
  message: Message;
  randomPingState: Map<string, number>;
  services: ServiceContainer;
}): Promise<void> {
  if (!input.message.guild) {
    return;
  }

  if (Math.random() > input.services.config.randomPingChance) {
    return;
  }

  const lastPingAt = input.randomPingState.get(input.channelId);
  if (
    lastPingAt !== undefined &&
    Date.now() - lastPingAt < input.services.config.randomPingCooldownMs
  ) {
    return;
  }

  const recentMessages = await input.message.channel.messages
    .fetch({ limit: 100 })
    .catch(() => null);
  if (!recentMessages) {
    return;
  }

  const candidates = recentMessages
    .filter((entry) => !entry.author.bot && entry.author.id !== input.message.author.id)
    .map((entry) => entry.author.id)
    .filter((value, index, array) => array.indexOf(value) === index);

  if (candidates.length === 0) {
    return;
  }

  const randomUserId = candidates[Math.floor(Math.random() * candidates.length)];
  const prompts = [
    `<@${randomUserId}> blink twice if you're pretending to work`,
    `<@${randomUserId}> quick one: you got a terrible take loaded up or nah`,
    `<@${randomUserId}> be honest, are you adding to the convo or just decorating the channel`,
    `<@${randomUserId}> drop a one-line take right now, no overthinking`,
  ];
  const prompt = prompts[Math.floor(Math.random() * prompts.length)];

  input.randomPingState.set(input.channelId, Date.now());
  await input.message.channel.send(prompt);
}

function sanitizeIncomingContent(
  message: Message,
  services: ServiceContainer,
  options?: { stripBotMention?: boolean; stripPrefix?: boolean },
): string {
  let content = replaceUserMentions(message, message.content.trim());

  if (options?.stripBotMention && message.client.user) {
    const escapedId = message.client.user.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const mentionPattern = new RegExp(`^<@!?${escapedId}>\\s*`, "u");
    content = content.replace(mentionPattern, "").trim();
  }

  if (options?.stripPrefix) {
    const prefixPattern = new RegExp(`^${services.config.botPrefix}(?:\\s+|$)`, "iu");
    content = content.replace(prefixPattern, "").trim();
  }

  return content;
}

import type { Client, Message } from "discord.js-selfbot-v13";
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
const SPAM_WINDOW_MS = 12_000;
const SPAM_WARNING_COOLDOWN_MS = 20_000;
const SPAM_TRIGGER_COUNT = 3;

interface SpamBurstState {
  timestamps: number[];
  warningSentAt?: number;
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
  options?: { stripBotMention?: boolean; stripPrefix?: boolean },
): Promise<StoredMessage> {
  const transcription = await services.attachmentTranscriptionService.transcribeVoiceNote(message);
  const displayName = resolveMemberName(message.member ?? null, message.author);
  const authorLabel = buildAuthorLabel(message.member ?? null, message.author);
  const sanitizedContent = sanitizeIncomingContent(message, services, options);
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
    isBot: message.author.bot,
    replyToMessageId: message.reference?.messageId,
  };
}

export function createMessageHandler(input: {
  services: ServiceContainer;
  commandRegistry: CommandRegistry;
  client: Client;
}) {
  const { services, commandRegistry } = input;
  const randomPingState = new Map<string, number>();
  const spamBurstState = new Map<string, SpamBurstState>();
  const activeConversationKeys = new Set<string>();

  return async (message: Message): Promise<void> => {
    if (message.author.id === message.client.user?.id) {
      return;
    }

    if (await maybeHandleCommand({ commandRegistry, message, services })) {
      return;
    }

    const decision = await services.messageFilter.evaluate(message);
    const normalizedMessage = await normalizeMessage(message, services, {
      stripBotMention: decision.isMentionToBot,
      stripPrefix: decision.isExplicitInvoke,
    });
    services.contextStore.remember(normalizedMessage);

    if (!decision.shouldRespond) {
      return;
    }

    const spamResponse = getSpamWarning({ decision, message, spamBurstState });
    if (spamResponse) {
      const sent = await message.channel.send(spamResponse);
      services.contextStore.remember(await normalizeMessage(sent, services));
      return;
    }

    const conversationKey = getConversationKey(message);
    if (activeConversationKeys.has(conversationKey)) {
      return;
    }

    activeConversationKeys.add(conversationKey);

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
      const sent = await message.reply(`${reply}\n-# ${elapsedMs}ms`);
      services.contextStore.remember(await normalizeMessage(sent, services));
      await maybeSendRandomPing({
        channelId: message.channelId,
        message,
        randomPingState,
        services,
      });
    } catch (error) {
      services.logger.error("Failed to generate Coh reply", error);
      await message.reply("Could not generate a response right now.");
    } finally {
      activeConversationKeys.delete(conversationKey);
      if (typingInterval) {
        clearInterval(typingInterval);
      }
    }
  };
}

function getConversationKey(message: Message): string {
  return `${message.channelId}:${message.author.id}`;
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

function getSpamWarning(input: {
  decision: {
    isExplicitInvoke: boolean;
    isMentionToBot: boolean;
    isReplyToBot: boolean;
  };
  message: Message;
  spamBurstState: Map<string, SpamBurstState>;
}): string | null {
  if (
    !(
      input.decision.isExplicitInvoke ||
      input.decision.isMentionToBot ||
      input.decision.isReplyToBot
    )
  ) {
    return null;
  }

  const key = getConversationKey(input.message);
  const now = Date.now();
  const existing = input.spamBurstState.get(key) ?? { timestamps: [] };
  existing.timestamps = existing.timestamps.filter(
    (timestamp) => now - timestamp <= SPAM_WINDOW_MS,
  );
  existing.timestamps.push(now);
  input.spamBurstState.set(key, existing);

  if (existing.timestamps.length < SPAM_TRIGGER_COUNT) {
    return null;
  }

  if (
    existing.warningSentAt !== undefined &&
    now - existing.warningSentAt <= SPAM_WARNING_COOLDOWN_MS
  ) {
    return null;
  }

  existing.warningSentAt = now;
  existing.timestamps = [];
  return `<@${input.message.author.id}> chill bro`;
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

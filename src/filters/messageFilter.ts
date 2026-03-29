import type { Message } from "discord.js-selfbot-v13";
import type { AppConfig } from "../config";
import type { BlacklistRepository } from "../db/repositories/blacklistRepository";
import type { Logger } from "../utils/logger";
import type { CooldownManager } from "./cooldownManager";

export interface MessageDecision {
  isExplicitInvoke: boolean;
  isIgnored: boolean;
  isMentionToBot: boolean;
  isReplyToBot: boolean;
  reason?: string;
  shouldRespond: boolean;
}

export interface MessageFilter {
  evaluate(message: Message): Promise<MessageDecision>;
  isAdmin(message: Message): boolean;
}

export function createMessageFilter(input: {
  config: AppConfig;
  blacklistRepository: BlacklistRepository;
  cooldowns: CooldownManager;
  logger: Logger;
}): MessageFilter {
  const { config, blacklistRepository, cooldowns } = input;

  return {
    async evaluate(message) {
      if (
        message.author.bot ||
        message.webhookId ||
        message.author.id === message.client.user?.id
      ) {
        return {
          shouldRespond: false,
          isReplyToBot: false,
          isMentionToBot: false,
          isExplicitInvoke: false,
          isIgnored: false,
          reason: "ignored-bot",
        };
      }

      if (
        config.allowedGuildIds.size > 0 &&
        message.guild &&
        !config.allowedGuildIds.has(message.guild.id)
      ) {
        return {
          shouldRespond: false,
          isReplyToBot: false,
          isMentionToBot: false,
          isExplicitInvoke: false,
          isIgnored: false,
          reason: "guild-not-allowed",
        };
      }

      const trimmed = message.content.trim();
      const lowered = trimmed.toLowerCase();
      const isExplicitInvoke =
        lowered === config.botPrefix || lowered.startsWith(`${config.botPrefix} `);
      const isMentionToBot = message.client.user
        ? message.mentions.users.has(message.client.user.id)
        : false;

      const referenced = message.reference?.messageId
        ? await message.fetchReference().catch(() => null)
        : null;
      const isReplyToBot = referenced?.author.id === message.client.user?.id;
      const isIgnored = blacklistRepository.has(message.author.id);

      if (isIgnored) {
        return {
          shouldRespond: false,
          isReplyToBot,
          isMentionToBot,
          isExplicitInvoke,
          isIgnored,
          reason: "ignored-user",
        };
      }

      if (!(isExplicitInvoke || isReplyToBot || isMentionToBot)) {
        return {
          shouldRespond: false,
          isReplyToBot,
          isMentionToBot,
          isExplicitInvoke,
          isIgnored,
          reason: "not-triggered",
        };
      }

      const key = `${message.channelId}:${message.author.id}`;
      if (!(isExplicitInvoke || isMentionToBot) && cooldowns.isCoolingDown(key)) {
        return {
          shouldRespond: false,
          isReplyToBot,
          isMentionToBot,
          isExplicitInvoke,
          isIgnored,
          reason: "cooldown",
        };
      }

      cooldowns.hit(key);
      return { shouldRespond: true, isReplyToBot, isMentionToBot, isExplicitInvoke, isIgnored };
    },
    isAdmin(message) {
      if (config.botOwnerIds.has(message.author.id)) {
        return true;
      }

      if (!(message.guild && message.member)) {
        return false;
      }

      return message.member.permissions.has("MANAGE_GUILD");
    },
  };
}

import type { Message } from "discord.js-selfbot-v13";
import type { AppConfig } from "../config";
import type { WhitelistRepository } from "../db/repositories/whitelistRepository";
import type { Logger } from "../utils/logger";
import type { CooldownManager } from "./cooldownManager";

export interface MessageDecision {
  isExplicitInvoke: boolean;
  isMentionToBot: boolean;
  isReplyToBot: boolean;
  isWhitelisted: boolean;
  reason?: string;
  shouldRespond: boolean;
}

export interface MessageFilter {
  evaluate(message: Message): Promise<MessageDecision>;
  isAdmin(message: Message): boolean;
}

export function createMessageFilter(input: {
  config: AppConfig;
  whitelistRepository: WhitelistRepository;
  cooldowns: CooldownManager;
  logger: Logger;
}): MessageFilter {
  const { config, whitelistRepository, cooldowns } = input;

  return {
    async evaluate(message) {
      if (message.author.bot || message.webhookId) {
        return {
          shouldRespond: false,
          isReplyToBot: false,
          isMentionToBot: false,
          isExplicitInvoke: false,
          isWhitelisted: false,
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
          isWhitelisted: false,
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
      const isWhitelisted = whitelistRepository.has(message.author.id);

      if (!(isWhitelisted || isExplicitInvoke || isReplyToBot || isMentionToBot)) {
        return {
          shouldRespond: false,
          isReplyToBot,
          isMentionToBot,
          isExplicitInvoke,
          isWhitelisted,
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
          isWhitelisted,
          reason: "cooldown",
        };
      }

      cooldowns.hit(key);
      return { shouldRespond: true, isReplyToBot, isMentionToBot, isExplicitInvoke, isWhitelisted };
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

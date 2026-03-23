import type { CommandDefinition } from "../types";

const USER_MENTION_REGEX = /^<@!?(\d+)>$/;
const USER_ID_REGEX = /^\d{17,20}$/;

function normalizeUserId(input: string): string | null {
  const match = input.match(USER_MENTION_REGEX);
  const raw = match?.[1] ?? input;
  return USER_ID_REGEX.test(raw) ? raw : null;
}

export const blacklistCommand: CommandDefinition = {
  name: "blacklist",
  aliases: ["ignore"],
  description: "Manage ignored users.",
  usage: "bot blacklist <add|remove|list|check> [userId]",
  adminOnly: true,
  async execute({ message, args, services }) {
    const action = args[0]?.toLowerCase();
    const prefix = services.config.botPrefix;

    if (!action || action === "help") {
      await message.reply(`Usage: ${prefix} blacklist <add|remove|list|check> [userId]`);
      return;
    }

    if (action === "list") {
      const entries = services.blacklistRepository.list();
      if (entries.length === 0) {
        await message.reply("Ignore list is empty.");
        return;
      }

      await message.reply(entries.map((entry) => `- ${entry.userId}`).join("\n"));
      return;
    }

    const target = args[1];
    const userId = target ? normalizeUserId(target) : null;

    if (!userId) {
      await message.reply("Provide a valid Discord user ID or mention.");
      return;
    }

    if (action === "add") {
      services.blacklistRepository.add(userId, message.author.id);
      await message.reply(`Ignoring ${userId}.`);
      return;
    }

    if (action === "remove") {
      const removed = services.blacklistRepository.remove(userId);
      await message.reply(
        removed ? `Stopped ignoring ${userId}.` : `${userId} is not currently ignored.`,
      );
      return;
    }

    if (action === "check") {
      const isIgnored = services.blacklistRepository.has(userId);
      await message.reply(isIgnored ? `${userId} is ignored.` : `${userId} is not ignored.`);
      return;
    }

    await message.reply(`Unknown blacklist action: ${action}`);
  },
};

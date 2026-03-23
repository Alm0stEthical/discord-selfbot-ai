import type { CommandDefinition } from "../types";

const USER_MENTION_REGEX = /^<@!?(\d+)>$/;
const USER_ID_REGEX = /^\d{17,20}$/;

function normalizeUserId(input: string): string | null {
  const match = input.match(USER_MENTION_REGEX);
  const raw = match?.[1] ?? input;
  return USER_ID_REGEX.test(raw) ? raw : null;
}

export const whitelistCommand: CommandDefinition = {
  name: "whitelist",
  description: "Manage Coh access list.",
  usage: "coh whitelist <add|remove|list|check> [userId]",
  adminOnly: true,
  async execute({ message, args, services }) {
    const action = args[0]?.toLowerCase();

    if (!action || action === "help") {
      await message.reply("Usage: coh whitelist <add|remove|list|check> [userId]");
      return;
    }

    if (action === "list") {
      const entries = services.whitelistRepository.list();
      if (entries.length === 0) {
        await message.reply("Whitelist is empty.");
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
      services.whitelistRepository.add(userId, message.author.id);
      await message.reply(`Whitelisted ${userId}.`);
      return;
    }

    if (action === "remove") {
      const removed = services.whitelistRepository.remove(userId);
      await message.reply(
        removed ? `Removed ${userId} from whitelist.` : `${userId} was not whitelisted.`,
      );
      return;
    }

    if (action === "check") {
      const allowed = services.whitelistRepository.has(userId);
      await message.reply(allowed ? `${userId} is whitelisted.` : `${userId} is not whitelisted.`);
      return;
    }

    await message.reply(`Unknown whitelist action: ${action}`);
  },
};

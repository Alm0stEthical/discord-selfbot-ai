import type { CommandDefinition } from "../types";

export const helpCommand: CommandDefinition = {
  name: "help",
  aliases: ["commands"],
  description: "Show available commands.",
  usage: "bot help",
  async execute({ message, services }) {
    const prefix = services.config.botPrefix;

    await message.reply(
      [
        "Commands:",
        `- ${prefix} help`,
        `- ${prefix} ping`,
        `- ${prefix} blacklist add <userId>`,
        `- ${prefix} blacklist remove <userId>`,
        `- ${prefix} blacklist list`,
        `- ${prefix} blacklist check <userId>`,
        "- send a voice note and the bot can transcribe it into context",
      ].join("\n"),
    );
  },
};

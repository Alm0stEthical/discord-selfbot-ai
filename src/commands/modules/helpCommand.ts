import type { CommandDefinition } from "../types";

export const helpCommand: CommandDefinition = {
  name: "help",
  aliases: ["commands"],
  description: "Show available commands.",
  usage: "coh help",
  async execute({ message }) {
    await message.reply(
      [
        "Commands:",
        "- coh help",
        "- coh ping",
        "- coh whitelist add <userId>",
        "- coh whitelist remove <userId>",
        "- coh whitelist list",
        "- coh whitelist check <userId>",
        "- send a voice note and Coh can transcribe it into context",
      ].join("\n"),
    );
  },
};

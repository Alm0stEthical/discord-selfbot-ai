import type { CommandDefinition } from "../types";

export const pingCommand: CommandDefinition = {
  name: "ping",
  description: "Check bot responsiveness.",
  usage: "bot ping",
  async execute({ message }) {
    await message.reply("pong");
  },
};

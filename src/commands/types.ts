import type { Message } from "discord.js-selfbot-v13";
import type { ServiceContainer } from "../types/services";

export interface CommandContext {
  args: string[];
  message: Message;
  rawArgs: string;
  services: ServiceContainer;
}

export interface CommandDefinition {
  adminOnly?: boolean;
  aliases?: string[];
  description: string;
  execute: (context: CommandContext) => Promise<void>;
  name: string;
  usage: string;
}

export interface CommandRegistry {
  get(name: string): CommandDefinition | undefined;
  list(): CommandDefinition[];
}

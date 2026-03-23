import type { ServiceContainer } from "../types/services";
import { helpCommand } from "./modules/helpCommand";
import { pingCommand } from "./modules/pingCommand";
import { whitelistCommand } from "./modules/whitelistCommand";
import type { CommandDefinition, CommandRegistry } from "./types";

export function createCommandRegistry(_services: ServiceContainer): CommandRegistry {
  const commands: CommandDefinition[] = [helpCommand, pingCommand, whitelistCommand];
  const index = new Map<string, CommandDefinition>();

  for (const command of commands) {
    const keys = [command.name, ...(command.aliases ?? [])];
    for (const key of keys) {
      const normalized = key.toLowerCase();
      if (index.has(normalized)) {
        throw new Error(`Duplicate command or alias detected: ${normalized}`);
      }
      index.set(normalized, command);
    }
  }

  return {
    get(name) {
      return index.get(name.toLowerCase());
    },
    list() {
      return commands;
    },
  };
}

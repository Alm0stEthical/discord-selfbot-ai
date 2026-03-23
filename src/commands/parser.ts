const COMMAND_PARTS_REGEX = /\s+/;

export interface ParsedCommand {
  args: string[];
  commandName: string;
  rawArgs: string;
}

export function parseCommand(content: string, prefix: string): ParsedCommand | null {
  const trimmed = content.trim();
  const lowerPrefix = prefix.toLowerCase();
  const lowerContent = trimmed.toLowerCase();

  if (lowerContent !== lowerPrefix && !lowerContent.startsWith(`${lowerPrefix} `)) {
    return null;
  }

  const body = trimmed.slice(prefix.length).trim();
  if (!body) {
    return {
      commandName: "help",
      args: [],
      rawArgs: "",
    };
  }

  const parts = body.split(COMMAND_PARTS_REGEX);
  const commandName = parts.shift()?.toLowerCase();
  if (!commandName) {
    return null;
  }

  return {
    commandName,
    args: parts,
    rawArgs: body.slice(commandName.length).trim(),
  };
}

import { resolve } from "node:path";
import { cohSystemPrompt } from "../prompts/cohSystemPrompt";

export interface AppConfig {
  allowedGuildIds: Set<string>;
  botOwnerIds: Set<string>;
  botPrefix: string;
  channelContextTtlMs: number;
  databasePath: string;
  discordToken: string;
  logLevel: "debug" | "info" | "warn" | "error";
  messageHistoryLimit: number;
  openRouterApiKey: string;
  openRouterBaseUrl: string;
  openRouterMaxOutputTokens: number;
  openRouterModel: string;
  openRouterTemperature: number;
  openRouterTimeoutMs: number;
  openRouterTranscriptionModel: string;
  randomPingChance: number;
  randomPingCooldownMs: number;
  replyChainLimit: number;
  replyMaxCharacters: number;
  systemPrompt: string;
  triggerCooldownMs: number;
  voiceNoteMaxBytes: number;
}

function required(name: string): string {
  const value = Bun.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalNumber(name: string, fallback: number): number {
  const raw = Bun.env[name];
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  if (Number.isNaN(value)) {
    throw new Error(`Environment variable ${name} must be a number.`);
  }
  return value;
}

function optionalList(name: string): Set<string> {
  const raw = Bun.env[name]?.trim();
  if (!raw) {
    return new Set();
  }
  return new Set(
    raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

export function loadConfig(): AppConfig {
  const logLevel = (Bun.env.LOG_LEVEL ?? "info") as AppConfig["logLevel"];
  const openRouterModel = Bun.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";

  return {
    discordToken: required("DISCORD_TOKEN"),
    openRouterApiKey: required("OPENROUTER_API_KEY"),
    openRouterModel,
    openRouterBaseUrl: Bun.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
    databasePath: resolve(Bun.env.DATABASE_PATH ?? "./data/coh.sqlite"),
    botPrefix: (Bun.env.BOT_PREFIX ?? "bot").trim().toLowerCase(),
    systemPrompt: cohSystemPrompt,
    botOwnerIds: optionalList("BOT_OWNER_IDS"),
    allowedGuildIds: optionalList("ALLOWED_GUILD_IDS"),
    messageHistoryLimit: optionalNumber("MESSAGE_HISTORY_LIMIT", 16),
    replyMaxCharacters: optionalNumber("REPLY_MAX_CHARACTERS", 180),
    replyChainLimit: optionalNumber("REPLY_CHAIN_LIMIT", 6),
    channelContextTtlMs: optionalNumber("CHANNEL_CONTEXT_TTL_MS", 60 * 60 * 1000),
    openRouterTranscriptionModel: Bun.env.OPENROUTER_TRANSCRIPTION_MODEL ?? openRouterModel,
    openRouterTimeoutMs: optionalNumber("OPENROUTER_TIMEOUT_MS", 30_000),
    openRouterMaxOutputTokens: optionalNumber("OPENROUTER_MAX_OUTPUT_TOKENS", 140),
    openRouterTemperature: optionalNumber("OPENROUTER_TEMPERATURE", 0.8),
    randomPingChance: optionalNumber("RANDOM_PING_CHANCE", 0.04),
    randomPingCooldownMs: optionalNumber("RANDOM_PING_COOLDOWN_MS", 45 * 60 * 1000),
    triggerCooldownMs: optionalNumber("TRIGGER_COOLDOWN_MS", 5000),
    voiceNoteMaxBytes: optionalNumber("VOICE_NOTE_MAX_BYTES", 12_000_000),
    logLevel,
  };
}

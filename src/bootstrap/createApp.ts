import { createChatService } from "../ai/chatService";
import { createOpenRouterClient } from "../ai/openRouterClient";
import { createAttachmentTranscriptionService } from "../attachments/attachmentTranscriptionService";
import { createCommandRegistry } from "../commands";
import { loadConfig } from "../config";
import { createContextStore } from "../context/contextStore";
import { createDatabase } from "../db/client";
import { runMigrations } from "../db/migrate";
import { createBlacklistRepository } from "../db/repositories/blacklistRepository";
import { createDiscordClient } from "../discord/createClient";
import { registerEvents } from "../discord/registerEvents";
import { createCooldownManager } from "../filters/cooldownManager";
import { createMessageFilter } from "../filters/messageFilter";
import { createMessageHandler } from "../handlers/messageHandler";
import type { ServiceContainer } from "../types/services";
import { createLogger } from "../utils/logger";

export function createApp() {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  const database = createDatabase(config.databasePath);

  runMigrations(database);

  const blacklistRepository = createBlacklistRepository(database);
  const contextStore = createContextStore({
    historyLimit: config.messageHistoryLimit,
    ttlMs: config.channelContextTtlMs,
  });
  const openRouterClient = createOpenRouterClient(config, logger);
  const attachmentTranscriptionService = createAttachmentTranscriptionService({
    config,
    logger,
    openRouterClient,
  });
  const chatService = createChatService({ config, openRouterClient, contextStore, logger });
  const cooldowns = createCooldownManager(config.triggerCooldownMs);
  const messageFilter = createMessageFilter({ config, blacklistRepository, cooldowns, logger });
  const client = createDiscordClient();
  let isShuttingDown = false;

  const services: ServiceContainer = {
    attachmentTranscriptionService,
    blacklistRepository,
    config,
    logger,
    database,
    contextStore,
    openRouterClient,
    chatService,
    messageFilter,
    cooldowns,
  };

  const commandRegistry = createCommandRegistry(services);
  const messageHandler = createMessageHandler({ services, commandRegistry, client });

  registerEvents({ client, logger, messageHandler });

  const shutdown = (signal: string) => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;
    logger.info(`Received ${signal}; shutting down.`);
    database.close();
    if (client.isReady()) {
      client.destroy();
    }
    process.exit(0);
  };

  process.on("SIGINT", () => {
    Promise.resolve(shutdown("SIGINT")).catch((error: unknown) => {
      logger.error("Shutdown failed", error);
      process.exit(1);
    });
  });
  process.on("SIGTERM", () => {
    Promise.resolve(shutdown("SIGTERM")).catch((error: unknown) => {
      logger.error("Shutdown failed", error);
      process.exit(1);
    });
  });

  return {
    start: async () => {
      await attachmentTranscriptionService.validateStartup();
      await openRouterClient.validateModelSupport({
        model: config.openRouterModel,
        requiredInputModality: "image",
      });
      await client.login(config.discordToken);
      logger.info("Bot connected to Discord.");
    },
  };
}

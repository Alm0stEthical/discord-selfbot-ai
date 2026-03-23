import type { Database } from "bun:sqlite";
import type { ChatService } from "../ai/chatService";
import type { OpenRouterClient } from "../ai/openRouterClient";
import type { AttachmentTranscriptionService } from "../attachments/attachmentTranscriptionService";
import type { AppConfig } from "../config";
import type { ContextStore } from "../context/contextStore";
import type { BlacklistRepository } from "../db/repositories/blacklistRepository";
import type { CooldownManager } from "../filters/cooldownManager";
import type { MessageFilter } from "../filters/messageFilter";
import type { Logger } from "../utils/logger";

export interface ServiceContainer {
  attachmentTranscriptionService: AttachmentTranscriptionService;
  blacklistRepository: BlacklistRepository;
  chatService: ChatService;
  config: AppConfig;
  contextStore: ContextStore;
  cooldowns: CooldownManager;
  database: Database;
  logger: Logger;
  messageFilter: MessageFilter;
  openRouterClient: OpenRouterClient;
}

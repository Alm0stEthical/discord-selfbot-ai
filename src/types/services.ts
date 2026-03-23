import type { Database } from "bun:sqlite";
import type { ChatService } from "../ai/chatService";
import type { OpenRouterClient } from "../ai/openRouterClient";
import type { AttachmentTranscriptionService } from "../attachments/attachmentTranscriptionService";
import type { AppConfig } from "../config";
import type { ContextStore } from "../context/contextStore";
import type { WhitelistRepository } from "../db/repositories/whitelistRepository";
import type { CooldownManager } from "../filters/cooldownManager";
import type { MessageFilter } from "../filters/messageFilter";
import type { Logger } from "../utils/logger";

export interface ServiceContainer {
  attachmentTranscriptionService: AttachmentTranscriptionService;
  chatService: ChatService;
  config: AppConfig;
  contextStore: ContextStore;
  cooldowns: CooldownManager;
  database: Database;
  logger: Logger;
  messageFilter: MessageFilter;
  openRouterClient: OpenRouterClient;
  whitelistRepository: WhitelistRepository;
}

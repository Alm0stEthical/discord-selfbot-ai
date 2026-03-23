import type { Client, Message } from "discord.js-selfbot-v13";
import type { Logger } from "../utils/logger";

interface RegisterEventsInput {
  client: Client;
  logger: Logger;
  messageHandler: (message: Message) => Promise<void>;
}

export function registerEvents({ client, logger, messageHandler }: RegisterEventsInput): void {
  client.once("ready", () => {
    logger.info(`I am ${client.user?.tag ?? "unknown"}.`);
  });

  client.on("messageCreate", (message) => {
    messageHandler(message).catch((error: unknown) => {
      logger.error("messageCreate handler failed", error);
      return undefined;
    });
  });

  client.on("error", (error) => {
    logger.error("Discord client error", error);
  });
}

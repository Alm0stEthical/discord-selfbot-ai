import type { Message } from "discord.js-selfbot-v13";
import type { ConversationContext, StoredMessage } from "./types";

interface ChannelBucket {
  messages: StoredMessage[];
  updatedAt: number;
}

export interface ContextStore {
  buildContext(input: {
    currentMessage: StoredMessage;
    message: Message;
    normalizeMessage: (message: Message) => Promise<StoredMessage>;
    replyChainLimit: number;
  }): Promise<ConversationContext>;
  remember(message: StoredMessage): void;
}

export function createContextStore(input: { historyLimit: number; ttlMs: number }): ContextStore {
  const buckets = new Map<string, ChannelBucket>();

  const sweep = () => {
    const now = Date.now();
    for (const [channelId, bucket] of buckets) {
      if (now - bucket.updatedAt > input.ttlMs) {
        buckets.delete(channelId);
      }
    }
  };

  return {
    remember(message) {
      sweep();
      const existing = buckets.get(message.channelId) ?? { messages: [], updatedAt: Date.now() };
      existing.messages.push(message);
      if (existing.messages.length > input.historyLimit) {
        existing.messages.splice(0, existing.messages.length - input.historyLimit);
      }
      existing.updatedAt = Date.now();
      buckets.set(message.channelId, existing);
    },
    async buildContext({ currentMessage, message, normalizeMessage, replyChainLimit }) {
      sweep();
      const bucket = buckets.get(message.channelId);
      const recentMessages = (bucket?.messages ?? []).filter(
        (entry) => entry.id !== currentMessage.id,
      );
      const replyChain: StoredMessage[] = [];

      let current = message.reference?.messageId
        ? await message.fetchReference().catch(() => null)
        : null;
      while (current && replyChain.length < replyChainLimit) {
        replyChain.unshift(await normalizeMessage(current));
        current = current.reference?.messageId
          ? await current.fetchReference().catch(() => null)
          : null;
      }

      return { replyChain, recentMessages };
    },
  };
}

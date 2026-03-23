export interface StoredMessage {
  attachmentTranscript?: string;
  authorDisplayName: string;
  authorId: string;
  authorLabel: string;
  authorUsername: string;
  channelId: string;
  content: string;
  createdAt: number;
  id: string;
  imageUrls: string[];
  isBot: boolean;
  replyToMessageId?: string;
}

export interface ConversationContext {
  recentMessages: StoredMessage[];
  replyChain: StoredMessage[];
}

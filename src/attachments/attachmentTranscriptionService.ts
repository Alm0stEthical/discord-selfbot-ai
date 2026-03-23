import type { Message, MessageAttachment } from "discord.js-selfbot-v13";
import type { OpenRouterClient } from "../ai/openRouterClient";
import type { AppConfig } from "../config";
import type { Logger } from "../utils/logger";

const AUDIO_CONTENT_TYPE_PREFIX = "audio/";
const AUDIO_FILE_EXTENSIONS = new Set(["aac", "flac", "m4a", "mp3", "ogg", "wav"]);

export interface AttachmentTranscriptionResult {
  attachmentName: string;
  transcript: string;
}

export interface AttachmentTranscriptionService {
  transcribeVoiceNote(message: Message): Promise<AttachmentTranscriptionResult | null>;
  validateStartup(): Promise<void>;
}

function getAttachmentExtension(name: string): string | null {
  const extension = name.split(".").pop()?.toLowerCase();
  return extension ?? null;
}

function isSupportedAudioAttachment(attachment: MessageAttachment): boolean {
  if (attachment.contentType?.startsWith(AUDIO_CONTENT_TYPE_PREFIX)) {
    return true;
  }

  if (!attachment.name) {
    return false;
  }

  const extension = getAttachmentExtension(attachment.name);
  return extension !== null && AUDIO_FILE_EXTENSIONS.has(extension);
}

function inferAudioFormat(attachment: MessageAttachment): string | null {
  const contentType = attachment.contentType?.toLowerCase();
  if (contentType?.startsWith(AUDIO_CONTENT_TYPE_PREFIX)) {
    const subtype = contentType.split("/")[1]?.split(";")[0];
    if (subtype === "mpeg") {
      return "mp3";
    }
    if (subtype === "mp4") {
      return "m4a";
    }
    if (subtype === "x-wav") {
      return "wav";
    }
    return subtype ?? null;
  }

  if (!attachment.name) {
    return null;
  }

  return getAttachmentExtension(attachment.name);
}

export function createAttachmentTranscriptionService(input: {
  config: AppConfig;
  logger: Logger;
  openRouterClient: OpenRouterClient;
}): AttachmentTranscriptionService {
  return {
    async validateStartup() {
      await input.openRouterClient.validateModelSupport({
        model: input.config.openRouterModel,
        requiredInputModality: "text",
      });
      await input.openRouterClient.validateModelSupport({
        model: input.config.openRouterModel,
        requiredInputModality: "audio",
      });
    },
    async transcribeVoiceNote(message) {
      const attachment = message.attachments.find((entry) => isSupportedAudioAttachment(entry));
      if (!attachment) {
        return null;
      }

      if (attachment.size > input.config.voiceNoteMaxBytes) {
        input.logger.warn("Skipping oversized voice note attachment", {
          attachmentName: attachment.name,
          size: attachment.size,
        });
        return null;
      }

      const format = inferAudioFormat(attachment);
      if (!format) {
        input.logger.warn("Skipping audio attachment with unknown format", {
          attachmentName: attachment.name,
        });
        return null;
      }

      const response = await fetch(attachment.url);
      if (!response.ok) {
        throw new Error(`Failed to download attachment (${response.status})`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const bytes = Buffer.from(arrayBuffer);
      const transcript = await input.openRouterClient.transcribeAudio({
        audioBase64: bytes.toString("base64"),
        format,
        prompt: "Transcribe this Discord voice note naturally and accurately.",
      });

      return {
        attachmentName: attachment.name ?? "voice-note",
        transcript,
      };
    },
  };
}

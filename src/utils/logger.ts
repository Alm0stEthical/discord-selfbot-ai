export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug: (message: string, metadata?: unknown) => void;
  error: (message: string, metadata?: unknown) => void;
  info: (message: string, metadata?: unknown) => void;
  warn: (message: string, metadata?: unknown) => void;
}

const levels: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export function createLogger(level: LogLevel): Logger {
  const threshold = levels[level];

  const log = (current: LogLevel, message: string, metadata?: unknown) => {
    if (levels[current] < threshold) {
      return;
    }

    const stamp = new Date().toISOString();
    if (metadata === undefined) {
      console.log(`[${stamp}] [${current}] ${message}`);
      return;
    }
    console.log(`[${stamp}] [${current}] ${message}`, metadata);
  };

  return {
    debug: (message, metadata) => log("debug", message, metadata),
    info: (message, metadata) => log("info", message, metadata),
    warn: (message, metadata) => log("warn", message, metadata),
    error: (message, metadata) => log("error", message, metadata),
  };
}

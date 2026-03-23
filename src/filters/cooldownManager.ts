export interface CooldownManager {
  hit(key: string): void;
  isCoolingDown(key: string): boolean;
}

export function createCooldownManager(durationMs: number): CooldownManager {
  const lastSeen = new Map<string, number>();

  return {
    isCoolingDown(key) {
      const previous = lastSeen.get(key);
      return previous !== undefined && Date.now() - previous < durationMs;
    },
    hit(key) {
      lastSeen.set(key, Date.now());
    },
  };
}

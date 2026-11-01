import { AiError } from "./errors";

// Separate from workflow AI's database quota: no schema change is needed for a
// reading-only feature. State is per server process, bounded and never logged.
export function createReadingLimiter(now: () => number = Date.now) {
  const windows = new Map<string, { expires: number; count: number; busy: boolean }>();
  return (officerId: string) => {
    const time = now();
    for (const [id, window] of windows)
      if (window.expires <= time && !window.busy) windows.delete(id);
    let window = windows.get(officerId);
    if (window?.busy || (window && window.count >= 6 && window.expires > time))
      throw new AiError("AI_RATE_LIMITED", 429, Math.max(1, Math.ceil((window.expires - time) / 1000)));
    if (!window || window.expires <= time) {
      if (windows.size >= 2000) throw new AiError("AI_UNAVAILABLE", 503);
      window = { expires: time + 60000, count: 0, busy: false };
      windows.set(officerId, window);
    }
    window.count++;
    window.busy = true;
    const acquired = window;
    return () => { acquired.busy = false; };
  };
}

// Display formatting for durations (integer milliseconds in contract v1).

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** `m:ss` under an hour, `h:mm:ss` from an hour up. Floors to whole seconds. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
}

/** Average time per player in a game: global time divided by player count, in ms. */
export function averagePerPlayerMs(globalMs: number, playerCount: number): number {
  return playerCount > 0 ? Math.round(globalMs / playerCount) : 0;
}

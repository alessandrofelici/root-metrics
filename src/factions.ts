// Faction key → names, from specs.md → "Contract v1" → "Faction keys".
// Faction is an open string in the contract: unknown keys are shown as-is.

export interface FactionNames {
  short: string; // name shown on the device
  full: string;
}

export const FACTIONS: Readonly<Record<string, FactionNames>> = Object.freeze({
  marquise: { short: "Marquise", full: "Marquise de Cat" },
  eyrie: { short: "Eyrie", full: "Eyrie Dynasties" },
  woodland: { short: "Woodland", full: "Woodland Alliance" },
  vagabond: { short: "Vagabond", full: "Vagabond" },
  riverfolk: { short: "Riverfolk", full: "Riverfolk Company" },
  cult: { short: "Lizard Cult", full: "Lizard Cult" },
  duchy: { short: "Duchy", full: "Underground Duchy" },
  corvid: { short: "Corvids", full: "Corvid Conspiracy" },
  hundreds: { short: "Hundreds", full: "Lord of the Hundreds" },
  keepers: { short: "Keepers", full: "Keepers in Iron" },
  twilight: { short: "Twilight", full: "Twilight Council" },
  knaves: { short: "Knaves", full: "Knaves of the Deepwood" },
  lilypad: { short: "Lilypad", full: "Lilypad Diaspora" },
});

/** Full faction name for a key, or the raw key if it is not in the table. */
export function factionName(key: string): string {
  return Object.hasOwn(FACTIONS, key) ? FACTIONS[key]!.full : key;
}

/** URL of the bundled icon for a known faction key, or undefined for unknown keys (no icon). */
export function factionIconUrl(key: string): string | undefined {
  return Object.hasOwn(FACTIONS, key) ? `/static/factions/${key}.png` : undefined;
}

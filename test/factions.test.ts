import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { FACTIONS, factionIconUrl, factionName } from "../src/factions.js";

describe("factions", () => {
  it("has all 13 factions from the spec table", () => {
    expect(Object.keys(FACTIONS)).toHaveLength(13);
    expect(FACTIONS.cult).toEqual({ short: "Lizard Cult", full: "Lizard Cult" });
    expect(FACTIONS.corvid).toEqual({ short: "Corvids", full: "Corvid Conspiracy" });
  });

  it("returns the full name for a known key", () => {
    expect(factionName("marquise")).toBe("Marquise de Cat");
    expect(factionName("duchy")).toBe("Underground Duchy");
  });

  it("returns the raw key for an unknown key", () => {
    expect(factionName("some_future_faction")).toBe("some_future_faction");
    expect(factionName("toString")).toBe("toString");
  });
});

describe("factionIconUrl", () => {
  it("returns a static URL for known keys and undefined for unknown ones", () => {
    expect(factionIconUrl("marquise")).toBe("/static/factions/marquise.png");
    expect(factionIconUrl("otters")).toBeUndefined();
    expect(factionIconUrl("toString")).toBeUndefined();
    expect(factionIconUrl("../secret")).toBeUndefined();
  });

  it("has a bundled icon file for every faction key", () => {
    const dir = path.resolve(import.meta.dirname, "../public/factions");
    for (const key of Object.keys(FACTIONS)) {
      expect(fs.existsSync(path.join(dir, `${key}.png`)), key).toBe(true);
    }
  });
});

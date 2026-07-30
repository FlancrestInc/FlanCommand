import { describe, expect, it } from "vitest";

import { defaultSettings, normalizeSettings } from "./settings.js";

describe("settings", () => {
  it("provides conservative defaults", () => {
    expect(defaultSettings).toEqual({
      defaultModel: "",
      reasoningEffort: "medium",
      responseLimit: 4096,
      notifications: true,
      retentionDays: 30,
      theme: "xp",
      chatBackground: "bliss",
      compactActivity: false,
    });
  });

  it("normalizes partial and invalid values without accepting unsafe limits", () => {
    expect(
      normalizeSettings({
        defaultModel: " hermes-fast ",
        reasoningEffort: "high",
        responseLimit: 999999,
        notifications: false,
        retentionDays: -4,
        theme: "win98",
        chatBackground: "clouds",
        compactActivity: true,
      }),
    ).toEqual({
      defaultModel: "hermes-fast",
      reasoningEffort: "high",
      responseLimit: 32768,
      notifications: false,
      retentionDays: 1,
      theme: "win98",
      chatBackground: "clouds",
      compactActivity: true,
    });
  });

  it("accepts all supported themes", () => {
    expect(normalizeSettings({ theme: "xp" }).theme).toBe("xp");
    expect(normalizeSettings({ theme: "win98" }).theme).toBe("win98");
    expect(normalizeSettings({ theme: "cga" }).theme).toBe("cga");
    expect(normalizeSettings({ theme: "amber" }).theme).toBe("amber");
    expect(normalizeSettings({ theme: "green" }).theme).toBe("green");
    expect(normalizeSettings({ theme: "win98css" }).theme).toBe("win98css");
    expect(normalizeSettings({ theme: "unknown" }).theme).toBe("xp");
  });

  it("accepts classic chat backgrounds", () => {
    expect(normalizeSettings({ chatBackground: "3d-pipes" }).chatBackground).toBe("3d-pipes");
  });
});

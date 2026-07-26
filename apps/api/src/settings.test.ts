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
      theme: "dark",
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
        theme: "light",
        compactActivity: true,
      }),
    ).toEqual({
      defaultModel: "hermes-fast",
      reasoningEffort: "high",
      responseLimit: 32768,
      notifications: false,
      retentionDays: 1,
      theme: "light",
      compactActivity: true,
    });
  });

  it("accepts the classic command-center theme", () => {
    expect(normalizeSettings({ theme: "classic" }).theme).toBe("classic");
  });
});

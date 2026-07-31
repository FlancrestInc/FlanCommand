export type ReasoningEffort = "low" | "medium" | "high";
export type SettingsTheme =
  "xp" | "cga" | "amber" | "green" | "win98css" | "xpcss" | "win7css" | "classiccss";
export type ChatBackground =
  | "mac-checkerboard" | "mac-dots" | "mac-bricks" | "mac-diagonal"
  | "cga-grid" | "cga-magenta" | "dos-blue"
  | "amber-phosphor" | "amber-grid" | "amber-terminal"
  | "green-phosphor" | "green-grid" | "green-terminal"
  | "win98-clouds" | "win98-teal-tile" | "win98-desk-tile" | "3d-pipes"
  | "bliss" | "clouds" | "autumn" | "azul" | "xp-green-hills"
  | "win7-aurora" | "win7-bloom" | "win7-ribbons"
  | "mac-platinum" | "mac-os8-clouds" | "mac-os9-aqua" | "none";

export interface UserSettings {
  defaultModel: string;
  reasoningEffort: ReasoningEffort;
  responseLimit: number;
  notifications: boolean;
  retentionDays: number;
  theme: SettingsTheme;
  chatBackground: ChatBackground;
  compactActivity: boolean;
}

export const defaultSettings: UserSettings = {
  defaultModel: "",
  reasoningEffort: "medium",
  responseLimit: 4096,
  notifications: true,
  retentionDays: 30,
  theme: "xp",
  chatBackground: "bliss",
  compactActivity: false,
};

function boundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

export function normalizeSettings(
  input: Record<string, unknown>,
  base: UserSettings = defaultSettings,
): UserSettings {
  return {
    defaultModel:
      typeof input.defaultModel === "string"
        ? input.defaultModel.trim().slice(0, 160)
        : base.defaultModel,
    reasoningEffort:
      input.reasoningEffort === "low" || input.reasoningEffort === "high"
        ? input.reasoningEffort
        : input.reasoningEffort === "medium"
          ? "medium"
          : base.reasoningEffort,
    responseLimit: boundedInteger(input.responseLimit, base.responseLimit, 256, 32768),
    notifications:
      typeof input.notifications === "boolean" ? input.notifications : base.notifications,
    retentionDays: boundedInteger(input.retentionDays, base.retentionDays, 1, 365),
    theme:
      input.theme === "win98"
        ? "xp"
        : input.theme === "xp" ||
            input.theme === "cga" ||
            input.theme === "amber" ||
            input.theme === "green" ||
            input.theme === "win98css" ||
            input.theme === "xpcss" ||
            input.theme === "win7css" ||
            input.theme === "classiccss"
          ? input.theme
          : base.theme,
    chatBackground:
      [
        "mac-checkerboard", "mac-dots", "mac-bricks", "mac-diagonal", "cga-grid", "cga-magenta",
        "dos-blue", "amber-phosphor", "amber-grid", "amber-terminal", "green-phosphor", "green-grid",
        "green-terminal", "win98-clouds", "win98-teal-tile", "win98-desk-tile", "3d-pipes", "bliss", "clouds", "autumn",
        "azul", "xp-green-hills", "win7-aurora", "win7-bloom", "win7-ribbons", "mac-platinum",
        "mac-os8-clouds", "mac-os9-aqua", "none",
      ].includes(input.chatBackground as ChatBackground)
        ? (input.chatBackground as ChatBackground)
        : base.chatBackground,
    compactActivity:
      typeof input.compactActivity === "boolean" ? input.compactActivity : base.compactActivity,
  };
}

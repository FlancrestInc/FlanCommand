export type ReasoningEffort = "low" | "medium" | "high";
export type SettingsTheme = "xp" | "win98";
export type ChatBackground = "bliss" | "clouds" | "autumn" | "3d-pipes" | "azul" | "none";

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
    theme: input.theme === "xp" || input.theme === "win98" ? input.theme : base.theme,
    chatBackground:
      input.chatBackground === "bliss" ||
      input.chatBackground === "clouds" ||
      input.chatBackground === "autumn" ||
      input.chatBackground === "3d-pipes" ||
      input.chatBackground === "azul" ||
      input.chatBackground === "none"
        ? input.chatBackground
        : base.chatBackground,
    compactActivity:
      typeof input.compactActivity === "boolean" ? input.compactActivity : base.compactActivity,
  };
}

export type ReasoningEffort = "low" | "medium" | "high";
export type SettingsTheme = "dark" | "light" | "classic";

export interface UserSettings {
  defaultModel: string;
  reasoningEffort: ReasoningEffort;
  responseLimit: number;
  notifications: boolean;
  retentionDays: number;
  theme: SettingsTheme;
  compactActivity: boolean;
}

export const defaultSettings: UserSettings = {
  defaultModel: "",
  reasoningEffort: "medium",
  responseLimit: 4096,
  notifications: true,
  retentionDays: 30,
  theme: "dark",
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
      input.theme === "light" || input.theme === "dark" || input.theme === "classic"
        ? input.theme
        : base.theme,
    compactActivity:
      typeof input.compactActivity === "boolean" ? input.compactActivity : base.compactActivity,
  };
}

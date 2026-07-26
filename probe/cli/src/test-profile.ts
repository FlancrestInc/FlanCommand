export const SAFE_PROFILE = "hermes-command-center-safe" as const;
export const SAFE_PROMPT =
  "Reply with exactly: HERMES_PROBE_OK. Do not call tools, read or write files, access the network, use credentials, send messages, or cause external side effects.";

export function canRunTestMutation(options: {
  allowTestMutations: boolean;
  profile?: string;
}): boolean {
  return options.allowTestMutations && options.profile === SAFE_PROFILE;
}

export function recoveryForSendFailure(
  error: { name?: string } | null | undefined,
  text: string,
): { draft: string; needsRefresh: boolean } | null;

export function recoveryForSendFailure(error, text) {
  if (error?.name === "AbortError") return null;
  const draft = String(text || "").trim();
  return draft ? { draft, needsRefresh: true } : null;
}

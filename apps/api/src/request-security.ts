export function parseAllowedOrigins(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

export function isAllowedRequestOrigin(
  origin: string | undefined,
  allowedOrigins: Set<string>,
): boolean {
  if (!origin || !allowedOrigins.size) return true;
  return allowedOrigins.has(origin);
}

export interface RequestAuthConfig {
  required: boolean;
  identityHeader: string;
}

export type HeaderBag = Record<string, string | string[] | undefined>;

export function readAuthConfig(
  environment: Record<string, string | undefined> = process.env,
): RequestAuthConfig {
  const identityHeader = environment.FLANC_AUTH_IDENTITY_HEADER?.trim().toLowerCase();
  return {
    required: environment.FLANC_REQUIRE_AUTH === "1" || environment.FLANC_REQUIRE_AUTH === "true",
    identityHeader: identityHeader || "cf-access-authenticated-user-email",
  };
}

export function hasTrustedIdentity(headers: HeaderBag, config: RequestAuthConfig): boolean {
  if (!config.required) return true;
  const raw = headers[config.identityHeader] ?? headers[config.identityHeader.toLowerCase()];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && value.trim().length > 0;
}

import { describe, expect, it } from "vitest";

import { hasTrustedIdentity, readAuthConfig } from "./request-auth.js";

describe("request authentication", () => {
  it("keeps authentication off for local development by default", () => {
    expect(readAuthConfig({})).toEqual({
      required: false,
      identityHeader: "cf-access-authenticated-user-email",
    });
  });

  it("accepts a non-empty configured identity header only when required", () => {
    const config = readAuthConfig({
      FLANC_REQUIRE_AUTH: "true",
      FLANC_AUTH_IDENTITY_HEADER: "X-Forwarded-User",
    });
    expect(config).toEqual({ required: true, identityHeader: "x-forwarded-user" });
    expect(hasTrustedIdentity({ "x-forwarded-user": "ryan@example.com" }, config)).toBe(true);
    expect(hasTrustedIdentity({ "x-forwarded-user": "  " }, config)).toBe(false);
    expect(hasTrustedIdentity({}, config)).toBe(false);
  });
});

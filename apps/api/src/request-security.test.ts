import { describe, expect, it } from "vitest";

import { isAllowedRequestOrigin, parseAllowedOrigins } from "./request-security.js";

describe("request origin policy", () => {
  it("allows same-origin requests when no deployment list is configured", () => {
    expect(isAllowedRequestOrigin(undefined, new Set())).toBe(true);
    expect(isAllowedRequestOrigin("http://localhost:3000", new Set())).toBe(true);
  });

  it("requires an exact match when allowed origins are configured", () => {
    const origins = parseAllowedOrigins("https://command.example, https://admin.example");

    expect(isAllowedRequestOrigin("https://command.example", origins)).toBe(true);
    expect(isAllowedRequestOrigin("https://evil.example", origins)).toBe(false);
    expect(isAllowedRequestOrigin("https://command.example/", origins)).toBe(false);
  });

  it("ignores blank origin entries", () => {
    expect(parseAllowedOrigins(" , https://command.example, ")).toEqual(
      new Set(["https://command.example"]),
    );
  });
});

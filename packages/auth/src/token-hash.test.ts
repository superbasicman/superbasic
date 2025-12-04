import { describe, expect, it } from "vitest";
import { createOpaqueToken, parseOpaqueToken } from "./token-hash.js";

describe("parseOpaqueToken", () => {
  it("returns tokenId and secret for valid opaque tokens (legacy)", () => {
    const token = createOpaqueToken();

    const parsed = parseOpaqueToken(token.value);

    expect(parsed).not.toBeNull();
    expect(parsed?.tokenId).toMatch(
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/
    );
    expect(parsed?.tokenSecret).toBeTruthy();
  });

  it("rejects tokens without a delimiter", () => {
    expect(parseOpaqueToken("invalid-token")).toBeNull();
  });

  it("rejects tokens that don't use a UUID prefix", () => {
    const parsed = parseOpaqueToken("not-a-uuid.secret");
    expect(parsed).toBeNull();
  });

  it("parses prefixed tokens with expected prefix", () => {
    const token = createOpaqueToken({ prefix: "pat" });

    const parsed = parseOpaqueToken(token.value, { expectedPrefix: "pat" });

    expect(parsed).not.toBeNull();
    expect(parsed?.prefix).toBe("pat");
  });

  it("rejects prefixed tokens when expectedPrefix mismatches", () => {
    const token = createOpaqueToken({ prefix: "pat" });
    expect(parseOpaqueToken(token.value, { expectedPrefix: "rt" })).toBeNull();
  });
});

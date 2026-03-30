import { describe, it, expect } from "vitest";

function resolveCorsOrigin(input: {
  nodeEnv: "development" | "production" | "test";
  configuredOrigins: string;
  requestOrigin?: string;
}) {
  const allowedOrigins = input.configuredOrigins
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allowAllOrigins = input.nodeEnv !== "production" && allowedOrigins.length === 0;

  if (!input.requestOrigin) return input.requestOrigin;
  if (allowAllOrigins) return input.requestOrigin;
  return allowedOrigins.includes(input.requestOrigin) ? input.requestOrigin : "";
}

describe("CORS origin resolution", () => {
  it("blocks browser origins by default in production when none are configured", () => {
    expect(
      resolveCorsOrigin({
        nodeEnv: "production",
        configuredOrigins: "",
        requestOrigin: "https://evil.example",
      }),
    ).toBe("");
  });

  it("allows configured production origins", () => {
    expect(
      resolveCorsOrigin({
        nodeEnv: "production",
        configuredOrigins: "https://app.example.com, https://admin.example.com",
        requestOrigin: "https://app.example.com",
      }),
    ).toBe("https://app.example.com");
  });

  it("still allows non-browser requests without an Origin header", () => {
    expect(
      resolveCorsOrigin({
        nodeEnv: "production",
        configuredOrigins: "",
      }),
    ).toBeUndefined();
  });

  it("allows all origins in development when none are configured", () => {
    expect(
      resolveCorsOrigin({
        nodeEnv: "development",
        configuredOrigins: "",
        requestOrigin: "http://localhost:5173",
      }),
    ).toBe("http://localhost:5173");
  });

  it("restricts development to the explicit allowlist when configured", () => {
    expect(
      resolveCorsOrigin({
        nodeEnv: "development",
        configuredOrigins: "http://localhost:5173",
        requestOrigin: "https://other.example",
      }),
    ).toBe("");
  });
});

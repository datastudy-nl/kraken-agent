import { describe, it, expect } from "vitest";
import { isBlockedUrl } from "./browser.js";

describe("isBlockedUrl", () => {
  // --- Allowed URLs ---
  it("allows normal HTTP URLs", () => {
    expect(isBlockedUrl("http://example.com")).toBe(false);
    expect(isBlockedUrl("https://google.com")).toBe(false);
  });

  it("allows HTTPS URLs with paths", () => {
    expect(isBlockedUrl("https://api.github.com/repos")).toBe(false);
  });

  it("allows URLs with ports", () => {
    expect(isBlockedUrl("https://example.com:8443/path")).toBe(false);
  });

  it("allows public IP addresses", () => {
    expect(isBlockedUrl("http://8.8.8.8")).toBe(false);
    expect(isBlockedUrl("http://1.1.1.1")).toBe(false);
  });

  // --- Blocked schemes ---
  it("blocks file: URLs", () => {
    expect(isBlockedUrl("file:///etc/passwd")).toBe(true);
  });

  it("blocks javascript: URLs", () => {
    expect(isBlockedUrl("javascript:alert(1)")).toBe(true);
  });

  it("blocks data: URLs", () => {
    expect(isBlockedUrl("data:text/html,<script>alert(1)</script>")).toBe(true);
  });

  it("blocks vbscript: URLs", () => {
    expect(isBlockedUrl("vbscript:MsgBox")).toBe(true);
  });

  it("blocks ftp: URLs", () => {
    expect(isBlockedUrl("ftp://files.example.com")).toBe(true);
  });

  it("blocks non-HTTP(S) schemes", () => {
    expect(isBlockedUrl("gopher://example.com")).toBe(true);
  });

  // --- Blocked hosts ---
  it("blocks localhost", () => {
    expect(isBlockedUrl("http://localhost")).toBe(true);
    expect(isBlockedUrl("http://localhost:3000")).toBe(true);
  });

  it("blocks 127.0.0.1", () => {
    expect(isBlockedUrl("http://127.0.0.1")).toBe(true);
    expect(isBlockedUrl("http://127.0.0.1:8080")).toBe(true);
  });

  it("blocks IPv6 loopback", () => {
    expect(isBlockedUrl("http://[::1]")).toBe(true);
  });

  it("blocks cloud metadata endpoint", () => {
    expect(isBlockedUrl("http://169.254.169.254/latest/meta-data")).toBe(true);
  });

  it("blocks Google metadata endpoint", () => {
    expect(isBlockedUrl("http://metadata.google.internal")).toBe(true);
  });

  it("blocks .internal domains", () => {
    expect(isBlockedUrl("http://something.internal")).toBe(true);
  });

  it("blocks host.docker.internal", () => {
    expect(isBlockedUrl("http://host.docker.internal")).toBe(true);
  });

  // --- Private IPv4 ranges ---
  it("blocks 10.x.x.x (RFC 1918)", () => {
    expect(isBlockedUrl("http://10.0.0.1")).toBe(true);
    expect(isBlockedUrl("http://10.255.255.255")).toBe(true);
  });

  it("blocks 172.16-31.x.x (RFC 1918)", () => {
    expect(isBlockedUrl("http://172.16.0.1")).toBe(true);
    expect(isBlockedUrl("http://172.31.255.255")).toBe(true);
  });

  it("allows 172.32.x.x (not RFC 1918)", () => {
    expect(isBlockedUrl("http://172.32.0.1")).toBe(false);
  });

  it("allows 172.15.x.x (not RFC 1918)", () => {
    expect(isBlockedUrl("http://172.15.0.1")).toBe(false);
  });

  it("blocks 192.168.x.x (RFC 1918)", () => {
    expect(isBlockedUrl("http://192.168.0.1")).toBe(true);
    expect(isBlockedUrl("http://192.168.1.100")).toBe(true);
  });

  it("blocks 169.254.x.x (link-local)", () => {
    expect(isBlockedUrl("http://169.254.1.1")).toBe(true);
  });

  it("blocks 0.x.x.x", () => {
    expect(isBlockedUrl("http://0.0.0.0")).toBe(true);
  });

  // --- Unparseable ---
  it("blocks unparseable URLs", () => {
    expect(isBlockedUrl("not-a-url")).toBe(true);
    expect(isBlockedUrl("")).toBe(true);
  });
});

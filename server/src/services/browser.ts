/**
 * Browser automation service — CDP-based browsing via Playwright.
 *
 * Each session gets an isolated browser page (tab). Pages are lazily created
 * and cleaned up when sessions are archived.
 *
 * SSRF protection: all navigation targets are validated against a blocklist
 * of private/internal networks and dangerous schemes.
 */
import { chromium, type Browser, type Page, type Route } from "playwright-core";
import { config } from "../config.js";

let browser: Browser | null = null;
const pages = new Map<string, Page>();

// ---------------------------------------------------------------------------
// SSRF protection
// ---------------------------------------------------------------------------

const BLOCKED_SCHEMES = new Set(["file:", "javascript:", "data:", "vbscript:", "ftp:"]);

/**
 * Returns true if the URL targets a private, link-local, loopback, or cloud
 * metadata IP range, or uses a blocked scheme.
 */
export function isBlockedUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return true; // unparseable → blocked
  }

  if (BLOCKED_SCHEMES.has(parsed.protocol)) return true;
  if (!["http:", "https:"].includes(parsed.protocol)) return true;

  const host = parsed.hostname.toLowerCase();

  // Loopback
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]") return true;

  // Cloud metadata endpoints
  if (host === "169.254.169.254" || host === "metadata.google.internal") return true;

  // Docker internal DNS
  if (host.endsWith(".internal") || host === "host.docker.internal") return true;

  // IPv4 private ranges
  const ipv4Match = host.match(/^(\d+)\.(\d+)\.\d+\.\d+$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    if (a === 10) return true;                           // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true;    // 172.16.0.0/12
    if (a === 192 && b === 168) return true;              // 192.168.0.0/16
    if (a === 169 && b === 254) return true;              // 169.254.0.0/16 link-local
    if (a === 0) return true;                             // 0.0.0.0/8
  }

  return false;
}

// ---------------------------------------------------------------------------
// Browser lifecycle
// ---------------------------------------------------------------------------

async function getBrowser(): Promise<Browser> {
  if (browser?.isConnected()) return browser;

  try {
    // Try connecting to remote CDP endpoint first (Docker setup)
    browser = await chromium.connectOverCDP(config.KRAKEN_BROWSER_CDP_URL, {
      timeout: 10000,
    });
    console.log(`[browser] Connected via CDP: ${config.KRAKEN_BROWSER_CDP_URL}`);
  } catch {
    // Fall back to launching a local browser
    browser = await chromium.launch({
      headless: config.KRAKEN_BROWSER_HEADLESS,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });
    console.log("[browser] Launched local Chromium");
  }

  return browser;
}

// ---------------------------------------------------------------------------
// Page pool (one page per session)
// ---------------------------------------------------------------------------

export async function getOrCreatePage(sessionId: string): Promise<Page> {
  const existing = pages.get(sessionId);
  if (existing && !existing.isClosed()) return existing;

  const b = await getBrowser();
  const context = await b.newContext({
    userAgent: "KrakenAgent/1.0",
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  // Block common tracking/analytics requests to reduce noise
  await page.route("**/{analytics,tracking,beacon,pixel}**", (route: Route) => route.abort());

  pages.set(sessionId, page);
  return page;
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

export async function navigateTo(
  sessionId: string,
  url: string,
): Promise<{ url: string; title: string; status: number | null }> {
  if (isBlockedUrl(url)) {
    throw new Error(`Navigation blocked: ${url} targets a private or restricted address`);
  }

  const page = await getOrCreatePage(sessionId);
  const response = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: config.KRAKEN_BROWSER_TIMEOUT_MS,
  });

  return {
    url: page.url(),
    title: await page.title(),
    status: response?.status() ?? null,
  };
}

// ---------------------------------------------------------------------------
// Page inspection
// ---------------------------------------------------------------------------

export async function getPageSnapshot(sessionId: string): Promise<{
  url: string;
  title: string;
  snapshot: string;
}> {
  const page = await getOrCreatePage(sessionId);
  const title = await page.title();

  // Get a text snapshot of the page that LLMs can reason about.
  const snapshotText = await page.locator("body").innerText().catch(() => "(empty page)");

  return {
    url: page.url(),
    title,
    snapshot: snapshotText.slice(0, 16000),
  };
}

export async function screenshotPage(sessionId: string): Promise<string> {
  const page = await getOrCreatePage(sessionId);
  const buffer = await page.screenshot({
    type: "png",
    fullPage: false,
  });
  return buffer.toString("base64");
}

// ---------------------------------------------------------------------------
// Interaction
// ---------------------------------------------------------------------------

export async function clickElement(
  sessionId: string,
  selector: string,
): Promise<{ clicked: true }> {
  const page = await getOrCreatePage(sessionId);
  await page.click(selector, { timeout: config.KRAKEN_BROWSER_TIMEOUT_MS });
  // Wait for potential navigation or dynamic content
  await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => {});
  return { clicked: true };
}

export async function typeText(
  sessionId: string,
  selector: string,
  text: string,
): Promise<{ typed: true }> {
  const page = await getOrCreatePage(sessionId);
  await page.fill(selector, text, { timeout: config.KRAKEN_BROWSER_TIMEOUT_MS });
  return { typed: true };
}

export async function evaluateScript(
  sessionId: string,
  script: string,
): Promise<unknown> {
  const page = await getOrCreatePage(sessionId);
  return page.evaluate(script);
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

export async function closePage(sessionId: string): Promise<void> {
  const page = pages.get(sessionId);
  if (!page) return;
  pages.delete(sessionId);
  const context = page.context();
  await page.close().catch(() => {});
  // Close the browser context too (frees cookies/storage for this session)
  await context.close().catch(() => {});
}

export async function shutdownBrowser(): Promise<void> {
  for (const [id, page] of pages) {
    await page.close().catch(() => {});
    pages.delete(id);
  }
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
  }
}

// Ensure cleanup on process exit
process.on("SIGTERM", shutdownBrowser);
process.on("SIGINT", shutdownBrowser);

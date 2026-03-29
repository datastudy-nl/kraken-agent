/**
 * Input security scanning for prompt injection and harmful content.
 * Lightweight pattern-based detection for user-facing text fields
 * (SOUL.md, AGENTS.md, user model, skill content).
 */

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /disregard\s+(all\s+)?prior/i,
  /forget\s+(everything|all)\s+(you\s+)?know/i,
  /you\s+are\s+now\s+(a\s+)?new\s+ai/i,
  /system\s*:\s*you\s+are/i,
  /\bDAN\b.*\bjailbreak\b/i,
  /pretend\s+you\s+(are|have)\s+no\s+(restrictions|rules|limits)/i,
  /bypass\s+(your\s+)?(safety|content|security)\s+(filter|guard|check)/i,
  /output\s+(your|the)\s+(system|initial)\s+prompt/i,
  /reveal\s+(your|the)\s+(system|hidden)\s+(prompt|instructions)/i,
];

export interface ScanResult {
  safe: boolean;
  reason?: string;
}

/**
 * Scan text for prompt injection patterns.
 * Returns `{ safe: true }` if no issues found,
 * or `{ safe: false, reason }` describing the match.
 */
export function scanForInjection(text: string): ScanResult {
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      return {
        safe: false,
        reason: `Content matches prompt injection pattern: ${pattern.source}`,
      };
    }
  }
  return { safe: true };
}

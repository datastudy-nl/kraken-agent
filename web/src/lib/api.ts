const API_BASE = "";

function getApiKey(): string {
  return localStorage.getItem("kraken_api_key") || "";
}

export function setApiKey(key: string) {
  localStorage.setItem("kraken_api_key", key);
}

export function hasApiKey(): boolean {
  return !!localStorage.getItem("kraken_api_key");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const key = getApiKey();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(key ? { Authorization: `Bearer ${key}` } : {}),
    ...(options.headers as Record<string, string> || {}),
  };

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

// SSE streaming for chat completions
export interface StreamChunk {
  type: "content" | "status";
  content?: string;
  status?: string;
  detail?: string;
}

export async function* streamChat(
  messages: Array<{ role: string; content: string }>,
  model: string,
  sessionKey?: string,
): AsyncGenerator<StreamChunk> {
  const key = getApiKey();
  const res = await fetch(`${API_BASE}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      ...(sessionKey ? { session_key: sessionKey } : {}),
    }),
  });

  if (!res.ok) {
    throw new Error(`Chat API ${res.status}: ${await res.text()}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;
      const data = trimmed.slice(6);
      if (data === "[DONE]") return;

      try {
        const parsed = JSON.parse(data);
        if (parsed.kraken_status) {
          yield { type: "status", status: parsed.kraken_status.status, detail: parsed.kraken_status.detail };
        } else {
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) yield { type: "content", content };
        }
      } catch {
        // skip malformed chunks
      }
    }
  }
}

// Health check
export async function checkHealth(): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/health/ready`);
  return res.json();
}

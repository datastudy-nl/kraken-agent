import { useState, useEffect } from "react";
import { hasApiKey, setApiKey } from "@/lib/api";

export function ApiKeyGate({ children }: { children: React.ReactNode }) {
  const [hasKey, setHasKey] = useState(hasApiKey());
  const [input, setInput] = useState("");

  useEffect(() => {
    setHasKey(hasApiKey());
  }, []);

  if (hasKey) return <>{children}</>;

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="w-full max-w-sm p-6 space-y-4">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-primary mx-auto flex items-center justify-center text-primary-foreground font-bold text-lg">
            K
          </div>
          <h1 className="text-xl font-semibold">Kraken Agent</h1>
          <p className="text-sm text-muted-foreground">Enter your API key to continue</p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim()) {
              setApiKey(input.trim());
              setHasKey(true);
            }
          }}
          className="space-y-3"
        >
          <input
            type="password"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="API Key"
            autoFocus
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="submit"
            className="w-full px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Connect
          </button>
          <button
            type="button"
            onClick={() => { setApiKey(""); setHasKey(true); }}
            className="w-full px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip (no auth)
          </button>
        </form>
      </div>
    </div>
  );
}

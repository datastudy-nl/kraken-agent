import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Plus, Loader2, ChevronDown, Check, X } from "lucide-react";
import { streamChat, api } from "@/lib/api";
import { useSessions, useCreateSession } from "@/hooks/useSessions";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
}

export function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [timeline, setTimeline] = useState<Array<{ label: string; state: "running" | "done" | "error" }>>([]);
  const [sessionKey, setSessionKey] = useState<string>("");
  const [model, setModel] = useState("kraken-omni-2.7");
  const [models, setModels] = useState<Array<{ id: string }>>([]);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const newSessionKeys = useRef(new Set<string>());

  const { data: sessionsData } = useSessions(10);
  const createSession = useCreateSession();

  // Load models on mount
  useEffect(() => {
    api.get<{ data: Array<{ id: string }> }>("/v1/models")
      .then((d) => setModels(d.data ?? []))
      .catch(() => {});
  }, []);

  // Load existing session messages (skip for freshly created sessions)
  useEffect(() => {
    if (!sessionKey) return;
    localStorage.setItem("kraken_chat_session", sessionKey);
    if (newSessionKeys.current.has(sessionKey)) {
      newSessionKeys.current.delete(sessionKey);
      return;
    }
    api.get<{ messages: ChatMessage[] }>(`/v1/sessions/by-key/${sessionKey}`)
      .then((session) => {
        if (session?.messages) {
          setMessages(session.messages.filter((m) => m?.role !== "system"));
        } else {
          setMessages([]);
        }
      })
      .catch(() => setMessages([]));
  }, [sessionKey]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (!showScrollBtn) scrollToBottom();
  }, [messages, scrollToBottom, showScrollBtn]);

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    setShowScrollBtn(!atBottom);
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || streaming) return;

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: trimmed };
    const assistantMsg: ChatMessage = { id: crypto.randomUUID(), role: "assistant", content: "" };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setStreaming(true);

    // auto-create session key if none
    let key = sessionKey;
    if (!key) {
      key = `web-${Date.now()}`;
      newSessionKeys.current.add(key);
      setSessionKey(key);
    }

    try {
      const allMessages = [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: trimmed },
      ];

      for await (const chunk of streamChat(allMessages, model, key)) {
        if (chunk.type === "status") {
          const status = chunk.status ?? "";
          const label = chunk.detail ?? status;
          if (status === "tool_call") {
            // Mark previous running step as done, add new running step
            setTimeline((prev) => [
              ...prev.map((s) => s.state === "running" ? { ...s, state: "done" as const } : s),
              { label, state: "running" },
            ]);
          } else if (status === "tool_result") {
            // Mark the matching running step as done
            setTimeline((prev) => prev.map((s) =>
              s.state === "running" && s.label === label ? { ...s, state: "done" } : s
            ));
          } else if (status === "tool_error") {
            // Mark the matching running step as error
            setTimeline((prev) => prev.map((s) =>
              s.state === "running" && s.label === label ? { ...s, state: "error" } : s
            ));
          } else {
            // Pre-stream steps (searching_memory, compacting, generating)
            setTimeline((prev) => [
              ...prev.map((s) => s.state === "running" ? { ...s, state: "done" as const } : s),
              { label, state: "running" },
            ]);
          }
        } else if (chunk.type === "content" && chunk.content) {
          // First content chunk: mark all running steps as done
          setTimeline((prev) => {
            const hasRunning = prev.some((s) => s.state === "running");
            return hasRunning ? prev.map((s) => s.state === "running" ? { ...s, state: "done" as const } : s) : prev;
          });
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last?.role === "assistant") {
              copy[copy.length - 1] = { ...last, content: last.content + chunk.content };
            }
            return copy;
          });
        }
      }
    } catch (err) {
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last?.role === "assistant" && !last.content) {
          copy[copy.length - 1] = { ...last, content: `Error: ${err instanceof Error ? err.message : "Unknown error"}` };
        }
        return copy;
      });
    } finally {
      setStreaming(false);
      setTimeline([]);
    }
  };

  const handleNewChat = () => {
    const key = `web-${Date.now()}`;
    newSessionKeys.current.add(key);
    setSessionKey(key);
    setMessages([]);
    createSession.mutate({ session_key: key, name: `Web Chat ${new Date().toLocaleDateString()}` });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 h-14 border-b shrink-0">
        <button
          onClick={handleNewChat}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
        >
          <Plus className="w-3.5 h-3.5" /> New Chat
        </button>

        {/* Session selector */}
        <select
          value={sessionKey}
          onChange={(e) => setSessionKey(e.target.value)}
          className="px-2 py-1.5 rounded-lg border bg-background text-xs max-w-48"
        >
          <option value="">Select session...</option>
          {sessionsData?.sessions.map((s) => (
            <option key={s.id} value={s.session_key || s.id}>
              {s.name || s.session_key || s.id.slice(0, 8)}
            </option>
          ))}
        </select>

        {/* Model selector */}
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="px-2 py-1.5 rounded-lg border bg-background text-xs ml-auto"
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>{m.id}</option>
          ))}
          {models.length === 0 && <option>kraken-omni-2.7</option>}
        </select>
      </div>

      {/* Messages area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto px-4 py-6"
      >
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-xl bg-muted mx-auto flex items-center justify-center text-2xl">🐙</div>
              <p>Start a conversation with Kraken</p>
            </div>
          </div>
        )}

        <div className="max-w-3xl mx-auto space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex",
                msg.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                )}
              >
                {msg.role === "assistant" ? (
                  <div className="prose">
                    {!msg.content && streaming && msg.id === messages[messages.length - 1]?.id ? (
                      <div className="space-y-0">
                        {timeline.length > 0 ? (
                          <div className="flex flex-col">
                            {timeline.map((step, i) => (
                              <div key={i} className="flex items-start gap-2">
                                {/* Vertical line + dot */}
                                <div className="flex flex-col items-center">
                                  {/* Dot */}
                                  <div className={cn(
                                    "w-4 h-4 rounded-full flex items-center justify-center shrink-0",
                                    step.state === "running" ? "bg-primary/20" :
                                    step.state === "error" ? "bg-destructive/20" :
                                    "bg-emerald-500/20"
                                  )}>
                                    {step.state === "running" ? (
                                      <Loader2 className="w-2.5 h-2.5 animate-spin text-primary" />
                                    ) : step.state === "error" ? (
                                      <X className="w-2.5 h-2.5 text-destructive" />
                                    ) : (
                                      <Check className="w-2.5 h-2.5 text-emerald-500" />
                                    )}
                                  </div>
                                  {/* Line to next */}
                                  {i < timeline.length - 1 && <div className="w-px h-3 bg-border" />}
                                </div>
                                <span className={cn(
                                  "text-xs pt-0.5",
                                  step.state === "running" ? "text-foreground" :
                                  step.state === "error" ? "text-destructive" :
                                  "text-muted-foreground"
                                )}>{step.label}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span className="text-xs italic">Thinking...</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    )}
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Scroll to bottom */}
        {showScrollBtn && (
          <button
            onClick={scrollToBottom}
            className="fixed bottom-28 right-8 p-2 rounded-full bg-primary text-primary-foreground shadow-lg hover:opacity-90"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Input area */}
      <div className="border-t p-4 shrink-0">
        {streaming && timeline.length > 0 && messages[messages.length - 1]?.content && (
          <div className="max-w-3xl mx-auto mb-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              {timeline.map((step, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  {i > 0 && <div className="w-3 h-px bg-border" />}
                  <div className={cn(
                    "w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0",
                    step.state === "running" ? "bg-primary/20" :
                    step.state === "error" ? "bg-destructive/20" :
                    "bg-emerald-500/20"
                  )}>
                    {step.state === "running" ? (
                      <Loader2 className="w-2 h-2 animate-spin text-primary" />
                    ) : step.state === "error" ? (
                      <X className="w-2 h-2 text-destructive" />
                    ) : (
                      <Check className="w-2 h-2 text-emerald-500" />
                    )}
                  </div>
                  <span className={cn(
                    "text-[10px]",
                    step.state === "running" ? "text-foreground" :
                    step.state === "error" ? "text-destructive" :
                    "text-muted-foreground"
                  )}>{step.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="max-w-3xl mx-auto flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Kraken..."
            rows={1}
            className="flex-1 resize-none px-4 py-2.5 rounded-xl border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring max-h-32"
            style={{ minHeight: "42px" }}
          />
          <button
            onClick={handleSend}
            disabled={streaming || !input.trim()}
            className={cn(
              "p-2.5 rounded-xl bg-primary text-primary-foreground transition-opacity shrink-0",
              streaming || !input.trim() ? "opacity-40" : "hover:opacity-90"
            )}
          >
            {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

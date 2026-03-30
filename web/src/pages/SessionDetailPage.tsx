import { useParams, Link } from "react-router";
import { ArrowLeft, Loader2, Archive } from "lucide-react";
import { useSession, useCompactSession } from "@/hooks/useSessions";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

export function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session, isLoading } = useSession(id);
  const compact = useCompactSession();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session) {
    return <div className="p-6 text-muted-foreground">Session not found</div>;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 h-14 border-b shrink-0">
        <Link to="/sessions" className="p-1.5 rounded-lg hover:bg-muted transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">
            {session.name || session.session_key || session.id.slice(0, 12)}
          </div>
          <div className="text-xs text-muted-foreground">
            Created {new Date(session.created_at).toLocaleString()}
          </div>
        </div>
        <Link
          to={`/?session=${session.session_key || session.id}`}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:opacity-90"
        >
          Open in Chat
        </Link>
        <button
          onClick={() => id && compact.mutate(id)}
          disabled={compact.isPending}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border hover:bg-muted transition-colors flex items-center gap-1"
        >
          <Archive className="w-3 h-3" />
          Compact
        </button>
      </div>

      {/* Metadata */}
      <div className="px-4 py-3 border-b bg-muted/30 text-xs text-muted-foreground flex flex-wrap gap-4">
        {session.session_key && <span><strong>Key:</strong> {session.session_key}</span>}
        <span><strong>Updated:</strong> {new Date(session.updated_at).toLocaleString()}</span>
        {session.last_active_at && <span><strong>Last Active:</strong> {new Date(session.last_active_at).toLocaleString()}</span>}
        {session.personality && <span><strong>Personality:</strong> {session.personality.slice(0, 60)}...</span>}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto px-4 py-4">
        <div className="max-w-3xl mx-auto space-y-3">
          {session.messages?.filter(m => m.role !== "system").map((msg) => (
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
                    : msg.role === "tool"
                    ? "bg-muted/60 text-muted-foreground font-mono text-xs"
                    : "bg-muted text-foreground"
                )}
              >
                {msg.role === "assistant" ? (
                  <div className="prose">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
                <div className="text-[10px] opacity-50 mt-1">
                  {new Date(msg.created_at).toLocaleTimeString()}
                  {msg.model && ` · ${msg.model}`}
                </div>
              </div>
            </div>
          ))}

          {(!session.messages || session.messages.length === 0) && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No messages in this session
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

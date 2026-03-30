import { useState } from "react";
import { Link } from "react-router";
import { Plus, Trash2, MessageSquare, Clock } from "lucide-react";
import { useSessions, useCreateSession, useDeleteSession } from "@/hooks/useSessions";
import { cn } from "@/lib/utils";

export function SessionsPage() {
  const [page, setPage] = useState(0);
  const limit = 20;
  const { data, isLoading } = useSessions(limit, page * limit);
  const createSession = useCreateSession();
  const deleteSession = useDeleteSession();
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDelete = (id: string) => {
    if (!confirm("Delete this session and its sandbox?")) return;
    setDeleting(id);
    deleteSession.mutate(id, { onSettled: () => setDeleting(null) });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Sessions</h1>
        <button
          onClick={() => createSession.mutate({ name: `Session ${new Date().toLocaleDateString()}` })}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90"
        >
          <Plus className="w-4 h-4" /> New Session
        </button>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading...</div>
      ) : (
        <div className="space-y-2">
          {data?.sessions.map((session) => (
            <div
              key={session.id}
              className="flex items-center gap-4 p-4 rounded-xl border hover:bg-muted/50 transition-colors group"
            >
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <MessageSquare className="w-5 h-5 text-muted-foreground" />
              </div>

              <Link to={`/sessions/${session.id}`} className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">
                  {session.name || session.session_key || session.id.slice(0, 12)}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(session.created_at).toLocaleDateString()}
                  </span>
                  {session.session_key && (
                    <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                      {session.session_key}
                    </span>
                  )}
                  {session.archived && (
                    <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">archived</span>
                  )}
                </div>
              </Link>

              <button
                onClick={() => handleDelete(session.id)}
                disabled={deleting === session.id}
                className={cn(
                  "p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all",
                  deleting === session.id && "opacity-50"
                )}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}

          {data?.sessions.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">No sessions yet</div>
          )}

          {/* Pagination */}
          {data && data.total > limit && (
            <div className="flex justify-center gap-2 pt-4">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="px-3 py-1.5 rounded-lg border text-sm disabled:opacity-40"
              >
                Previous
              </button>
              <span className="px-3 py-1.5 text-sm text-muted-foreground">
                Page {page + 1} of {Math.ceil(data.total / limit)}
              </span>
              <button
                onClick={() => setPage(page + 1)}
                disabled={(page + 1) * limit >= data.total}
                className="px-3 py-1.5 rounded-lg border text-sm disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

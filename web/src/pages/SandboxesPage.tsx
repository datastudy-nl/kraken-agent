import { Link } from "react-router";
import { Container, Loader2, HardDrive } from "lucide-react";
import { useSandboxes } from "@/hooks/useSandboxes";

export function SandboxesPage() {
  const { data, isLoading } = useSandboxes();

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Sandboxes</h1>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading...
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data?.sandboxes.map((sandbox) => (
            <Link
              key={sandbox.sessionId}
              to={`/sandboxes/${sandbox.sessionId}`}
              className="p-4 rounded-xl border hover:bg-muted/50 transition-colors group"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                  <Container className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <div className="font-medium text-sm font-mono">
                    {sandbox.sessionId.slice(0, 12)}...
                  </div>
                  <div className="flex items-center gap-1 text-xs">
                    <span className={`w-1.5 h-1.5 rounded-full ${sandbox.status === "running" ? "bg-green-500" : "bg-yellow-500"}`} />
                    <span className="text-muted-foreground">{sandbox.status}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <HardDrive className="w-3 h-3" />
                  <span>{sandbox.memoryLimitMB}MB memory limit</span>
                </div>
                <div>Image: {sandbox.image}</div>
                <div>Created: {new Date(sandbox.created).toLocaleString()}</div>
                {sandbox.ports.length > 0 && (
                  <div>Ports: {sandbox.ports.map((p) => `${p.containerPort}→${p.hostPort}`).join(", ")}</div>
                )}
              </div>
            </Link>
          ))}

          {data?.sandboxes.length === 0 && (
            <div className="col-span-full text-center py-16 text-muted-foreground text-sm">
              No running sandboxes
            </div>
          )}
        </div>
      )}
    </div>
  );
}

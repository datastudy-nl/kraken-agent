import { useState } from "react";
import { useParams, Link } from "react-router";
import { ArrowLeft, Folder, File, Loader2, RefreshCw } from "lucide-react";
import { useSandbox, useWorkspaceFiles, useWorkspaceFile, useSandboxProcesses, useSandboxPorts } from "@/hooks/useSandboxes";
import { cn } from "@/lib/utils";

export function SandboxDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { data: sandbox, isLoading } = useSandbox(sessionId);
  const [tab, setTab] = useState<"files" | "processes" | "ports">("files");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 h-14 border-b shrink-0">
        <Link to="/sandboxes" className="p-1.5 rounded-lg hover:bg-muted transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm font-mono">{sessionId?.slice(0, 16)}...</div>
          <div className="text-xs text-muted-foreground">
            {sandbox ? `${sandbox.status} · ${sandbox.image}` : "Not found"}
          </div>
        </div>

        {/* Sub-tabs */}
        {(["files", "processes", "ports"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            )}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {tab === "files" && sessionId && <FileBrowser sessionId={sessionId} />}
        {tab === "processes" && sessionId && <ProcessList sessionId={sessionId} />}
        {tab === "ports" && sessionId && <PortList sessionId={sessionId} />}
      </div>
    </div>
  );
}

function FileBrowser({ sessionId }: { sessionId: string }) {
  const [currentDir, setCurrentDir] = useState("");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const { data, isLoading, refetch } = useWorkspaceFiles(sessionId, currentDir);
  const { data: fileData } = useWorkspaceFile(sessionId, selectedFile ?? undefined);

  const breadcrumbs = currentDir ? currentDir.split("/").filter(Boolean) : [];

  return (
    <div className="flex gap-4 h-full">
      {/* File tree */}
      <div className="w-72 shrink-0 border rounded-xl overflow-auto">
        <div className="flex items-center justify-between p-2 border-b">
          <div className="flex items-center gap-1 text-xs">
            <button onClick={() => { setCurrentDir(""); setSelectedFile(null); }} className="text-muted-foreground hover:text-foreground px-1">root</button>
            {breadcrumbs.map((part, i) => (
              <span key={i} className="flex items-center gap-1">
                <span className="text-muted-foreground">/</span>
                <button
                  onClick={() => setCurrentDir(breadcrumbs.slice(0, i + 1).join("/"))}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {part}
                </button>
              </span>
            ))}
          </div>
          <button onClick={() => refetch()} className="p-1 rounded hover:bg-muted">
            <RefreshCw className="w-3 h-3 text-muted-foreground" />
          </button>
        </div>

        {isLoading ? (
          <div className="p-4 text-xs text-muted-foreground">Loading...</div>
        ) : (
          <div className="p-1">
            {data?.files.map((file) => (
              <button
                key={file.name}
                onClick={() => {
                  if (file.type === "directory") {
                    setCurrentDir(currentDir ? `${currentDir}/${file.name}` : file.name);
                    setSelectedFile(null);
                  } else {
                    const path = currentDir ? `${currentDir}/${file.name}` : file.name;
                    setSelectedFile(path);
                  }
                }}
                className={cn(
                  "flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-xs text-left hover:bg-muted transition-colors",
                  selectedFile === (currentDir ? `${currentDir}/${file.name}` : file.name) && "bg-muted"
                )}
              >
                {file.type === "directory" ? (
                  <Folder className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                ) : (
                  <File className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                )}
                <span className="truncate">{file.name}</span>
                {file.type === "file" && (
                  <span className="text-muted-foreground ml-auto shrink-0">{formatSize(file.size)}</span>
                )}
              </button>
            ))}
            {data?.files.length === 0 && (
              <div className="text-center py-8 text-xs text-muted-foreground">Empty directory</div>
            )}
          </div>
        )}
      </div>

      {/* File viewer */}
      <div className="flex-1 border rounded-xl overflow-auto">
        {selectedFile ? (
          <div>
            <div className="flex items-center gap-2 px-3 py-2 border-b text-xs text-muted-foreground">
              <File className="w-3.5 h-3.5" />
              <span className="font-mono">{selectedFile}</span>
              {fileData && <span className="ml-auto">{formatSize(fileData.size)}</span>}
            </div>
            <pre className="p-4 text-xs font-mono whitespace-pre-wrap overflow-x-auto">
              {fileData?.content || "Loading..."}
            </pre>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Select a file to view
          </div>
        )}
      </div>
    </div>
  );
}

function ProcessList({ sessionId }: { sessionId: string }) {
  const { data, isLoading, refetch } = useSandboxProcesses(sessionId);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium">Processes</h3>
        <button onClick={() => refetch()} className="p-1.5 rounded-lg hover:bg-muted">
          <RefreshCw className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading...</div>
      ) : (
        <pre className="p-4 rounded-xl border bg-muted/30 text-xs font-mono whitespace-pre overflow-x-auto">
          {data?.processes || "No process data"}
        </pre>
      )}
    </div>
  );
}

function PortList({ sessionId }: { sessionId: string }) {
  const { data, isLoading } = useSandboxPorts(sessionId);

  return (
    <div className="max-w-4xl mx-auto">
      <h3 className="text-sm font-medium mb-4">Port Forwards</h3>
      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading...</div>
      ) : (
        <div className="space-y-2">
          {data?.ports.map((p) => (
            <div key={p.containerPort} className="flex items-center justify-between p-3 rounded-xl border text-sm">
              <span>Container :{p.containerPort}</span>
              <span className="text-muted-foreground">→</span>
              <span>Host :{p.hostPort}</span>
            </div>
          ))}
          {(!data?.ports || data.ports.length === 0) && (
            <div className="text-center py-8 text-muted-foreground text-sm">No port forwards</div>
          )}
        </div>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

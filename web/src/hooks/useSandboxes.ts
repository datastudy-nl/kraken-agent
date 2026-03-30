import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface SandboxInfo {
  sessionId: string;
  containerId: string;
  status: string;
  created: string;
  image: string;
  memoryLimitMB: number;
  ports: Array<{ containerPort: number; hostPort: number }>;
}

interface WorkspaceFile {
  name: string;
  type: "file" | "directory";
  size: number;
}

export function useSandboxes() {
  return useQuery({
    queryKey: ["sandboxes"],
    queryFn: () => api.get<{ sandboxes: SandboxInfo[] }>("/v1/sandboxes"),
  });
}

export function useSandbox(sessionId: string | undefined) {
  return useQuery({
    queryKey: ["sandbox", sessionId],
    queryFn: () => api.get<SandboxInfo>(`/v1/sandboxes/${sessionId}`),
    enabled: !!sessionId,
  });
}

export function useWorkspaceFiles(sessionId: string | undefined, dir = "") {
  const params = dir ? `?dir=${encodeURIComponent(dir)}` : "";
  return useQuery({
    queryKey: ["workspace-files", sessionId, dir],
    queryFn: () => api.get<{ session_id: string; directory: string; files: WorkspaceFile[] }>(
      `/v1/sessions/${sessionId}/workspace${params}`
    ),
    enabled: !!sessionId,
  });
}

export function useWorkspaceFile(sessionId: string | undefined, filePath: string | undefined) {
  return useQuery({
    queryKey: ["workspace-file", sessionId, filePath],
    queryFn: () => api.get<{ content: string; size: number }>(
      `/v1/sessions/${sessionId}/workspace/${filePath}`
    ),
    enabled: !!sessionId && !!filePath,
  });
}

export function useSandboxProcesses(sessionId: string | undefined) {
  return useQuery({
    queryKey: ["sandbox-processes", sessionId],
    queryFn: () => api.get<{ processes: string }>(`/v1/sandboxes/${sessionId}/processes`),
    enabled: !!sessionId,
  });
}

export function useSandboxPorts(sessionId: string | undefined) {
  return useQuery({
    queryKey: ["sandbox-ports", sessionId],
    queryFn: () => api.get<{ ports: Array<{ containerPort: number; hostPort: number }> }>(
      `/v1/sandboxes/${sessionId}/ports`
    ),
    enabled: !!sessionId,
  });
}

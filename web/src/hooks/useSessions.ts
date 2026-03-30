import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface Session {
  id: string;
  session_key: string | null;
  name: string | null;
  personality: string | null;
  created_at: string;
  updated_at: string;
  last_active_at: string | null;
  archived: boolean;
  metadata: Record<string, unknown>;
}

interface Message {
  id: string;
  session_id: string;
  role: string;
  content: string;
  tool_calls: unknown[];
  tool_results: unknown[];
  model: string | null;
  token_count: number | null;
  created_at: string;
  metadata: Record<string, unknown>;
}

export function useSessions(limit = 20, offset = 0) {
  return useQuery({
    queryKey: ["sessions", limit, offset],
    queryFn: () => api.get<{ sessions: Session[]; total: number }>(`/v1/sessions?limit=${limit}&offset=${offset}`),
  });
}

export function useSession(id: string | undefined) {
  return useQuery({
    queryKey: ["session", id],
    queryFn: () => api.get<Session & { messages: Message[] }>(`/v1/sessions/${id}`),
    enabled: !!id,
  });
}

export function useSessionMessages(id: string | undefined, limit = 50, offset = 0) {
  return useQuery({
    queryKey: ["session-messages", id, limit, offset],
    queryFn: () => api.get<{ messages: Message[]; total: number }>(`/v1/sessions/${id}/messages?limit=${limit}&offset=${offset}`),
    enabled: !!id,
  });
}

export function useCreateSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name?: string; session_key?: string }) => api.post<Session>("/v1/sessions", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
  });
}

export function useDeleteSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/v1/sessions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
  });
}

export function useCompactSession() {
  return useMutation({
    mutationFn: (id: string) => api.post(`/v1/sessions/${id}/compact`, {}),
  });
}

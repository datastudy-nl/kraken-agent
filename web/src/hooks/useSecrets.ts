import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface Secret {
  id: string;
  name: string;
  description: string | null;
  allowed_tools: string[] | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useSecrets() {
  return useQuery({
    queryKey: ["secrets"],
    queryFn: () => api.get<{ secrets: Secret[] }>("/v1/secrets"),
  });
}

export function useCreateSecret() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; value: string; description?: string; allowed_tools?: string[] }) =>
      api.post("/v1/secrets", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["secrets"] }),
  });
}

export function useUpdateSecret() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; value?: string; description?: string; allowed_tools?: string[] }) =>
      api.patch(`/v1/secrets/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["secrets"] }),
  });
}

export function useDeleteSecret() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/v1/secrets/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["secrets"] }),
  });
}

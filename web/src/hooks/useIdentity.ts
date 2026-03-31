import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface IdentityEntry {
  content: string;
  updated_at: string;
}

interface IdentityLink {
  id: string;
  canonical_user_id: string;
  provider: string;
  provider_user_id: string;
  display_name: string | null;
}

export function useSoul() {
  return useQuery({
    queryKey: ["identity", "soul"],
    queryFn: () => api.get<IdentityEntry>("/v1/identity/soul"),
  });
}

export function useUpdateSoul() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) =>
      api.put<IdentityEntry>("/v1/identity/soul", { content }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["identity", "soul"] }),
  });
}

export function useUserModel() {
  return useQuery({
    queryKey: ["identity", "user-model"],
    queryFn: () => api.get<IdentityEntry>("/v1/identity/user-model"),
  });
}

export function useAgentsMd() {
  return useQuery({
    queryKey: ["identity", "agents-md"],
    queryFn: () => api.get<IdentityEntry>("/v1/identity/agents-md"),
  });
}

export function useUpdateAgentsMd() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) =>
      api.put<IdentityEntry>("/v1/identity/agents-md", { content }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["identity", "agents-md"] }),
  });
}

export function useIdentityLinks() {
  return useQuery({
    queryKey: ["identity", "links"],
    queryFn: () => api.get<{ links: IdentityLink[] }>("/v1/identity/links"),
  });
}

export function useCreateIdentityLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      canonical_user_id: string;
      provider: string;
      provider_user_id: string;
      display_name?: string;
    }) => api.post("/v1/identity/links", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["identity", "links"] }),
  });
}

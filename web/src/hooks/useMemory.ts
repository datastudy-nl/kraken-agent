import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface Entity {
  id: string;
  name: string;
  type: string;
  properties: Record<string, unknown>;
}

interface Community {
  name: string;
  level: number;
  summary: string;
  entity_ids: string[];
}

interface Skill {
  id: string;
  name: string;
  content: string;
  tags: string[];
  version: number;
  created_at: string;
  updated_at: string;
}

interface Tool {
  id: string;
  name: string;
  description: string;
  instructions: string;
  input_schema: Record<string, unknown>;
  tags: string[];
  created_at: string;
  updated_at: string;
}

// Entities
export function useEntities(search = "", type = "", limit = 50) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (type) params.set("type", type);
  params.set("limit", String(limit));
  return useQuery({
    queryKey: ["entities", search, type, limit],
    queryFn: () => api.get<{ entities: Entity[] }>(`/v1/memory/entities?${params}`),
  });
}

export function useCreateEntity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; type: string; properties?: Record<string, unknown> }) =>
      api.post("/v1/memory/entities", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["entities"] }),
  });
}

export function useDeleteEntity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/v1/memory/entities/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["entities"] }),
  });
}

// Graph
export interface GraphNode {
  id: string;
  name: string;
  type: string;
  properties: Record<string, unknown>;
  created_at: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  properties: Record<string, unknown>;
  created_at: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  depth: number;
  center: string | null;
}

export function useGraph(center: string, depth = 2) {
  return useQuery({
    queryKey: ["graph", center, depth],
    queryFn: () => api.get<GraphData>(`/v1/memory/graph?center=${encodeURIComponent(center)}&depth=${depth}`),
    enabled: !!center,
  });
}

// Communities
export function useCommunities(level?: number) {
  const params = level !== undefined ? `?level=${level}` : "";
  return useQuery({
    queryKey: ["communities", level],
    queryFn: () => api.get<{ communities: Community[] }>(`/v1/memory/communities${params}`),
  });
}

// Memory query
export function useMemoryQuery() {
  return useMutation({
    mutationFn: (data: { query: string; mode: string; limit?: number }) =>
      api.post<{ entities: Entity[]; communities: Community[]; episodes: unknown[] }>("/v1/memory/query", data),
  });
}

// Skills
export function useSkills(search = "") {
  const params = search ? `?search=${encodeURIComponent(search)}` : "";
  return useQuery({
    queryKey: ["skills", search],
    queryFn: () => api.get<{ skills: Skill[] }>(`/v1/skills${params}`),
  });
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; content: string; tags?: string[] }) =>
      api.post("/v1/skills", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; content?: string; tags?: string[] }) =>
      api.patch(`/v1/skills/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/v1/skills/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}

// Tools
export function useTools(search = "") {
  const params = search ? `?search=${encodeURIComponent(search)}` : "";
  return useQuery({
    queryKey: ["tools", search],
    queryFn: () => api.get<{ tools: Tool[] }>(`/v1/tools${params}`),
  });
}

export function useCreateTool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description: string; instructions: string; tags?: string[] }) =>
      api.post("/v1/tools", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tools"] }),
  });
}

export function useDeleteTool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/v1/tools/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tools"] }),
  });
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface Schedule {
  id: string;
  name: string;
  description: string | null;
  cronExpression: string;
  taskPrompt: string;
  enabled: boolean;
  originSessionId: string | null;
  maxRuns: number | null;
  runCount: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export function useSchedules() {
  return useQuery({
    queryKey: ["schedules"],
    queryFn: () => api.get<{ schedules: Schedule[]; total: number }>("/v1/schedules"),
  });
}

export function useCreateSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      cron_expression: string;
      task_prompt: string;
      description?: string;
      origin_session_id?: string;
      max_runs?: number;
    }) => api.post("/v1/schedules", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedules"] }),
  });
}

export function useUpdateSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string;
      name?: string;
      description?: string;
      cron_expression?: string;
      task_prompt?: string;
      enabled?: boolean;
      max_runs?: number | null;
    }) => api.patch(`/v1/schedules/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedules"] }),
  });
}

export function useDeleteSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/v1/schedules/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedules"] }),
  });
}

import { useState } from "react";
import {
  Clock,
  Plus,
  Trash2,
  Pencil,
  Loader2,
  Play,
  Pause,
  CalendarClock,
  Hash,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useSchedules,
  useCreateSchedule,
  useUpdateSchedule,
  useDeleteSchedule,
  type Schedule,
} from "@/hooks/useSchedules";

export function SchedulesPage() {
  const { data, isLoading } = useSchedules();
  const createSchedule = useCreateSchedule();
  const updateSchedule = useUpdateSchedule();
  const deleteSchedule = useDeleteSchedule();
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    cron_expression: "",
    task_prompt: "",
    max_runs: "",
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createSchedule.mutate(
      {
        name: form.name,
        cron_expression: form.cron_expression,
        task_prompt: form.task_prompt,
        description: form.description || undefined,
        max_runs: form.max_runs ? parseInt(form.max_runs, 10) : undefined,
      },
      {
        onSuccess: () => {
          setShowCreate(false);
          resetForm();
        },
      }
    );
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editId) return;
    updateSchedule.mutate(
      {
        id: editId,
        name: form.name || undefined,
        description: form.description || undefined,
        cron_expression: form.cron_expression || undefined,
        task_prompt: form.task_prompt || undefined,
        max_runs: form.max_runs ? parseInt(form.max_runs, 10) : undefined,
      },
      {
        onSuccess: () => {
          setEditId(null);
          resetForm();
        },
      }
    );
  };

  const handleToggle = (schedule: Schedule) => {
    updateSchedule.mutate({ id: schedule.id, enabled: !schedule.enabled });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this scheduled task permanently?")) return;
    deleteSchedule.mutate(id);
  };

  const resetForm = () =>
    setForm({ name: "", description: "", cron_expression: "", task_prompt: "", max_runs: "" });

  const startEdit = (s: Schedule) => {
    setEditId(s.id);
    setShowCreate(false);
    setForm({
      name: s.name,
      description: s.description || "",
      cron_expression: s.cronExpression,
      task_prompt: s.taskPrompt,
      max_runs: s.maxRuns?.toString() || "",
    });
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Scheduled Tasks</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cron-based tasks that run automatically. Each execution starts a new agent conversation.
          </p>
        </div>
        <button
          onClick={() => {
            setShowCreate(!showCreate);
            setEditId(null);
            resetForm();
          }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90"
        >
          <Plus className="w-4 h-4" /> New Schedule
        </button>
      </div>

      {/* Create / Edit form */}
      {(showCreate || editId) && (
        <form
          onSubmit={editId ? handleUpdate : handleCreate}
          className="mb-6 p-4 rounded-xl border bg-muted/30 space-y-3"
        >
          <h3 className="text-sm font-medium">{editId ? "Edit Schedule" : "New Schedule"}</h3>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Schedule name"
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            required={!editId}
          />
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Description (optional)"
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              value={form.cron_expression}
              onChange={(e) => setForm({ ...form, cron_expression: e.target.value })}
              placeholder="Cron expression (e.g. 0 9 * * *)"
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              required={!editId}
            />
            <input
              value={form.max_runs}
              onChange={(e) => setForm({ ...form, max_runs: e.target.value })}
              placeholder="Max runs (optional)"
              type="number"
              min="1"
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <textarea
            value={form.task_prompt}
            onChange={(e) => setForm({ ...form, task_prompt: e.target.value })}
            placeholder="Task prompt — what should the agent do on each run?"
            className="w-full h-32 px-3 py-2 rounded-lg border bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            required={!editId}
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={createSchedule.isPending || updateSchedule.isPending}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1"
            >
              {(createSchedule.isPending || updateSchedule.isPending) && (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              )}
              {editId ? "Update" : "Create"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreate(false);
                setEditId(null);
                resetForm();
              }}
              className="px-4 py-2 rounded-lg border text-sm hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Schedules list */}
      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading...</div>
      ) : (
        <div className="space-y-2">
          {data?.schedules.map((schedule) => (
            <div
              key={schedule.id}
              className="flex items-center gap-4 p-4 rounded-xl border hover:bg-muted/50 transition-colors group"
            >
              <div
                className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                  schedule.enabled ? "bg-green-500/10" : "bg-muted"
                )}
              >
                <Clock
                  className={cn(
                    "w-5 h-5",
                    schedule.enabled ? "text-green-500" : "text-muted-foreground"
                  )}
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{schedule.name}</span>
                  <span
                    className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wider",
                      schedule.enabled
                        ? "bg-green-500/10 text-green-600 dark:text-green-400"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {schedule.enabled ? "Active" : "Paused"}
                  </span>
                </div>
                {schedule.description && (
                  <div className="text-xs text-muted-foreground mt-0.5">{schedule.description}</div>
                )}
                <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1.5 flex-wrap">
                  <span className="flex items-center gap-1 font-mono">
                    <CalendarClock className="w-3 h-3" />
                    {schedule.cronExpression}
                  </span>
                  <span className="flex items-center gap-1">
                    <Hash className="w-3 h-3" />
                    {schedule.runCount} runs
                    {schedule.maxRuns && ` / ${schedule.maxRuns} max`}
                  </span>
                  {schedule.lastRunAt && (
                    <span className="flex items-center gap-1">
                      <RotateCcw className="w-3 h-3" />
                      Last: {new Date(schedule.lastRunAt).toLocaleString()}
                    </span>
                  )}
                  {schedule.nextRunAt && (
                    <span>Next: {new Date(schedule.nextRunAt).toLocaleString()}</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-1 line-clamp-1 italic">
                  "{schedule.taskPrompt}"
                </div>
              </div>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                <button
                  onClick={() => handleToggle(schedule)}
                  className="p-2 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
                  title={schedule.enabled ? "Pause" : "Resume"}
                >
                  {schedule.enabled ? (
                    <Pause className="w-4 h-4" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                </button>
                <button
                  onClick={() => startEdit(schedule)}
                  className="p-2 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(schedule.id)}
                  className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}

          {data?.schedules.length === 0 && (
            <div className="text-center py-16 text-muted-foreground text-sm">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>No scheduled tasks</p>
              <p className="text-xs mt-1">
                Create recurring tasks with cron expressions to automate agent workflows.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

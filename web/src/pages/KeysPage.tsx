import { useState } from "react";
import { KeyRound, Plus, Trash2, Pencil, Shield, Clock, Loader2 } from "lucide-react";
import { useSecrets, useCreateSecret, useUpdateSecret, useDeleteSecret } from "@/hooks/useSecrets";

export function KeysPage() {
  const { data, isLoading } = useSecrets();
  const createSecret = useCreateSecret();
  const updateSecret = useUpdateSecret();
  const deleteSecret = useDeleteSecret();
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", value: "", description: "", allowed_tools: "" });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const tools = form.allowed_tools.split(",").map(t => t.trim()).filter(Boolean);
    createSecret.mutate(
      { name: form.name, value: form.value, description: form.description || undefined, allowed_tools: tools.length > 0 ? tools : undefined },
      { onSuccess: () => { setShowCreate(false); setForm({ name: "", value: "", description: "", allowed_tools: "" }); } }
    );
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editId) return;
    const tools = form.allowed_tools.split(",").map(t => t.trim()).filter(Boolean);
    updateSecret.mutate(
      { id: editId, value: form.value || undefined, description: form.description || undefined, allowed_tools: tools.length > 0 ? tools : undefined },
      { onSuccess: () => { setEditId(null); setForm({ name: "", value: "", description: "", allowed_tools: "" }); } }
    );
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this secret permanently?")) return;
    deleteSecret.mutate(id);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Private Key Store</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Securely store API keys and passwords for use by the agent. Values are encrypted at rest and never returned to the frontend.
          </p>
        </div>
        <button
          onClick={() => { setShowCreate(!showCreate); setEditId(null); }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90"
        >
          <Plus className="w-4 h-4" /> Add Secret
        </button>
      </div>

      {/* Create / Edit form */}
      {(showCreate || editId) && (
        <form onSubmit={editId ? handleUpdate : handleCreate} className="mb-6 p-4 rounded-xl border bg-muted/30 space-y-3">
          <h3 className="text-sm font-medium">{editId ? "Update Secret" : "New Secret"}</h3>
          {!editId && (
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Secret name (e.g. GITHUB_TOKEN)"
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              required
            />
          )}
          <input
            type="password"
            value={form.value}
            onChange={(e) => setForm({ ...form, value: e.target.value })}
            placeholder={editId ? "New value (leave empty to keep current)" : "Secret value"}
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            required={!editId}
          />
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Description (optional)"
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            value={form.allowed_tools}
            onChange={(e) => setForm({ ...form, allowed_tools: e.target.value })}
            placeholder="Allowed tools (comma-separated, leave empty for all)"
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex gap-2">
            <button type="submit" disabled={createSecret.isPending || updateSecret.isPending} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1">
              {(createSecret.isPending || updateSecret.isPending) && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {editId ? "Update" : "Create"}
            </button>
            <button type="button" onClick={() => { setShowCreate(false); setEditId(null); }} className="px-4 py-2 rounded-lg border text-sm hover:bg-muted">Cancel</button>
          </div>
        </form>
      )}

      {/* Secrets list */}
      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading...</div>
      ) : (
        <div className="space-y-2">
          {data?.secrets.map((secret) => (
            <div key={secret.id} className="flex items-center gap-4 p-4 rounded-xl border hover:bg-muted/50 transition-colors group">
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <KeyRound className="w-5 h-5 text-muted-foreground" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm font-mono">{secret.name}</div>
                {secret.description && (
                  <div className="text-xs text-muted-foreground mt-0.5">{secret.description}</div>
                )}
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                  {secret.allowed_tools && secret.allowed_tools.length > 0 && (
                    <span className="flex items-center gap-1">
                      <Shield className="w-3 h-3" />
                      {secret.allowed_tools.join(", ")}
                    </span>
                  )}
                  {secret.last_used_at && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Last used {new Date(secret.last_used_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-All">
                <button
                  onClick={() => {
                    setEditId(secret.id);
                    setShowCreate(false);
                    setForm({ name: secret.name, value: "", description: secret.description || "", allowed_tools: secret.allowed_tools?.join(", ") || "" });
                  }}
                  className="p-2 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(secret.id)}
                  className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}

          {data?.secrets.length === 0 && (
            <div className="text-center py-16 text-muted-foreground text-sm">
              <KeyRound className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>No secrets stored</p>
              <p className="text-xs mt-1">Add API keys and passwords for the agent to use securely</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

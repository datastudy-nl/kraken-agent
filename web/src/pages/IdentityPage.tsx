import { useState, useEffect } from "react";
import {
  Fingerprint,
  Save,
  Loader2,
  RotateCcw,
  User,
  FileText,
  Link2,
  Plus,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useSoul,
  useUpdateSoul,
  useUserModel,
  useAgentsMd,
  useUpdateAgentsMd,
  useIdentityLinks,
  useCreateIdentityLink,
} from "@/hooks/useIdentity";

type Tab = "soul" | "user-model" | "agents-md" | "links";

const tabs: { id: Tab; label: string; icon: React.ElementType; description: string }[] = [
  { id: "soul", label: "Soul", icon: Fingerprint, description: "The core system prompt that defines who the agent is — its personality, values, and behavior." },
  { id: "user-model", label: "User Model", icon: User, description: "What the agent has learned about you over time. Auto-updated from conversations." },
  { id: "agents-md", label: "Agents.md", icon: FileText, description: "Project-specific context and instructions injected into every conversation." },
  { id: "links", label: "Identity Links", icon: Link2, description: "Map your identity across platforms (Discord, Telegram, etc.) so the agent knows you." },
];

export function IdentityPage() {
  const [activeTab, setActiveTab] = useState<Tab>("soul");

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Identity & Configuration</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Control the agent's core identity, what it knows about you, and project context.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
              activeTab === id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Description */}
      <p className="text-sm text-muted-foreground mb-4">
        {tabs.find((t) => t.id === activeTab)?.description}
      </p>

      {/* Tab content */}
      {activeTab === "soul" && <SoulEditor />}
      {activeTab === "user-model" && <UserModelViewer />}
      {activeTab === "agents-md" && <AgentsMdEditor />}
      {activeTab === "links" && <IdentityLinksManager />}
    </div>
  );
}

/* ─── Soul Editor ─── */

function SoulEditor() {
  const { data, isLoading } = useSoul();
  const updateSoul = useUpdateSoul();
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data?.content != null) {
      setContent(data.content);
      setDirty(false);
    }
  }, [data?.content]);

  const handleSave = () => {
    updateSoul.mutate(content, {
      onSuccess: () => {
        setDirty(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      },
    });
  };

  const handleReset = () => {
    if (data?.content != null) {
      setContent(data.content);
      setDirty(false);
    }
  };

  if (isLoading) return <EditorSkeleton />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {data?.updated_at && `Last updated: ${new Date(data.updated_at).toLocaleString()}`}
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-muted transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Discard
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!dirty || updateSoul.isPending}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {updateSoul.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : saved ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            {saved ? "Saved" : "Save"}
          </button>
        </div>
      </div>
      <textarea
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          setDirty(true);
        }}
        className="w-full h-[calc(100vh-320px)] min-h-[400px] px-4 py-3 rounded-xl border bg-background font-mono text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-ring"
        placeholder="Enter the agent's soul (system prompt)..."
        spellCheck={false}
      />
      {updateSoul.isError && (
        <p className="text-sm text-destructive">
          Failed to save: {(updateSoul.error as Error).message}
        </p>
      )}
    </div>
  );
}

/* ─── User Model (read-only) ─── */

function UserModelViewer() {
  const { data, isLoading } = useUserModel();

  if (isLoading) return <EditorSkeleton />;

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        {data?.updated_at && `Last updated: ${new Date(data.updated_at).toLocaleString()}`}
      </div>
      {data?.content ? (
        <div className="px-4 py-3 rounded-xl border bg-muted/30 font-mono text-sm leading-relaxed whitespace-pre-wrap min-h-[200px]">
          {data.content}
        </div>
      ) : (
        <div className="text-center py-16 text-muted-foreground text-sm">
          <User className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p>No user model yet</p>
          <p className="text-xs mt-1">
            The agent builds this automatically as it learns about you through conversations.
          </p>
        </div>
      )}
    </div>
  );
}

/* ─── Agents.md Editor ─── */

function AgentsMdEditor() {
  const { data, isLoading } = useAgentsMd();
  const updateAgentsMd = useUpdateAgentsMd();
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data?.content != null) {
      setContent(data.content);
      setDirty(false);
    }
  }, [data?.content]);

  const handleSave = () => {
    updateAgentsMd.mutate(content, {
      onSuccess: () => {
        setDirty(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      },
    });
  };

  const handleReset = () => {
    if (data?.content != null) {
      setContent(data.content);
      setDirty(false);
    }
  };

  if (isLoading) return <EditorSkeleton />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {data?.updated_at && `Last updated: ${new Date(data.updated_at).toLocaleString()}`}
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-muted transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Discard
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!dirty || updateAgentsMd.isPending}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {updateAgentsMd.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : saved ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            {saved ? "Saved" : "Save"}
          </button>
        </div>
      </div>
      <textarea
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          setDirty(true);
        }}
        className="w-full h-[calc(100vh-320px)] min-h-[400px] px-4 py-3 rounded-xl border bg-background font-mono text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-ring"
        placeholder="Add project-specific context that gets injected into every conversation..."
        spellCheck={false}
      />
      {updateAgentsMd.isError && (
        <p className="text-sm text-destructive">
          Failed to save: {(updateAgentsMd.error as Error).message}
        </p>
      )}
    </div>
  );
}

/* ─── Identity Links Manager ─── */

function IdentityLinksManager() {
  const { data, isLoading } = useIdentityLinks();
  const createLink = useCreateIdentityLink();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    canonical_user_id: "",
    provider: "",
    provider_user_id: "",
    display_name: "",
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createLink.mutate(
      {
        canonical_user_id: form.canonical_user_id,
        provider: form.provider,
        provider_user_id: form.provider_user_id,
        display_name: form.display_name || undefined,
      },
      {
        onSuccess: () => {
          setShowCreate(false);
          setForm({ canonical_user_id: "", provider: "", provider_user_id: "", display_name: "" });
        },
      }
    );
  };

  if (isLoading) return <div className="text-muted-foreground text-sm">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90"
        >
          <Plus className="w-4 h-4" /> Link Identity
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="p-4 rounded-xl border bg-muted/30 space-y-3">
          <h3 className="text-sm font-medium">Link a Platform Identity</h3>
          <input
            value={form.canonical_user_id}
            onChange={(e) => setForm({ ...form, canonical_user_id: e.target.value })}
            placeholder="Canonical user ID (your main identifier)"
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              value={form.provider}
              onChange={(e) => setForm({ ...form, provider: e.target.value })}
              placeholder="Provider (e.g. discord, telegram)"
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              required
            />
            <input
              value={form.provider_user_id}
              onChange={(e) => setForm({ ...form, provider_user_id: e.target.value })}
              placeholder="Provider user ID"
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              required
            />
          </div>
          <input
            value={form.display_name}
            onChange={(e) => setForm({ ...form, display_name: e.target.value })}
            placeholder="Display name (optional)"
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={createLink.isPending}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1"
            >
              {createLink.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Create
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 rounded-lg border text-sm hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Links list */}
      <div className="space-y-2">
        {data?.links.map((link) => (
          <div
            key={link.id}
            className="flex items-center gap-4 p-4 rounded-xl border hover:bg-muted/50 transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <Link2 className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">
                {link.display_name || link.canonical_user_id}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-xs font-mono">
                  {link.provider}
                </span>
                <span className="ml-2 font-mono">{link.provider_user_id}</span>
              </div>
            </div>
          </div>
        ))}

        {data?.links.length === 0 && (
          <div className="text-center py-16 text-muted-foreground text-sm">
            <Link2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>No identity links</p>
            <p className="text-xs mt-1">
              Link your Discord, Telegram, or other platform accounts so the agent recognizes you.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Skeleton ─── */

function EditorSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-4 w-48 bg-muted rounded animate-pulse" />
      <div className="h-[400px] bg-muted/50 rounded-xl animate-pulse" />
    </div>
  );
}

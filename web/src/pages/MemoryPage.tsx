import { useState } from "react";
import { Search, Plus, Trash2, Tag, Code, Wrench, Network, Globe, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useEntities, useCreateEntity, useDeleteEntity,
  useSkills, useCreateSkill, useDeleteSkill,
  useTools, useCreateTool, useDeleteTool,
  useCommunities,
  useMemoryQuery,
} from "@/hooks/useMemory";
import { NetworkNavigator } from "@/components/memory/NetworkNavigator";

const tabs = [
  { id: "entities", label: "Entities", icon: Network },
  { id: "graph", label: "Graph", icon: Share2 },
  { id: "skills", label: "Skills", icon: Code },
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "communities", label: "Communities", icon: Globe },
  { id: "query", label: "Query", icon: Search },
] as const;
type TabId = typeof tabs[number]["id"];

export function MemoryPage() {
  const [tab, setTab] = useState<TabId>("entities");

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 h-14 border-b shrink-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              tab === t.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-6">
        {tab === "entities" && <EntitiesTab />}
        {tab === "graph" && <NetworkNavigator />}
        {tab === "skills" && <SkillsTab />}
        {tab === "tools" && <ToolsTab />}
        {tab === "communities" && <CommunitiesTab />}
        {tab === "query" && <QueryTab />}
      </div>
    </div>
  );
}

function EntitiesTab() {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useEntities(search);
  const createEntity = useCreateEntity();
  const deleteEntity = useDeleteEntity();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", type: "concept" });

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search entities..."
            className="w-full pl-10 pr-4 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90"
        >
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      {showCreate && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createEntity.mutate(form, { onSuccess: () => { setShowCreate(false); setForm({ name: "", type: "concept" }); } });
          }}
          className="flex gap-2 p-3 rounded-xl border bg-muted/30"
        >
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" className="flex-1 px-3 py-1.5 rounded-lg border bg-background text-sm" />
          <input value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} placeholder="Type" className="w-32 px-3 py-1.5 rounded-lg border bg-background text-sm" />
          <button type="submit" className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm">Create</button>
        </form>
      )}

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading...</div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data?.entities.map((entity) => (
            <div key={entity.id} className="p-3 rounded-xl border hover:bg-muted/50 transition-colors group">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium text-sm">{entity.name}</div>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground mt-1">
                    <Tag className="w-3 h-3" /> {entity.type}
                  </span>
                </div>
                <button
                  onClick={() => deleteEntity.mutate(entity.id)}
                  className="p-1 rounded text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
          {data?.entities.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground text-sm">No entities found</div>
          )}
        </div>
      )}
    </div>
  );
}

function SkillsTab() {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useSkills(search);
  const createSkill = useCreateSkill();
  const deleteSkill = useDeleteSkill();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", content: "", tags: "" });

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search skills..." className="w-full pl-10 pr-4 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90">
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      {showCreate && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createSkill.mutate(
              { name: form.name, content: form.content, tags: form.tags.split(",").map(t => t.trim()).filter(Boolean) },
              { onSuccess: () => { setShowCreate(false); setForm({ name: "", content: "", tags: "" }); } }
            );
          }}
          className="space-y-2 p-3 rounded-xl border bg-muted/30"
        >
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Skill name" className="w-full px-3 py-1.5 rounded-lg border bg-background text-sm" />
          <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Content (markdown)" rows={4} className="w-full px-3 py-1.5 rounded-lg border bg-background text-sm resize-none" />
          <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="Tags (comma-separated)" className="w-full px-3 py-1.5 rounded-lg border bg-background text-sm" />
          <button type="submit" className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm">Create</button>
        </form>
      )}

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading...</div>
      ) : (
        <div className="space-y-2">
          {data?.skills.map((skill) => (
            <div key={skill.id} className="rounded-xl border hover:bg-muted/50 transition-colors group">
              <button onClick={() => setExpanded(expanded === skill.id ? null : skill.id)} className="flex items-start justify-between w-full text-left p-4">
                <div>
                  <div className="font-medium text-sm">{skill.name}</div>
                  <div className="flex gap-1 mt-1">
                    {(skill.tags as string[]).map((tag) => (
                      <span key={tag} className="px-1.5 py-0.5 rounded bg-muted text-[11px] text-muted-foreground">{tag}</span>
                    ))}
                  </div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); deleteSkill.mutate(skill.id); }} className="p-1 rounded text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </button>
              {expanded === skill.id && (
                <div className="px-4 pb-4 text-sm whitespace-pre-wrap text-muted-foreground border-t pt-3">{skill.content}</div>
              )}
            </div>
          ))}
          {data?.skills.length === 0 && <div className="text-center py-12 text-muted-foreground text-sm">No skills found</div>}
        </div>
      )}
    </div>
  );
}

function ToolsTab() {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useTools(search);
  const createTool = useCreateTool();
  const deleteTool = useDeleteTool();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", instructions: "", tags: "" });

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tools..." className="w-full pl-10 pr-4 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90">
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      {showCreate && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createTool.mutate(
              { name: form.name, description: form.description, instructions: form.instructions, tags: form.tags.split(",").map(t => t.trim()).filter(Boolean) },
              { onSuccess: () => { setShowCreate(false); setForm({ name: "", description: "", instructions: "", tags: "" }); } }
            );
          }}
          className="space-y-2 p-3 rounded-xl border bg-muted/30"
        >
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Tool name" className="w-full px-3 py-1.5 rounded-lg border bg-background text-sm" />
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" className="w-full px-3 py-1.5 rounded-lg border bg-background text-sm" />
          <textarea value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} placeholder="Instructions" rows={3} className="w-full px-3 py-1.5 rounded-lg border bg-background text-sm resize-none" />
          <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="Tags (comma-separated)" className="w-full px-3 py-1.5 rounded-lg border bg-background text-sm" />
          <button type="submit" className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm">Create</button>
        </form>
      )}

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading...</div>
      ) : (
        <div className="space-y-2">
          {data?.tools.map((t) => (
            <div key={t.id} className="rounded-xl border hover:bg-muted/50 transition-colors group">
              <button onClick={() => setExpanded(expanded === t.id ? null : t.id)} className="flex items-start justify-between w-full text-left p-4">
                <div>
                  <div className="font-medium text-sm">{t.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>
                  <div className="flex gap-1 mt-1">
                    {(t.tags as string[]).map((tag) => (
                      <span key={tag} className="px-1.5 py-0.5 rounded bg-muted text-[11px] text-muted-foreground">{tag}</span>
                    ))}
                  </div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); deleteTool.mutate(t.id); }} className="p-1 rounded text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </button>
              {expanded === t.id && (
                <div className="px-4 pb-4 border-t pt-3 space-y-2">
                  <div className="text-sm whitespace-pre-wrap text-muted-foreground">{t.instructions}</div>
                  {t.input_schema && Object.keys(t.input_schema).length > 0 && (
                    <pre className="text-xs bg-muted rounded-lg p-2 overflow-x-auto">{JSON.stringify(t.input_schema, null, 2)}</pre>
                  )}
                </div>
              )}
            </div>
          ))}
          {data?.tools.length === 0 && <div className="text-center py-12 text-muted-foreground text-sm">No tools found</div>}
        </div>
      )}
    </div>
  );
}

function CommunitiesTab() {
  const { data, isLoading } = useCommunities();

  return (
    <div className="max-w-4xl mx-auto">
      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading...</div>
      ) : (
        <div className="space-y-3">
          {data?.communities.map((c, i) => (
            <div key={i} className="p-4 rounded-xl border">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-medium text-sm">{c.name}</span>
                <span className="px-1.5 py-0.5 rounded bg-muted text-[11px] text-muted-foreground">Level {c.level}</span>
              </div>
              <p className="text-sm text-muted-foreground">{c.summary}</p>
              <div className="flex flex-wrap gap-1 mt-2">
                {c.entity_ids.map((id) => (
                  <span key={id} className="px-1.5 py-0.5 rounded bg-muted text-[11px]">{id}</span>
                ))}
              </div>
            </div>
          ))}
          {data?.communities.length === 0 && <div className="text-center py-12 text-muted-foreground text-sm">No communities found</div>}
        </div>
      )}
    </div>
  );
}

function QueryTab() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("auto");
  const memoryQuery = useMemoryQuery();

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <form
        onSubmit={(e) => { e.preventDefault(); if (query.trim()) memoryQuery.mutate({ query, mode }); }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Query memory..." className="w-full pl-10 pr-4 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <select value={mode} onChange={(e) => setMode(e.target.value)} className="px-2 py-2 rounded-lg border bg-background text-sm">
          <option value="auto">Auto</option>
          <option value="local">Local</option>
          <option value="global">Global</option>
          <option value="drift">Drift</option>
          <option value="basic">Basic</option>
        </select>
        <button type="submit" disabled={memoryQuery.isPending} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50">
          Search
        </button>
      </form>

      {memoryQuery.isPending && <div className="text-muted-foreground text-sm">Searching...</div>}

      {memoryQuery.data && (
        <div className="space-y-4">
          {memoryQuery.data.entities.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-2">Entities ({memoryQuery.data.entities.length})</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {memoryQuery.data.entities.map((e, i) => (
                  <div key={i} className="p-3 rounded-xl border text-sm">
                    <span className="font-medium">{e.name}</span>
                    <span className="text-muted-foreground ml-2 text-xs">{e.type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {memoryQuery.data.communities.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-2">Communities ({memoryQuery.data.communities.length})</h3>
              {memoryQuery.data.communities.map((c, i) => (
                <div key={i} className="p-3 rounded-xl border text-sm mb-2">
                  <span className="font-medium">{c.name}</span>
                  <p className="text-muted-foreground text-xs mt-1">{c.summary}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

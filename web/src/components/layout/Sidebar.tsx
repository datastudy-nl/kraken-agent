import { useState, useEffect } from "react";
import { NavLink } from "react-router";
import {
  MessageSquare,
  List,
  Brain,
  Container,
  KeyRound,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { checkHealth } from "@/lib/api";

const navItems = [
  { to: "/", icon: MessageSquare, label: "Chat" },
  { to: "/sessions", icon: List, label: "Sessions" },
  { to: "/memory", icon: Brain, label: "Memory" },
  { to: "/sandboxes", icon: Container, label: "Sandboxes" },
  { to: "/keys", icon: KeyRound, label: "Keys" },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [dark, setDark] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("theme") === "dark" ||
        (!localStorage.getItem("theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);
    }
    return false;
  });
  const [healthy, setHealthy] = useState<boolean | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    const check = () => checkHealth().then(() => setHealthy(true)).catch(() => setHealthy(false));
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <aside
      className={cn(
        "flex flex-col border-r bg-sidebar text-sidebar-foreground transition-all duration-200",
        collapsed ? "w-16" : "w-56"
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 h-14 border-b border-sidebar-border">
        <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0">
          K
        </div>
        {!collapsed && <span className="font-semibold text-sm tracking-tight">Kraken</span>}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2 space-y-0.5 px-2">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )
            }
          >
            <Icon className="w-4 h-4 shrink-0" />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-2 space-y-1">
        {/* Health indicator */}
        <div className={cn("flex items-center gap-3 px-3 py-1.5 text-xs", collapsed && "justify-center")}>
          <Activity className={cn(
            "w-3.5 h-3.5 shrink-0",
            healthy === true && "text-green-500",
            healthy === false && "text-red-500",
            healthy === null && "text-muted-foreground animate-pulse"
          )} />
          {!collapsed && (
            <span className="text-muted-foreground">
              {healthy === true ? "Connected" : healthy === false ? "Disconnected" : "Checking..."}
            </span>
          )}
        </div>

        {/* Theme toggle */}
        <button
          onClick={() => setDark(!dark)}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors w-full"
        >
          {dark ? <Sun className="w-4 h-4 shrink-0" /> : <Moon className="w-4 h-4 shrink-0" />}
          {!collapsed && <span>{dark ? "Light mode" : "Dark mode"}</span>}
        </button>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors w-full"
        >
          {collapsed ? <ChevronRight className="w-4 h-4 shrink-0" /> : <ChevronLeft className="w-4 h-4 shrink-0" />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}

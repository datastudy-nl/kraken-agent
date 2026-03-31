import { BrowserRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Sidebar } from "@/components/layout/Sidebar";
import { ApiKeyGate } from "@/components/layout/ApiKeyGate";
import { ChatPage } from "@/pages/ChatPage";
import { SessionsPage } from "@/pages/SessionsPage";
import { SessionDetailPage } from "@/pages/SessionDetailPage";
import { MemoryPage } from "@/pages/MemoryPage";
import { SandboxesPage } from "@/pages/SandboxesPage";
import { SandboxDetailPage } from "@/pages/SandboxDetailPage";
import { KeysPage } from "@/pages/KeysPage";
import { IdentityPage } from "@/pages/IdentityPage";
import { SchedulesPage } from "@/pages/SchedulesPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ApiKeyGate>
        <BrowserRouter>
          <div className="flex h-screen w-screen overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-auto">
              <Routes>
                <Route path="/" element={<ChatPage />} />
                <Route path="/sessions" element={<SessionsPage />} />
                <Route path="/sessions/:id" element={<SessionDetailPage />} />
                <Route path="/memory" element={<MemoryPage />} />
                <Route path="/sandboxes" element={<SandboxesPage />} />
                <Route path="/sandboxes/:sessionId" element={<SandboxDetailPage />} />
                <Route path="/keys" element={<KeysPage />} />
                <Route path="/identity" element={<IdentityPage />} />
                <Route path="/schedules" element={<SchedulesPage />} />
              </Routes>
            </main>
          </div>
        </BrowserRouter>
      </ApiKeyGate>
    </QueryClientProvider>
  );
}

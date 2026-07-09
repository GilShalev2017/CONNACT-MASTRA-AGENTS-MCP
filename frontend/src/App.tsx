import { NavLink, Route, Routes } from "react-router-dom";
import ChatPage from "./pages/ChatPage";
import CustomersPage from "./pages/CustomersPage";
import DocumentsPage from "./pages/DocumentsPage";
import WorkflowsPage from "./pages/WorkflowsPage";

const navItems = [
  { to: "/", label: "AI Assistant", end: true },
  { to: "/customers", label: "Customers" },
  { to: "/documents", label: "Documents" },
  { to: "/workflows", label: "Briefings & Actions" },
];

export default function App() {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-800 bg-slate-950 p-4">
        <div className="mb-8 px-2">
          <div className="text-lg font-semibold text-white">ConnAct</div>
          <div className="text-xs text-slate-400">AI Cloud Partnership Intelligence</div>
        </div>
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? "bg-brand-600 text-white" : "text-slate-300 hover:bg-slate-900 hover:text-white"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto px-2 text-xs text-slate-500">
          Demo platform &middot; synthetic data only
        </div>
      </aside>
      <main className="flex-1 overflow-hidden bg-slate-900">
        <Routes>
          <Route path="/" element={<ChatPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/workflows" element={<WorkflowsPage />} />
        </Routes>
      </main>
    </div>
  );
}

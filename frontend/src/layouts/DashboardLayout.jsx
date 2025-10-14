import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { Outlet } from "react-router-dom";

export default function DashboardLayout() {
  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto px-6 py-4 lg:ml-0">
        <Topbar />
        <Outlet />
      </main>
    </div>
  );
}

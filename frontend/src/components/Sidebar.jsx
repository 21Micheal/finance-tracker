// src/components/layout/Sidebar.jsx
import { NavLink, useLocation } from "react-router-dom";
import {
  BarChart3,
  LayoutDashboard,
  ListOrdered,
  Settings,
  Brain,
  LogOut,
  Wallet,
  Menu,
  X
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useCurrency } from "@/context/CurrencyContext";
import { Button } from "@/components/ui/Button";
import { useState } from "react";
import clsx from "clsx";

export default function Sidebar() {
  const { logout, user } = useAuth();
  const { currency, setCurrency, loading } = useCurrency();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);

  const navItems = [
    { path: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { path: "/transactions", icon: ListOrdered, label: "Transactions" },
    { path: "/analytics", icon: BarChart3, label: "Analytics" },
    { path: "/insights", icon: Brain, label: "AI Insights" }, // ✅ New link
    { path: "/settings", icon: Settings, label: "Settings" },
  ];

  return (
    <>
      {/* Mobile Toggle Button */}
      <button
        className="lg:hidden fixed top-6 left-6 z-50 p-3 rounded-2xl bg-white dark:bg-slate-800 shadow-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:shadow-xl transition-all duration-300"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Sidebar Container */}
      <aside
        className={clsx(
          "fixed lg:static inset-y-0 left-0 z-40 w-80 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 transform transition-transform duration-300 ease-in-out flex flex-col h-screen",
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Header Section */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg">
              <Wallet className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              FinTrack
            </h1>
          </div>
          {user?.email && (
            <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
              {user.email}
            </p>
          )}
        </div>

        {/* Main Navigation */}
        <div className="flex-1 p-6">
          <nav className="flex flex-col space-y-2">
            {navItems.map(({ path, icon: Icon, label }) => {
              const active = location.pathname === path;
              return (
                <NavLink
                  key={path}
                  to={path}
                  onClick={() => setIsOpen(false)}
                  className={clsx(
                    "flex items-center px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 group",
                    active
                      ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800 shadow-sm"
                      : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-slate-100"
                  )}
                >
                  <Icon className={clsx(
                    "w-5 h-5 mr-3 transition-colors",
                    active 
                      ? "text-indigo-600 dark:text-indigo-400" 
                      : "text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300"
                  )} />
                  {label}
                  {active && (
                    <div className="ml-auto w-2 h-2 bg-indigo-600 rounded-full animate-pulse" />
                  )}
                </NavLink>
              );
            })}
          </nav>

          {/* Currency Selector */}
          <div className="mt-8 p-4 bg-slate-50 dark:bg-slate-700/30 rounded-xl border border-slate-200 dark:border-slate-600">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 block">
              Currency Preference
            </label>
            <select
              disabled={loading}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
            >
              <option value="USD">🇺🇸 US Dollar</option>
              <option value="KES">🇰🇪 Kenyan Shilling</option>
              <option value="EUR">🇪🇺 Euro</option>
              <option value="GBP">🇬🇧 British Pound</option>
              <option value="JPY">🇯🇵 Japanese Yen</option>
            </select>
            {loading && (
              <p className="text-xs text-slate-400 mt-1">Updating currency...</p>
            )}
          </div>
        </div>

        {/* Footer Section */}
        <div className="p-6 border-t border-slate-200 dark:border-slate-700">
          <Button
            variant="outline"
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-slate-100 transition-all duration-200 group"
          >
            <LogOut className="w-4 h-4 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors" />
            Sign Out
          </Button>
          
          {/* Version Info */}
          <div className="mt-4 text-center">
            <p className="text-xs text-slate-400 dark:text-slate-500">
              FinTrack v1.0
            </p>
          </div>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
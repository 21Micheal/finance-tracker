import { useLocation, useNavigate } from "react-router-dom";
import { Moon, Sun, LogOut, Settings, User } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabaseClient";

export default function Topbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "light");
  const [menuOpen, setMenuOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Titles by route
  const pageTitles = {
    "/dashboard": "Dashboard Overview",
    "/analytics": "Analytics & Insights",
    "/transactions": "Transactions",
  };
  const title = pageTitles[location.pathname] || "Overview";

  // Theme handler
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme(theme === "light" ? "dark" : "light");

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // User info
  const userName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";
  const userAvatar = user?.user_metadata?.avatar_url;
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // Logout
  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  return (
    <header className="flex items-center justify-between px-6 py-4 bg-white dark:bg-slate-800 shadow-sm rounded-2xl mb-6 relative">
      {/* Page title */}
      <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100 tracking-tight">
        {title}
      </h1>

      {/* Right section */}
      <div className="flex items-center space-x-4">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-full bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition"
        >
          {theme === "light" ? (
            <Moon className="w-5 h-5 text-slate-700" />
          ) : (
            <Sun className="w-5 h-5 text-yellow-400" />
          )}
        </button>

        {/* User menu */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setMenuOpen((prev) => !prev)}
            className="flex items-center space-x-2 focus:outline-none"
          >
            {userAvatar ? (
              <img
                src={userAvatar}
                alt={userName}
                className="w-9 h-9 rounded-full border border-slate-300 dark:border-slate-700"
              />
            ) : (
              <div className="w-9 h-9 flex items-center justify-center rounded-full bg-indigo-500 text-white font-semibold">
                {initials}
              </div>
            )}
          </button>

          {/* Dropdown */}
          {menuOpen && (
            <div className="absolute right-0 mt-3 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-lg py-2 border border-slate-100 dark:border-slate-700 animate-fadeIn z-50">
              <button
                onClick={() => {
                  navigate("/profile");
                  setMenuOpen(false);
                }}
                className="flex items-center w-full px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
              >
                <User className="w-4 h-4 mr-2" /> Profile
              </button>
              <button
                onClick={() => {
                  navigate("/settings");
                  setMenuOpen(false);
                }}
                className="flex items-center w-full px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
              >
                <Settings className="w-4 h-4 mr-2" /> Settings
              </button>
              <hr className="my-1 border-slate-200 dark:border-slate-700" />
              <button
                onClick={handleLogout}
                className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-slate-700 transition"
              >
                <LogOut className="w-4 h-4 mr-2" /> Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

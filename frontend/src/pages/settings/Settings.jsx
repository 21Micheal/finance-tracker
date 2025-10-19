import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useCurrency } from "@/context/CurrencyContext";
import { supabase } from "@/lib/supabaseClient";

// Cached list of supported currencies
const SUPPORTED_CURRENCIES = [
  "USD", "KES", "EUR", "GBP", "JPY", "AUD", "CAD",
  "CHF", "CNY", "HKD", "INR", "MXN", "NZD", "SGD", "ZAR"
];

export default function SidebarSettings() {
  const { user } = useAuth();
  const { currency, setCurrency, loading: currencyLoading } = useCurrency();

  // Preferences state
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "light");
  const [notifications, setNotifications] = useState(true);

  const isUpdating = loading || currencyLoading;

  // 🔹 Sync theme class
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // 🔹 Fetch or create user preferences from Supabase
  useEffect(() => {
    if (!user) return;

    const fetchPrefs = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("preferences")
        .select("theme, notifications")
        .eq("id", user.id)
        .single();

      if (error) {
        console.warn("⚠️ Preferences fetch error:", error.message);
      } else if (data) {
        setTheme(data.theme || "light");
        setNotifications(data.notifications ?? true);
        localStorage.setItem("theme", data.theme || "light");
      } else {
        // Create default entry if missing
        await supabase.from("preferences").upsert({ id: user.id });
      }

      setLoading(false);
    };

    fetchPrefs();
  }, [user]);

  // 🔹 Update Supabase preferences
  const updatePrefs = useCallback(async (updates) => {
    if (!user) return;

    const newPrefs = {
      theme,
      notifications,
      ...updates,
    };

    setTheme(newPrefs.theme);
    setNotifications(newPrefs.notifications);

    localStorage.setItem("theme", newPrefs.theme);
    document.documentElement.classList.toggle("dark", newPrefs.theme === "dark");

    setLoading(true);
    const { error } = await supabase
      .from("preferences")
      .upsert({
        id: user.id,
        theme: newPrefs.theme,
        notifications: newPrefs.notifications,
        updated_at: new Date(),
      });

    if (error) console.error("❌ Error updating preferences:", error.message);
    setLoading(false);
  }, [user, theme, notifications]);

  return (
    <div className="p-8 bg-white dark:bg-slate-800 rounded-2xl shadow-sm max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-6">
        Settings
      </h1>

      {isUpdating && (
        <p className="text-center py-4 text-slate-500 dark:text-slate-400">
          Loading preferences...
        </p>
      )}

      <div className="space-y-8">
        {/* Theme Preference */}
        <section className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
              Theme Preference
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Switch between Light and Dark mode
            </p>
          </div>
          <button
            onClick={() => updatePrefs({ theme: theme === "light" ? "dark" : "light" })}
            className="px-4 py-2 rounded-xl bg-indigo-500 text-white hover:bg-indigo-600 transition disabled:opacity-50"
            disabled={isUpdating}
          >
            {theme === "light" ? "Enable Dark Mode" : "Enable Light Mode"}
          </button>
        </section>

        {/* Currency Preference */}
        <section className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
              Currency Preference
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Choose your preferred display currency for all transactions
            </p>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              disabled={currencyLoading}
              className="rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-700 px-3 py-2 text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {SUPPORTED_CURRENCIES.map((cur) => (
                <option key={cur} value={cur}>
                  {cur}
                </option>
              ))}
            </select>
            {currencyLoading && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Updating rates...
              </p>
            )}
          </div>
        </section>

        {/* Notifications */}
        <section className="flex items-center justify-between pb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
              Notifications
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Receive updates and alerts about your finances
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={notifications}
              disabled={isUpdating}
              onChange={(e) => updatePrefs({ notifications: e.target.checked })}
            />
            <div className="w-11 h-6 bg-slate-200 rounded-full peer dark:bg-slate-700 peer-checked:bg-indigo-500 after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full after:border-slate-300 dark:after:border-slate-600" />
          </label>
        </section>
      </div>
    </div>
  );
}
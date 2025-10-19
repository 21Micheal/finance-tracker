import { useEffect, useState, useMemo, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useCurrency } from "@/context/CurrencyContext";
import { supabase } from "@/lib/supabaseClient";
import { BUDGET_CATEGORIES } from "@/utils/budgetService";
import { formatCurrency } from "@/utils/formatCurrency";
import { linkPhone } from "@/lib/auth";
import { toast } from "sonner";

// Utility: Load initial spending caps from localStorage
const getInitialSpendingCaps = () => {
  try {
    const saved = localStorage.getItem("spendingCaps");
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
};

// Cached list of supported currencies
const SUPPORTED_CURRENCIES = [
  "USD", "KES", "EUR", "GBP", "JPY", "AUD", "CAD",
  "CHF", "CNY", "HKD", "INR", "MXN", "NZD", "SGD", "ZAR"
];

export default function SettingsView() {
  const { user, token } = useAuth();
  const { currency, setCurrency, loading: currencyLoading } = useCurrency();

  // Preferences state
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "light");
  const [notifications, setNotifications] = useState(true);
  const [spendingCaps, setSpendingCaps] = useState(getInitialSpendingCaps);
  
  // Phone link state
  const [phone, setPhone] = useState("");
  const [phoneLoading, setPhoneLoading] = useState(false);

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
    
    // Set initial phone value
    setPhone(user?.phone || "");
  }, [user]);

  // 🔹 Persist spending caps to localStorage
  useEffect(() => {
    localStorage.setItem("spendingCaps", JSON.stringify(spendingCaps));
  }, [spendingCaps]);

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

  // 🔹 Update a category's spending cap
  const updateSpendingCap = useCallback((category, amount) => {
    const newAmount = Math.max(0, parseFloat(amount) || 0);
    setSpendingCaps((prev) => ({ ...prev, [category]: newAmount }));
  }, []);

  // 🔹 Handle phone link
  const handleLinkPhone = async (e) => {
    e.preventDefault();
    if (!phone) {
      toast.error("Please enter your phone number");
      return;
    }
    
    setPhoneLoading(true);
    try {
      const result = await linkPhone(phone, token);
      toast.success(result.message || "Phone linked successfully!");
    } catch (err) {
      toast.error(err.message || "Failed to link phone number");
    } finally {
      setPhoneLoading(false);
    }
  };

  // 🔹 Only expense categories
  const expenseCategories = useMemo(
    () => BUDGET_CATEGORIES.filter((c) => c.isExpense !== false),
    []
  );

  return (
    <div className="p-8 bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-8">
        Account Settings & Budgeting
      </h1>

      {isUpdating && (
        <p className="text-center py-4 text-slate-500 dark:text-slate-400">
          Loading preferences...
        </p>
      )}

      <div className="space-y-10">
        {/* === General Preferences === */}
        <section className="space-y-6">
          <h2 className="text-xl font-bold text-indigo-600 dark:text-indigo-400">
            General
          </h2>

          {/* Theme */}
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
                Theme Preference
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Switch between Light and Dark mode.
              </p>
            </div>
            <button
              onClick={() => updatePrefs({ theme: theme === "light" ? "dark" : "light" })}
              className="px-4 py-2 rounded-xl bg-indigo-500 text-white hover:bg-indigo-600 transition disabled:opacity-50"
              disabled={isUpdating}
            >
              {theme === "light" ? "Enable Dark Mode" : "Enable Light Mode"}
            </button>
          </div>

          {/* Currency */}
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
                Currency Preference
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Choose your preferred display currency for all transactions.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                disabled={currencyLoading}
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-700 px-3 py-2 text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
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
          </div>

          {/* Notifications */}
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
                Notifications
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Receive updates and alerts about your finances.
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
          </div>

          {/* M-Pesa Phone Link */}
          <div className="border-b border-slate-200 dark:border-slate-700 pb-4">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-3">
              Link M-Pesa Phone Number
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Linking your number automatically imports M-Pesa transactions
            </p>
            <div className="flex gap-3">
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 0712345678"
                className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={handleLinkPhone}
                disabled={phoneLoading}
                className={`px-4 py-2 rounded-lg text-white font-medium transition ${
                  phoneLoading
                    ? "bg-indigo-400 cursor-not-allowed"
                    : "bg-indigo-600 hover:bg-indigo-700"
                }`}
              >
                {phoneLoading ? "Syncing..." : "Link & Sync"}
              </button>
            </div>
          </div>
        </section>

        <hr className="border-slate-200 dark:border-slate-700" />

        {/* === Budgeting Section === */}
        <section>
          <h2 className="text-xl font-bold text-indigo-600 dark:text-indigo-400 mb-6">
            Monthly Spending Limits 💸
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            Set a monthly spending cap for each expense category to help you stay on budget. These limits are stored locally.
          </p>

          <div className="grid gap-4">
            {expenseCategories.map((category) => (
              <div
                key={category.id}
                className="flex flex-wrap sm:flex-nowrap items-center justify-between p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-700/50 hover:shadow-md transition"
              >
                <div className="flex items-center gap-3 w-full sm:w-auto mb-2 sm:mb-0">
                  <span className="text-2xl">{category.icon}</span>
                  <div>
                    <p className="font-medium text-slate-800 dark:text-slate-100">
                      {category.name}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Current limit:{" "}
                      <strong>
                        {formatCurrency(spendingCaps[category.id] || 0, currency, 0)}
                      </strong>
                    </p>
                  </div>
                </div>
                <input
                  type="number"
                  min="0"
                  step="10"
                  placeholder="0.00"
                  value={spendingCaps[category.id] || ""}
                  onChange={(e) => updateSpendingCap(category.id, e.target.value)}
                  className="w-full sm:w-36 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
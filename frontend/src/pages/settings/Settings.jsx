import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useCurrency } from "@/context/CurrencyContext";
import { supabase } from "@/lib/supabaseClient";
import { convertCurrency } from "@/utils/currencyUtils";
import { notify } from "@/utils/toastHelper";
import { toast } from "sonner";

export default function Settings() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const { currency, setCurrency } = useCurrency();
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [autoBudget, setAutoBudget] = useState(false);

  // Fetch preferences from Supabase
  useEffect(() => {
    if (!user) return;
    const fetchPrefs = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();

        // PGRST116 is "not found", which is fine for a new user
        if (error && error.code !== "PGRST116") throw error;

        if (data) {
          // Use nullish coalescing for defaults
          setTheme(data.theme || "light");
          setCurrency(data.currency || "USD");
          setNotifications(data.notifications ?? true);
          setAutoBudget(data.auto_budget ?? false);
        } else {
          // Create default prefs for new user
          const defaultPrefs = {
            id: user.id,
            theme: "light",
            currency: "USD",
            notifications: true,
            auto_budget: false,
          };
          await supabase.from("profiles").upsert(defaultPrefs);
        }
      } catch (err) {
        console.error("Error fetching preferences:", err);
        notify.error("Load Failed", "Failed to load preferences from server.");
      } finally {
        setLoading(false);
      }
    };
    fetchPrefs();
  }, [user, setCurrency, setTheme]);

  // Handle currency change with conversion
  const handleCurrencyChange = async (newCurrency) => {
    if (!user) return;
    
    try {
      setLoading(true);
      const oldCurrency = currency;

      // Update all transaction values
      const { data: transactions } = await supabase
        .from("transactions")
        .select("id, amount, currency")
        .eq("user_id", user.id);

      if (transactions?.length) {
        const updated = transactions.map(t => ({
          id: t.id,
          amount: convertCurrency(t.amount, oldCurrency, newCurrency),
          currency: newCurrency,
        }));

        // Batch update transactions
        for (const tx of updated) {
          await supabase
            .from("transactions")
            .update({ amount: tx.amount, currency: tx.currency })
            .eq("id", tx.id);
        }
      }

      // Update preference in Supabase
      await supabase
        .from("profiles")
        .update({ currency: newCurrency })
        .eq("id", user.id);

      // Update frontend state
      setCurrency(newCurrency);

      toast.success("Currency updated", {
        description: `All amounts converted to ${newCurrency}.`,
        style: { background: "#0f766e", color: "white" },
      });
    } catch (error) {
      console.error("Error updating currency:", error);
      toast.error("Currency update failed", {
        description: "We couldn't update your currency.",
      });
    } finally {
      setLoading(false);
    }
  };

  // Update other preferences (theme, notifications, autoBudget)
  const updatePrefs = async (updates) => {
    if (!user) return;
    setLoading(true);
    const newPrefs = {
      theme,
      currency,
      notifications,
      auto_budget: autoBudget,
      ...updates,
    };

    const { error } = await supabase
      .from("profiles")
      .upsert({ id: user.id, ...newPrefs, updated_at: new Date() });

    if (error) {
      console.error("Error updating preferences:", error);
      notify.error("Update Failed", "Could not save your preferences.");
    } else {
      // Update local state only for the changes
      if (updates.theme !== undefined) setTheme(updates.theme);
      if (updates.notifications !== undefined)
        setNotifications(updates.notifications);
      if (updates.auto_budget !== undefined)
        setAutoBudget(updates.auto_budget);

      notify.success("Preferences Updated", "Your settings were saved!");
    }
    setLoading(false);
  };

  return (
    <div className="p-8 bg-white dark:bg-slate-800 rounded-2xl shadow-sm max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-6">
        Settings
      </h1>

      {loading ? (
        <div className="text-center py-4">Loading preferences...</div>
      ) : (
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
              onClick={() =>
                updatePrefs({ theme: theme === "light" ? "dark" : "light" })
              }
              className="px-4 py-2 rounded-xl bg-indigo-500 text-white hover:bg-indigo-600 transition"
            >
              {theme === "light" ? "Enable Dark Mode" : "Enable Light Mode"}
            </button>
          </section>

          {/* Default Currency */}
          <section className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
                Default Currency
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Select your preferred display currency (converts all amounts)
              </p>
            </div>
            <select
              value={currency}
              onChange={(e) => handleCurrencyChange(e.target.value)}
              disabled={loading}
              className="rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-700 px-3 py-2 text-slate-700 dark:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="USD">USD – US Dollar</option>
              <option value="KES">KES – Kenyan Shilling</option>
              <option value="EUR">EUR – Euro</option>
              <option value="GBP">GBP – British Pound</option>
              <option value="INR">INR – Indian Rupee</option>
              <option value="JPY">JPY – Japanese Yen</option>
            </select>
          </section>

          {/* Notifications */}
          <section className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
                Notifications
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Receive in-app and email alerts about your finances
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={notifications}
                onChange={(e) =>
                  updatePrefs({ notifications: e.target.checked })
                }
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-indigo-500"></div>
            </label>
          </section>

          {/* Auto-Budget Analysis */}
          <section className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
                Auto Budget Insights
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Enable AI-driven budget optimization and suggestions
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={autoBudget}
                onChange={(e) => updatePrefs({ auto_budget: e.target.checked })}
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-indigo-500"></div>
            </label>
          </section>
        </div>
      )}
    </div>
  );
}
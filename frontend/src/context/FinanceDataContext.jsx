import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import toast from "react-hot-toast";
import { fetchAlerts } from "@/utils/alertsService";

const FinanceDataContext = createContext();

export const FinanceDataProvider = ({ children }) => {
  const [transactions, setTransactions] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [currency, setCurrency] = useState("USD");
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // 🧠 Fetch user and finance data
  useEffect(() => {
    const initializeData = async () => {
      setLoading(true);
      try {
        // Get user session
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          console.warn("No authenticated user");
          setLoading(false);
          return;
        }
        setUser(user);

        // Fetch transactions
        const { data: txData, error: txError } = await supabase
          .from("transactions")
          .select("*")
          .order("date", { ascending: false });
        if (txError) throw txError;
        setTransactions(txData || []);

        // Fetch alerts
        const fetchedAlerts = await fetchAlerts(user.id);
        setAlerts(fetchedAlerts || []);
      } catch (err) {
        console.error("Error initializing finance data:", err);
        toast.error("Failed to load finance data");
      } finally {
        setLoading(false);
      }
    };

    initializeData();

    // 🔄 Real-time updates for transactions
    const txChannel = supabase
      .channel("transactions-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transactions" },
        async (payload) => {
          console.log("📡 Transaction change detected:", payload);
          const { data, error } = await supabase
            .from("transactions")
            .select("*")
            .order("date", { ascending: false });
          if (!error) setTransactions(data || []);
        }
      )
      .subscribe();

    // 🔄 Real-time updates for alerts
    const alertsChannel = supabase
      .channel("alerts-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "alerts" },
        async (payload) => {
          console.log("⚡ Alert change detected:", payload);
          if (user) {
            const updatedAlerts = await fetchAlerts(user.id);
            setAlerts(updatedAlerts || []);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(txChannel);
      supabase.removeChannel(alertsChannel);
    };
  }, []);

  // 🧩 Derived values
  const income = transactions.filter(t => t.type === "income").reduce((a, b) => a + parseFloat(b.amount), 0);
  const expense = transactions.filter(t => t.type === "expense").reduce((a, b) => a + parseFloat(b.amount), 0);
  const savings = income - expense;

  return (
    <FinanceDataContext.Provider
      value={{
        transactions,
        setTransactions,
        alerts,
        setAlerts,
        currency,
        setCurrency,
        user,
        setUser,
        income,
        expense,
        savings,
        loading,
      }}
    >
      {children}
    </FinanceDataContext.Provider>
  );
};

export const useFinanceData = () => useContext(FinanceDataContext);

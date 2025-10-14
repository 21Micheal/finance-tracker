// src/hooks/useTransactions.js
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { createAlert } from "@/utils/alertsService"; 
import { getExchangeRate, convertCurrency } from "@/utils/currencyUtils"; // Assuming currencyUtils now exports convertCurrency as well

// NOTE: The rates definition is moved to currencyUtils for better organization,
// but for this file to be self-contained as per previous steps, 
// let's ensure the necessary currency function is imported or redefined if not present in utils.
// Assuming currencyUtils is now structured like this:
// export const getExchangeRate = (from, to) => { ... };
// export const convertCurrency = (amount, from, to) => amount * getExchangeRate(from, to);


/**
 * Helper to convert fetched USD transaction data to the display currency
 * and add the required 'display_amount' property.
 */
const mapToDisplayCurrency = (txs, selectedCurrency) => {
  if (!txs || txs.length === 0) return [];
  
  return txs.map((tx) => ({
    ...tx,
    // Convert base USD amount to the selected display currency
    display_amount: parseFloat(
      convertCurrency(tx.amount, "USD", selectedCurrency).toFixed(2)
    ),
    // Attach the display currency to the transaction object for frontend use
    display_currency: selectedCurrency, 
  }));
};


/**
 * useTransactions Hook (Currency Aware, Realtime & Alerting)
 * Handles CRUD, Realtime sync, alert generation, and ensures consistent
 * USD-based storage with conversions for display.
 *
 * @param {object} user - The user object containing the 'id'.
 * @param {string} selectedCurrency - The user's preferred display currency.
 */
export const useTransactions = (user, selectedCurrency = "USD") => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  // Cleanup flag to prevent updating unmounted components
  useEffect(() => {
    mountedRef.current = true;
    return () => (mountedRef.current = false);
  }, []);
  
  // --- ALERT GENERATION LOGIC ---
  const detectAlerts = useCallback(async (txs) => {
    if (!user?.id || !txs?.length) return;
    
    // Alerts are calculated based on the raw USD amounts stored in DB (tx.amount)
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();

    const monthlyTxs = txs.filter(
      (tx) =>
        new Date(tx.date).getMonth() === thisMonth &&
        new Date(tx.date).getFullYear() === thisYear
    );

    const totalExpense = monthlyTxs
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + (t.amount || 0), 0); 

    const totalIncome = monthlyTxs
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + (t.amount || 0), 0); 
      
    const budgetLimit = 1000; // USD
    const warningThreshold = budgetLimit * 0.8;
    
    // Alert checks use USD values for consistency
    if (totalExpense >= warningThreshold && totalExpense < budgetLimit) {
      await createAlert(user.id, { type: "warning", title: "Spending Alert", message: `You've used ${Math.round((totalExpense / budgetLimit) * 100)}% of your $${budgetLimit} monthly budget (in USD).`, icon: "⚠️", });
    }
    if (totalExpense >= budgetLimit) {
      await createAlert(user.id, { type: "danger", title: "Budget Exceeded", message: `You've exceeded your $${budgetLimit} monthly limit! Total expense: $${totalExpense.toFixed(2)} USD.`, icon: "🚨", });
    }
    if (totalExpense > totalIncome) {
      await createAlert(user.id, { type: "danger", title: "Negative Savings", message: `Expenses ($${totalExpense.toFixed(2)}) exceed income ($${totalIncome.toFixed(2)}) this month (in USD).`, icon: "📉", });
    }
    
    const largeTxThreshold = 500; // USD
    const newLargeTx = txs.find((tx) => 
      tx.amount >= largeTxThreshold && 
      (new Date() - new Date(tx.created_at || new Date())) < (1000 * 60)
    ); 
    if (newLargeTx) {
      await createAlert(user.id, { type: "info", title: "Large Transaction", message: `A transaction of $${newLargeTx.amount} USD was recorded in ${newLargeTx.category || "Uncategorized"}.`, icon: "💰", });
    }
  }, [user]);

  // ---- 1️⃣ FETCH TRANSACTIONS ----
  const fetchTransactions = useCallback(async () => {
    if (!user?.id) {
      if (mountedRef.current) {
        setTransactions([]);
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("user_id", user.id)
      .order("date", { ascending: false });

    if (error) {
      console.error("❌ Supabase Fetch Error:", error);
      toast.error("Failed to load transactions");
      if (mountedRef.current) setError("Failed to load transactions.");
      setTransactions([]);
    } else if (mountedRef.current) {
      const fetchedTxs = data || [];
      // 1. Convert to display currency for local state
      const convertedTxs = mapToDisplayCurrency(fetchedTxs, selectedCurrency);
      
      setTransactions(convertedTxs);
      
      // 2. Run alerts on the original USD data (fetchedTxs)
      detectAlerts(fetchedTxs); 
    }

    if (mountedRef.current) setLoading(false);
  }, [user, selectedCurrency, detectAlerts]);

  // ---- 2️⃣ ADD TRANSACTION ----
  const addTransaction = useCallback(
    async (tx) => {
      if (!user?.id) return;
      setError(null);
      setLoading(true);
      
      // tx.amount is in tx.currency (which is selectedCurrency from modal)

      try {
        // 1. Convert entered amount from tx.currency (selectedCurrency) → USD for storage
        const amountInUSD = convertCurrency(tx.amount, tx.currency, "USD");

        const payload = {
          ...tx,
          amount: amountInUSD, // stored in USD
          currency: "USD", // Store base currency in the DB
          user_id: user.id,
        };
        // Remove the temporary currency field used for input conversion
        delete payload.currency;

        const { data, error } = await supabase
          .from("transactions")
          .insert([payload])
          .select();

        if (error) throw error;

        const newTx = data[0];
        // 2. Convert new transaction back to display currency for optimistic update
        const convertedNewTx = mapToDisplayCurrency([newTx], selectedCurrency)[0];

        if (mountedRef.current) {
          // NOTE: We only insert the new converted transaction, relying on Realtime/Re-fetch for full list accuracy
          const updated = [convertedNewTx, ...transactions].sort(
            (a, b) => new Date(b.date) - new Date(a.date)
          );
          setTransactions(updated);
          toast.success("Transaction added!");
          
          // Use the raw USD data for alert check (need to map back to original USD amounts)
          const allUSDTransactions = mapToUSDForAlerts(updated);
          detectAlerts(allUSDTransactions); 
        }
      } catch (err) {
        console.error("❌ Supabase Add Error:", err);
        toast.error("Failed to add transaction");
        if (mountedRef.current) setError("Failed to add transaction.");
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    [user, selectedCurrency, transactions, detectAlerts]
  );
  
  // Helper to map currently displayed transactions (which include display_amount)
  // back to their stored USD amounts for alerts.
  const mapToUSDForAlerts = (convertedTxs) => {
    return convertedTxs.map(t => ({
      ...t,
      // Use the actual stored 'amount' which is in USD
      amount: t.amount, 
    }));
  };

  // ---- 3️⃣ UPDATE TRANSACTION ----
  const updateTransaction = useCallback(
    async (id, updates) => {
      if (!user?.id) return;
      setError(null);

      // 1. Convert to base currency (USD) if amount changes (assuming the modal sends the input amount in selectedCurrency)
      const updatedPayload = { ...updates };
      if (updates.amount && updates.currency) {
        updatedPayload.amount = parseFloat(
          convertCurrency(updates.amount, updates.currency, "USD").toFixed(2)
        );
        updatedPayload.currency = "USD";
        delete updatedPayload.currency; // Remove temporary currency field
      }

      const { data, error } = await supabase
        .from("transactions")
        .update(updatedPayload)
        .eq("id", id)
        .eq("user_id", user.id)
        .select();

      if (error) {
        console.error("❌ Supabase Update Error:", error);
        toast.error("Failed to update transaction");
        if (mountedRef.current) setError("Failed to update transaction.");
        return;
      }

      if (data?.length && mountedRef.current) {
        const updatedTx = data[0];
        // 2. Convert updated transaction back to display currency
        const convertedUpdatedTx = mapToDisplayCurrency([updatedTx], selectedCurrency)[0];

        const updatedTxs = transactions.map((tx) =>
          tx.id === id ? convertedUpdatedTx : tx
        );
        setTransactions(updatedTxs);
        toast.success("Transaction updated!");
        
        // Re-run alert detection using raw USD data
        detectAlerts(mapToUSDForAlerts(updatedTxs));
      }
    },
    [user, selectedCurrency, transactions, detectAlerts]
  );

  // ---- 4️⃣ DELETE TRANSACTION ----
  const deleteTransaction = useCallback(
    async (id) => {
      if (!user?.id) return;
      setError(null);

      const { error } = await supabase
        .from("transactions")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) {
        console.error("❌ Delete Error:", error);
        toast.error("Failed to delete transaction");
        if (mountedRef.current) setError("Failed to delete transaction.");
        return;
      }

      if (mountedRef.current) {
        const updated = transactions.filter((tx) => tx.id !== id);
        setTransactions(updated);
        toast.info("Transaction deleted");
        
        // Re-run alert detection
        detectAlerts(mapToUSDForAlerts(updated));
      }
    },
    [user, transactions, detectAlerts]
  );

  // --- 5. REAL-TIME SUBSCRIPTIONS (Re-fetch on any change) ---
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`transactions-realtime-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "transactions",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log("⚡ Realtime update:", payload.eventType, payload.new || payload.old);
          // Re-fetch ensures currency conversion and alerts are re-run on external changes
          fetchTransactions(); 
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchTransactions]);


  // ---- 6️⃣ Initial fetch/Re-fetch on dependency change ----
  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  return {
    transactions,
    loading,
    error,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    fetchTransactions,
  };
};
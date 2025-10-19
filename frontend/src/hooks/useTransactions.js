// src/hooks/useTransactions.js
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { createAlert } from "@/utils/alertsService";
import { getExchangeRate, convertCurrency } from "@/utils/currencyUtils";

// NOTE: All amounts stored in Supabase (and used for alerts) are in USD.

/**
 * Maps a list of base-currency (USD) transactions to the selected display currency.
 * @param {Array<Object>} txs - The list of transactions, where 'amount' is in USD.
 * @param {string} selectedCurrency - The target currency code (e.g., "EUR").
 * @returns {Array<Object>} The list of transactions with 'display_amount' and 'display_currency' fields.
 */
const mapToDisplayCurrency = (txs, selectedCurrency) => {
  if (!txs || txs.length === 0) return [];

  return txs.map((tx) => {
    // Determine the base amount. Supabase transactions use tx.amount (USD).
    // M-Pesa transactions fetched from the backend should also be normalized to USD if possible,
    // but here we assume the base amount is in USD for Supabase and M-Pesa amounts are in their base
    // currency and need conversion IF they are not USD.
    // However, given the existing logic, we assume the base amount is 'tx.amount' in USD.
    const baseAmount = tx.amount || 0;

    return {
      ...tx,
      // Convert base USD amount to the selected display currency
      display_amount: parseFloat(
        convertCurrency(baseAmount, "USD", selectedCurrency).toFixed(2)
      ),
      // Attach the display currency to the transaction object for frontend use
      display_currency: selectedCurrency,
    };
  });
};

/**
 * Helper to get the base-currency (USD) transactions from the state for alerts.
 * This is crucial because alerts should use the base USD amount, not the converted display amount.
 * @param {Array<Object>} convertedTxs - The list of transactions from state (with display_amount).
 * @returns {Array<Object>} The list of transactions with 'amount' representing the USD value.
 */
const mapToUSDForAlerts = (convertedTxs) => {
  // If the transaction came from Supabase, its 'amount' is already the USD base.
  // If it came from M-Pesa, we assume its 'amount' is the base USD equivalent after normalization.
  // We simply ensure we use the 'amount' field for alerts.
  return convertedTxs.map(t => ({
    ...t,
    amount: t.amount, // Use the stored base amount (USD)
  }));
};

// Helper to generate unique IDs for M-Pesa transactions
const generateMpesaId = (tx, index) => {
  if (tx.id && tx.id !== '' && tx.source !== 'mpesa') return tx.id; // Only generate for new M-Pesa or local
  if (tx.mpesa_reference) return `mpesa-ref-${tx.mpesa_reference}`;
  if (tx.transaction_id) return `mpesa-tid-${tx.transaction_id}`;
  return `mpesa-local-${Date.now()}-${index}`;
};

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

    // IMPORTANT: The txs passed here must have their 'amount' field in USD.

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

    // Budget limit should be in USD for consistency with stored amounts
    const budgetLimit = 1000;
    const warningThreshold = budgetLimit * 0.8;

    // Use a flag to avoid firing multiple alerts in quick succession
    const alertKey = `alert_${thisYear}_${thisMonth}`;

    if (totalExpense >= warningThreshold && totalExpense < budgetLimit && !localStorage.getItem(`${alertKey}_warning`)) {
      await createAlert(user.id, {
        type: "warning",
        title: "Spending Alert",
        message: `You've used ${Math.round((totalExpense / budgetLimit) * 100)}% of your $${budgetLimit} monthly budget.`,
        icon: "⚠️"
      });
      localStorage.setItem(`${alertKey}_warning`, Date.now());
    }
    if (totalExpense >= budgetLimit && !localStorage.getItem(`${alertKey}_danger_exceeded`)) {
      await createAlert(user.id, {
        type: "danger",
        title: "Budget Exceeded",
        message: `You've exceeded your $${budgetLimit} monthly limit! Total expense: $${totalExpense.toFixed(2)}.`,
        icon: "🚨"
      });
      localStorage.setItem(`${alertKey}_danger_exceeded`, Date.now());
    }
    if (totalExpense > totalIncome && totalExpense > 0 && !localStorage.getItem(`${alertKey}_danger_negative`)) {
      await createAlert(user.id, {
        type: "danger",
        title: "Negative Savings",
        message: `Expenses ($${totalExpense.toFixed(2)}) exceed income ($${totalIncome.toFixed(2)}) this month.`,
        icon: "📉"
      });
      localStorage.setItem(`${alertKey}_danger_negative`, Date.now());
    }

    // Large transaction alert (check against recent transactions)
    const largeTxThreshold = 500;
    const oneMinuteAgo = new Date(Date.now() - (1000 * 60)); // Check for new transactions in the last 60 seconds

    const newLargeTx = txs.find((tx) =>
      tx.amount >= largeTxThreshold &&
      (new Date(tx.created_at || new Date())) > oneMinuteAgo // Check if created in the last minute
    );
    if (newLargeTx) {
      // Use a more specific key to avoid re-alerting on the same large transaction ID
      if (!localStorage.getItem(`alert_large_tx_${newLargeTx.id}`)) {
        await createAlert(user.id, {
          type: "info",
          title: "Large Transaction",
          message: `A transaction of $${newLargeTx.amount.toFixed(2)} was recorded in ${newLargeTx.category || "Uncategorized"}.`,
          icon: "💰"
        });
        localStorage.setItem(`alert_large_tx_${newLargeTx.id}`, Date.now());
      }
    }
  }, [user]);

  // ---- 1️⃣ FETCH M-PESA TRANSACTIONS ----
  const fetchMpesaTransactions = useCallback(async () => {
    if (!user?.id) return [];

    try {
      // console.log("🔄 Fetching M-Pesa transactions...");

      const API_BASE_URL = import.meta.env.VITE_FLASK_API_URL || 'http://localhost:8000';
      const url = `${API_BASE_URL}/api/mpesa/transactions`;

      const res = await fetch(url, {
        signal: AbortSignal.timeout(8000)
      });

      if (!res.ok) {
        // console.warn(`⚠️ M-Pesa API returned ${res.status}: ${res.statusText}`);
        return [];
      }

      const data = await res.json();

      if (!Array.isArray(data)) return [];

      const normalized = data
        .map((tx, index) => {
          try {
            const transactionType = tx.transaction_type || "";
            const amountInKES = parseFloat(tx.amount) || 0;
            // Assuming the M-Pesa API is not performing USD conversion, we do it here.
            // NOTE: For simplicity, we are converting KES to USD here. This requires
            // 'convertCurrency' to work with KES. The actual backend should ideally
            // normalize to USD before sending.
            const amountInUSD = convertCurrency(amountInKES, "KES", "USD");
            const id = generateMpesaId(tx, index);

            return {
              id,
              type: transactionType.toLowerCase().includes("receive") ? "income" : "expense",
              amount: amountInUSD, // BASE AMOUNT IN USD for alerts and unified data
              category: tx.category || "M-Pesa",
              description: tx.description || `M-Pesa ${transactionType}`,
              date: tx.date || new Date().toISOString().split("T")[0],
              source: "mpesa",
              user_id: user?.id,
              created_at: tx.created_at || new Date().toISOString(),
              updated_at: tx.updated_at || new Date().toISOString(),
              // Include original M-Pesa details
              mpesa_amount_kes: amountInKES,
              mpesa_reference: tx.reference || tx.transaction_id,
              mpesa_phone: tx.phone_number,
              mpesa_name: tx.name || tx.party_name,
            };
          } catch (txError) {
            console.error(`❌ Error normalizing M-Pesa transaction:`, txError, tx);
            return null;
          }
        })
        .filter(Boolean);

      return normalized;
    } catch (err) {
      if (err.name === 'AbortError') {
        console.warn("⏰ M-Pesa fetch timeout.");
      } else {
        console.error("❌ M-Pesa Fetch Error:", err);
      }
      return [];
    }
  }, [user?.id]);


  // ---- 2️⃣ FETCH ALL TRANSACTIONS (Supabase + M-Pesa) ----
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

    try {
      // 1. Fetch Supabase Transactions (Base Currency: USD)
      const { data: supabaseData, error: supabaseError } = await supabase
        .from("transactions")
        .select("*")
        .eq("user_id", user.id)
        .order("date", { ascending: false });

      if (supabaseError) throw supabaseError;

      // 2. Fetch M-Pesa Transactions (Normalized to USD)
      const mpesaData = await fetchMpesaTransactions();

      // 3. Merge Supabase and M-Pesa data
      const rawTxs = [...(supabaseData || []), ...mpesaData];

      // 4. Sort by date
      const sortedTxs = rawTxs.sort(
        (a, b) => new Date(b.date) - new Date(a.date)
      );

      if (mountedRef.current) {
        // 5. Convert to display currency
        const convertedTxs = mapToDisplayCurrency(sortedTxs, selectedCurrency);

        setTransactions(convertedTxs);

        // 6. Run alerts on the merged, base-currency (USD) data
        detectAlerts(sortedTxs);
      }
    } catch (err) {
      console.error("❌ Supabase Fetch Error:", err);
      toast.error("Failed to load transactions");
      if (mountedRef.current) {
        setError("Failed to load transactions.");
        setTransactions([]);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [user, selectedCurrency, detectAlerts, fetchMpesaTransactions]);


  // ---- 3️⃣ ADD TRANSACTION (Supabase only) ----
  const addTransaction = useCallback(async (tx) => {
    if (!user?.id) return;

    setError(null);
    setLoading(true);

    try {
      // Ensure the amount is converted to USD before insertion
      const amountInUSD = convertCurrency(tx.amount, tx.currency, "USD");

      const payload = {
        ...tx,
        amount: amountInUSD,
        currency: "USD",
        user_id: user.id,
      };
      // The database schema likely expects 'currency' to be fixed as 'USD' or omitted
      delete payload.currency;

      const { data, error } = await supabase
        .from("transactions")
        .insert([payload])
        .select();

      if (error) throw error;

      const newTx = data[0];
      // Get all current transactions (including M-Pesa) to run alerts on the full set
      const allCurrentTxs = mapToUSDForAlerts(transactions);

      if (mountedRef.current) {
        // Optimistically update the state with the new transaction converted to display currency
        const convertedNewTx = mapToDisplayCurrency([newTx], selectedCurrency)[0];

        setTransactions(prev => {
          const updated = [convertedNewTx, ...prev].sort(
            (a, b) => new Date(b.date) - new Date(a.date)
          );
          return updated;
        });
        toast.success("Transaction added!");

        // Run alerts on the new full base-currency transaction list
        detectAlerts([newTx, ...allCurrentTxs]);
      }
    } catch (err) {
      console.error("❌ Supabase Add Error:", err);
      toast.error("Failed to add transaction");
      if (mountedRef.current) setError("Failed to add transaction.");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [user, selectedCurrency, transactions, detectAlerts]);

  // ---- 4️⃣ ADD LOCAL TRANSACTION (For temporary M-Pesa display) ----
  // This logic is mostly redundant now that fetchMpesaTransactions handles merging.
  // It's kept here for potential manual, non-Supabase transactions (e.g., pending/local only).
  const addLocalTransaction = useCallback((tx) => {
    if (!tx) return;

    // Assuming local tx 'amount' is already in USD or the base currency of the tx.currency field
    const convertedTx = mapToDisplayCurrency([tx], selectedCurrency)[0];

    setTransactions((prev) => {
      // Ensure the transaction has a unique, non-Supabase ID
      const localId = convertedTx.id || `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      convertedTx.id = localId;

      // Prevent adding duplicates
      const exists = prev.some((t) => t.id === convertedTx.id);
      if (exists) return prev;

      return [convertedTx, ...prev].sort(
        (a, b) => new Date(b.date) - new Date(a.date)
      );
    });
    // NOTE: Alerts are NOT run on local transactions as they are not persisted/normalized base-currency data.
  }, [selectedCurrency]);

  // ---- 5️⃣ UPDATE TRANSACTION (Supabase only) ----
  const updateTransaction = useCallback(async (id, updates) => {
    if (!user?.id) return;
    setError(null);

    // Skip update for non-Supabase transactions (e.g., M-Pesa)
    if (id && id.startsWith("mpesa-")) {
      toast.info("M-Pesa transactions cannot be directly updated.");
      return;
    }

    try {
      const updatedPayload = { ...updates };
      // Convert amount to USD if it was updated
      if (updates.amount && updates.currency) {
        updatedPayload.amount = parseFloat(
          convertCurrency(updates.amount, updates.currency, "USD").toFixed(2)
        );
        updatedPayload.currency = "USD";
        delete updatedPayload.currency;
      }

      const { data, error } = await supabase
        .from("transactions")
        .update(updatedPayload)
        .eq("id", id)
        .eq("user_id", user.id)
        .select();

      if (error) throw error;

      if (data?.length && mountedRef.current) {
        const updatedTx = data[0];
        const convertedUpdatedTx = mapToDisplayCurrency([updatedTx], selectedCurrency)[0];

        // Prepare the full list for alerts
        const newTxsForAlerts = mapToUSDForAlerts(transactions.map(tx =>
          tx.id === id ? updatedTx : tx // Use the base-currency updatedTx
        ));

        setTransactions(prev => prev.map((tx) =>
          tx.id === id ? convertedUpdatedTx : tx // Use the display-currency version for state
        ));
        toast.success("Transaction updated!");
        detectAlerts(newTxsForAlerts);
      }
    } catch (err) {
      console.error("❌ Supabase Update Error:", err);
      toast.error("Failed to update transaction");
      if (mountedRef.current) setError("Failed to update transaction.");
    }
  }, [user, selectedCurrency, transactions, detectAlerts]);

  // ---- 6️⃣ DELETE TRANSACTION (Supabase only) ----
  const deleteTransaction = useCallback(async (id) => {
    if (!user?.id) return;
    setError(null);

    // Skip delete for non-Supabase transactions (e.g., M-Pesa)
    if (id && id.startsWith("mpesa-")) {
      toast.info("M-Pesa transactions cannot be deleted directly.");
      return;
    }

    try {
      const { error } = await supabase
        .from("transactions")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) throw error;

      if (mountedRef.current) {
        const remainingTxs = transactions.filter((tx) => tx.id !== id);
        setTransactions(remainingTxs);
        toast.info("Transaction deleted");
        // Run alerts on the remaining base-currency transaction list
        detectAlerts(mapToUSDForAlerts(remainingTxs));
      }
    } catch (err) {
      console.error("❌ Delete Error:", err);
      toast.error("Failed to delete transaction");
      if (mountedRef.current) setError("Failed to delete transaction.");
    }
  }, [user, transactions, detectAlerts]);

  // ---- 7️⃣ REAL-TIME SUBSCRIPTIONS ----
  useEffect(() => {
    if (!user?.id) return;

    // Use a unique channel name based on user id
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
          // console.log("⚡ Realtime update:", payload.eventType);
          // Debounce the fetch call to prevent rapid database hits
          clearTimeout(window._fetchDebounce);
          window._fetchDebounce = setTimeout(() => {
            fetchTransactions();
          }, 800);
        }
      )
      .subscribe();

    return () => {
      clearTimeout(window._fetchDebounce);
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchTransactions]);

  // ---- 8️⃣ INITIAL FETCH & AUTO-SYNC M-PESA ----
  useEffect(() => {
    if (user?.id) {
      // 1. Initial fetch of all transactions (Supabase + M-Pesa)
      fetchTransactions();

      // 2. Set up periodic M-Pesa sync (e.g., every 5 minutes)
      const MpesaSyncInterval = 5 * 60 * 1000; // 5 minutes
      const intervalId = setInterval(() => {
          // Only fetch M-Pesa transactions, then let fetchTransactions handle the full merge
          fetchTransactions();
      }, MpesaSyncInterval);

      return () => clearInterval(intervalId);
    }
  }, [user?.id, fetchTransactions]);


  return {
    transactions,
    loading,
    error,
    addTransaction,
    fetchTransactions, // Use this for refreshing the list (Supabase + M-Pesa)
    addLocalTransaction,
    updateTransaction,
    deleteTransaction,
    // The M-Pesa specific function is now integrated into fetchTransactions,
    // but can be exported for explicit manual sync if needed.
    fetchMpesaTransactions,
  };
};
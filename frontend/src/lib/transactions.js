// import { useState, useEffect, useCallback } from "react";
// // IMPORTANT: This path must match where your Supabase client is located
// import { supabase } from "@/lib/supabaseClient"; 

// /**
//  * useTransactions Hook
//  * Manages fetching, state synchronization, and CRUD operations for user transactions.
//  * All operations are scoped to the provided user.id, ensuring per-user persistence.
//  * @param {object} user - The user object containing the 'id' (from useAuth).
//  */
// export const useTransactions = (user) => {
//   const [transactions, setTransactions] = useState([]);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState(null);

//   // 1. FETCH TRANSACTIONS
//   const fetchTransactions = useCallback(async () => {
//     if (!user?.id) {
//       setTransactions([]);
//       setLoading(false);
//       return;
//     }

//     setLoading(true);
//     setError(null);
    
//     // Fetch user-specific data
//     const { data, error } = await supabase
//       .from("transactions")
//       .select("*")
//       .eq("user_id", user.id) // Filter by the current user's ID
//       .order("date", { ascending: false });

//     if (error) {
//       console.error("Supabase Fetch Error:", error);
//       setError("Failed to load transactions.");
//     } else {
//       setTransactions(data || []);
//     }
//     setLoading(false);
//   }, [user]);

//   // 2. CREATE (Add) TRANSACTION
//   const addTransaction = async (tx) => {
//     setError(null);
//     setLoading(true);
//     const payload = { ...tx, user_id: user.id };

//     const { data, error } = await supabase
//       .from("transactions")
//       .insert([payload])
//       .select(); 

//     if (error) {
//       console.error("Supabase Add Error:", error);
//       setError("Failed to add transaction.");
//       setLoading(false);
//       return;
//     }

//     // Update local state with the newly inserted item
//     const newTx = data[0];
//     setTransactions((prev) => 
//       [newTx, ...prev].sort((a, b) => new Date(b.date) - new Date(a.date))
//     ); 
//     setLoading(false);
//   };

//   // 3. UPDATE TRANSACTION
//   const updateTransaction = async (id, updates) => {
//     setError(null);
//     const { data, error } = await supabase
//       .from("transactions")
//       .update(updates)
//       .eq("id", id)
//       .eq("user_id", user.id) // Security check
//       .select();

//     if (error) {
//       console.error("Supabase Update Error:", error);
//       setError("Failed to update transaction.");
//       return;
//     }

//     // Update local state
//     const updatedTx = data[0];
//     setTransactions((prev) =>
//       prev.map((tx) => (tx.id === id ? updatedTx : tx))
//     );
//   };

//   // 4. DELETE TRANSACTION
//   const deleteTransaction = async (id) => {
//     setError(null);
//     const { error } = await supabase
//       .from("transactions")
//       .delete()
//       .eq("id", id)
//       .eq("user_id", user.id); // Security check

//     if (error) {
//       console.error("Supabase Delete Error:", error);
//       setError("Failed to delete transaction.");
//       return;
//     }

//     // Update local state
//     setTransactions((prev) => prev.filter((tx) => tx.id !== id));
//   };

//   // Initial data fetch on component mount or user change
//   useEffect(() => {
//     fetchTransactions();
//   }, [fetchTransactions]);

//   return {
//     transactions,
//     loading,
//     error,
//     fetchTransactions,
//     addTransaction,
//     updateTransaction,
//     deleteTransaction,
//   };
// };

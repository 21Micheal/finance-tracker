// // src/components/Transactions/TransactionsTable.jsx
// import React, { useState, useCallback, useMemo } from "react";
// import { useTransactions } from "@/hooks/useTransactions";
// import { useAuth } from "@/context/AuthContext";
// // Merged: Use formatCurrency from a utility instead of useCurrency context (as per the second file)
// // NOTE: I am assuming `formatCurrency` is the intended replacement for `useCurrency().format`
// // However, the original file used `useCurrency` which provides `currency` and `format`.
// // To keep the function call signature consistent with the second file's logic, I will rely only on `formatCurrency`.
// // If your actual `formatCurrency` utility requires a specific currency, you'll need to pass it.
// // Since the second file removed `useCurrency`, I'll use the utility directly.
// import { formatCurrency } from "@/utils/formatCurrency";
// // Merged: Use icons from the second file (Pencil/Edit2)
// import { Pencil, Trash2, Plus } from "lucide-react";
// // Merged: Use the updated Button and Badge components
// import { Button } from "@/components/ui/Button";
// import { Badge } from "@/components/ui/badge";
// import AddTransactionModal from "./AddTransactionModal";
// import EditTransactionModal from "./EditTransactionModal";

// export default function TransactionsTable() {
//   const { user } = useAuth();
//   const {
//     transactions,
//     loading,
//     error,
//     addTransaction,
//     updateTransaction,
//     deleteTransaction,
//   } = useTransactions(user);

//   const [isAddOpen, setAddOpen] = useState(false);
//   const [editTx, setEditTx] = useState(null);

//   // Early return when user not logged in
//   if (!user) return null;

//   /**
//    * Derived memoized values
//    * Merged: Used the `hasTransactions` check and kept transactions sorted by date descending.
//    */
//   const sortedTransactions = useMemo(() => {
//     const sortedTx = [...(transactions || [])].sort(
//       (a, b) => new Date(b.date) - new Date(a.date)
//     );
//     return sortedTx;
//   }, [transactions]);

//   const hasTransactions = useMemo(() => sortedTransactions.length > 0, [sortedTransactions]);

//   /**
//    * Handlers memoized and merged with transaction logic
//    */
//   const handleAdd = useCallback(async (data) => {
//     await addTransaction(data);
//     setAddOpen(false);
//   }, [addTransaction]);

//   const handleEdit = useCallback((tx) => setEditTx(tx), []);
//   const handleUpdate = useCallback(async (data) => {
//     await updateTransaction(data);
//     setEditTx(null);
//   }, [updateTransaction]);

//   const handleDelete = useCallback(async (id) => {
//     // Confirmation prompt (optional but good practice)
//     if (window.confirm("Are you sure you want to delete this transaction?")) {
//         await deleteTransaction(id);
//     }
//   }, [deleteTransaction]);

//   return (
//     // Merged: Used the updated styling from the second file
//     <section className="p-6 bg-white/80 dark:bg-slate-900/70 backdrop-blur rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
//       {/* Header */}
//       <div className="flex justify-between items-center mb-6">
//         <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
//           Transactions
//         </h2>
//         <Button
//           onClick={() => setAddOpen(true)}
//           className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
//         >
//           <Plus className="w-4 h-4" />
//           Add Transaction
//         </Button>
//       </div>

//       {/* States */}
//       {loading && (
//         <div className="text-center py-8 text-slate-500 dark:text-slate-400 animate-pulse">
//           Loading transactions...
//         </div>
//       )}

//       {error && (
//         <div className="text-center py-8 text-red-600 dark:text-red-400">
//           ⚠️ Failed to load transactions: {error}
//         </div>
//       )}

//       {!loading && !hasTransactions && (
//         <div className="text-center py-10 text-slate-500 dark:text-slate-400">
//           No transactions yet. Add one to get started.
//         </div>
//       )}

//       {/* Transactions Table */}
//       {hasTransactions && !loading && (
//         // Merged: Updated table styling and structure
//         <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
//           <table className="min-w-full text-sm text-slate-700 dark:text-slate-300">
//             <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 uppercase text-xs">
//               <tr>
//                 <th className="px-4 py-3 text-left font-semibold">Date</th>
//                 <th className="px-4 py-3 text-left font-semibold">Category</th>
//                 <th className="px-4 py-3 text-left font-semibold">Description</th>
//                 <th className="px-4 py-3 text-left font-semibold">Type</th>
//                 <th className="px-4 py-3 text-right font-semibold">Amount</th>
//                 <th className="px-4 py-3 text-right">Actions</th>
//               </tr>
//             </thead>
//             <tbody>
//               {sortedTransactions.map((tx, i) => (
//                 <tr
//                   key={tx.id}
//                   className={`${
//                     i % 2 === 0
//                       ? "bg-white dark:bg-slate-900"
//                       : "bg-slate-50 dark:bg-slate-800"
//                   } hover:bg-slate-100 dark:hover:bg-slate-800/70 transition`}
//                 >
//                   <td className="px-4 py-3">
//                     {new Date(tx.date).toLocaleDateString()}
//                   </td>
//                   <td className="px-4 py-3">
//                     {/* Merged: Use Badge component */}
//                     <Badge variant="outline" className="capitalize">
//                       {tx.category || "Uncategorized"}
//                     </Badge>
//                   </td>
//                   <td className="px-4 py-3 text-slate-500 dark:text-slate-400 truncate max-w-[160px]">
//                      {/* Merged: Kept description column */}
//                     {tx.description || "—"}
//                   </td>
//                   <td className="px-4 py-3">
//                     {/* Merged: Use Badge component for type styling */}
//                     <Badge
//                       variant={tx.type === "income" ? "default" : "destructive"}
//                       className={
//                         tx.type === "income"
//                           ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
//                           : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
//                       }
//                     >
//                       {tx.type.charAt(0).toUpperCase() + tx.type.slice(1)}
//                     </Badge>
//                   </td>
//                   <td
//                     className={`px-4 py-3 text-right font-semibold ${
//                       tx.type === "income" ? "text-green-600" : "text-red-500"
//                     }`}
//                   >
//                     {/* Merged: Use formatCurrency utility */}
//                     {formatCurrency(tx.amount, tx.currency)}
//                   </td>
//                   <td className="px-4 py-3 text-right">
//                     <div className="flex justify-end gap-2">
//                       <Button
//                         variant="ghost"
//                         size="icon"
//                         onClick={() => handleEdit(tx)}
//                         className="text-slate-600 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400"
//                       >
//                         <Pencil className="w-4 h-4" />
//                       </Button>
//                       <Button
//                         variant="ghost"
//                         size="icon"
//                         onClick={() => handleDelete(tx.id)}
//                         className="text-slate-600 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400"
//                       >
//                         <Trash2 className="w-4 h-4" />
//                       </Button>
//                     </div>
//                   </td>
//                 </tr>
//               ))}
//             </tbody>
//           </table>
//         </div>
//       )}

//       {/* Modals */}
//       {isAddOpen && (
//         <AddTransactionModal
//           isOpen={isAddOpen}
//           onClose={() => setAddOpen(false)}
//           addTransaction={handleAdd} // Use memoized handler
//         />
//       )}

//       {editTx && (
//         <EditTransactionModal
//           isOpen={!!editTx}
//           onClose={() => setEditTx(null)}
//           transaction={editTx}
//           updateTransaction={handleUpdate} // Use memoized handler
//         />
//       )}
//     </section>
//   );
// }
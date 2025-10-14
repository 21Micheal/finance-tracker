// pages/TransactionsPage.jsx
import React, { useState, useCallback, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { useTransactions } from "@/hooks/useTransactions";
import { useCurrency } from "@/context/CurrencyContext";
import TransactionsView from "@/pages/transactions/TransactionsView";
import { AddTransactionModal } from "@/pages/transactions/AddTransactionModal";
import { EditTransactionModal } from "@/pages/transactions/EditTransactionModal";

export default function TransactionsPage() {
  const { user } = useAuth();
  const { currency } = useCurrency();
  const {
    transactions,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    loading,
    error,
  } = useTransactions(user);

  const [showAddModal, setShowAddModal] = useState(false);
  const [editTx, setEditTx] = useState(null);

  /**
   * Handlers and Logic
   * Use `useCallback` to prevent unnecessary re-renders of child components.
   * Modals now handle the actual API calls and close themselves upon success.
   */

  // Open/Close handlers for modals (kept simple for direct state manipulation)
  const handleAddOpen = useCallback(() => setShowAddModal(true), []);
  const handleAddClose = useCallback(() => setShowAddModal(false), []);
  const handleEditOpen = useCallback((tx) => setEditTx(tx), []);
  const handleEditClose = useCallback(() => setEditTx(null), []);

  // Transaction API call wrappers
  const handleAdd = useCallback(async (txData) => {
    await addTransaction(txData);
    handleAddClose(); // Close on successful add
  }, [addTransaction, handleAddClose]);

  const handleUpdate = useCallback(async (txData) => {
    await updateTransaction(txData);
    handleEditClose(); // Close on successful update
  }, [updateTransaction, handleEditClose]);

  const handleDelete = useCallback(async (txId) => {
    await deleteTransaction(txId);
  }, [deleteTransaction]);

  /**
   * Header component memoized
   */
  const header = useMemo(() => (
    <div className="flex justify-between items-center">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
        Transaction History
      </h1>
      <button
        onClick={handleAddOpen}
        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-colors focus:ring-2 focus:ring-indigo-400 focus:outline-none"
      >
        + Add Transaction
      </button>
    </div>
  ), [handleAddOpen]);

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-900 p-6">
      <section className="max-w-7xl mx-auto space-y-6">
        {/* === Header === */}
        {header}

        {/* === Transactions View (Handles its own loading/error/empty states) === */}
        <TransactionsView
          transactions={transactions}
          loading={loading}
          error={error}
          onEdit={handleEditOpen}
          onDelete={handleDelete}
          currency={currency}
          onAddOpen={handleAddOpen} // Pass the handler for the Empty State button
        />

        {/* === Modals === */}
        {showAddModal && (
          <AddTransactionModal
            onClose={handleAddClose}
            onAdd={handleAdd}
          />
        )}

        {editTx && (
          <EditTransactionModal
            transaction={editTx}
            onClose={handleEditClose}
            onUpdate={handleUpdate}
          />
        )}
      </section>
    </main>
  );
}
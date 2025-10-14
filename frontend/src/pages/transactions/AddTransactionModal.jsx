// src/pages/transactions/AddTransactionModal.jsx
import React, { useState, useEffect } from "react";
import { getExchangeRate } from "@/utils/currencyUtils"; 
import { useCurrency } from "@/context/CurrencyContext";

export function AddTransactionModal({ onClose, onAdd }) {
  const { currency: selectedCurrency } = useCurrency();

  const [type, setType] = useState("expense");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Other");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [convertedValue, setConvertedValue] = useState(null);

  // 🔁 FIXED: Update conversion preview dynamically
  useEffect(() => {
    if (amount && !isNaN(amount) && selectedCurrency !== "USD") {
      const inputAmount = parseFloat(amount);
      
      // 🔑 CORRECTED LOGIC: Convert input amount from selectedCurrency to USD
      // Amount in USD = Input Amount × Rate_from_Selected_to_USD
      const rateFromSelectedToUSD = getExchangeRate(selectedCurrency, "USD");
      
      console.log(`Converting ${inputAmount} ${selectedCurrency} to USD using rate: ${rateFromSelectedToUSD}`);
      
      if (!rateFromSelectedToUSD || rateFromSelectedToUSD === 0) {
          setConvertedValue(null); 
      } else {
          // MULTIPLICATION converts the input amount (in selectedCurrency) to USD
          const usdValue = (inputAmount * rateFromSelectedToUSD).toFixed(2);
          setConvertedValue(`≈ $${usdValue} USD`);
      }
    } else {
      setConvertedValue(null);
    }
  }, [amount, selectedCurrency]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!amount) return;

    console.log(`Submitting: ${amount} ${selectedCurrency}`);

    // Pass the amount (in selectedCurrency) and the currency code to the hook (onAdd)
    await onAdd({
      type,
      description: description.trim() || "Untitled",
      amount: parseFloat(amount), // This is the amount in selectedCurrency
      category,
      date,
      // 🔑 CRITICAL: Pass the selected currency to the hook for correct conversion
      currency: selectedCurrency,
    });

    // Reset and close
    setDescription("");
    setAmount("");
    setCategory("Other");
    setType("expense");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-xl font-semibold mb-4 text-slate-800 dark:text-white">
          Add Transaction
        </h2>

        {/* Type toggle */}
        <div className="flex space-x-2 mb-4">
          {["income", "expense"].map((option) => (
            <button
              key={option}
              onClick={() => setType(option)}
              className={`flex-1 py-2 rounded-md font-medium transition ${
                type === option
                  ? option === "income"
                    ? "bg-green-600 text-white"
                    : "bg-red-600 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
              }`}
            >
              {option.charAt(0).toUpperCase() + option.slice(1)}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Dinner at The Bistro"
              className="w-full px-3 py-2 border rounded-lg dark:bg-slate-800 dark:text-white"
            />
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">
              Amount ({selectedCurrency})
            </label>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              className="w-full px-3 py-2 border rounded-lg dark:bg-slate-800 dark:text-white"
            />
            {convertedValue && (
              <p className="text-xs text-slate-500 mt-1">
                {convertedValue}
              </p>
            )}
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg dark:bg-slate-800 dark:text-white"
            >
              <option>Food</option>
              <option>Transport</option>
              <option>Shopping</option>
              <option>Bills</option>
              <option>Entertainment</option>
              <option>Other</option>
            </select>
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="w-full px-3 py-2 border rounded-lg dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md"
            >
              Add Transaction
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
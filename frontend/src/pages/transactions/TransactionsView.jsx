import React, { useState, useMemo, useCallback } from "react";
import {
  Pencil, Trash2, Download, Filter, Search,
  ChevronDown, ChevronUp
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/cards";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
// 🔑 Import the currency conversion utility
import { convertCurrency, formatCurrency } from "@/utils/currencyUtils";

// ✅ Utility: case-insensitive match
const matches = (field, value) => field?.toLowerCase().includes(value.toLowerCase());

export default function TransactionsView({
  transactions = [],
  loading,
  error,
  onEdit,
  onDelete,
  currency, // This is the selected display currency (e.g., 'USD', 'EUR')
}) {
  // --- State ---
  const [filters, setFilters] = useState({
    search: "",
    category: "All",
    type: "All",
    startDate: "",
    endDate: ""
  });
  const [sort, setSort] = useState({ key: "date", direction: "desc" });
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const itemsPerPage = 10;

  // --- Derived lists ---
  const categories = useMemo(
    () => ["All", ...new Set(transactions.map(t => t.category || "Uncategorized"))],
    [transactions]
  );

  const types = useMemo(
    () => ["All", ...new Set(transactions.map(t => t.type))],
    [transactions]
  );

  // --- Filter, Sort, Paginate ---
  const { filtered, totalPages, paginated } = useMemo(() => {
    let data = transactions.filter(tx => {
      const f = filters;
      return (
        (f.category === "All" || tx.category === f.category) &&
        (f.type === "All" || tx.type === f.type) &&
        (!f.search || matches(tx.description, f.search) || matches(tx.category, f.search)) &&
        (!f.startDate || new Date(tx.date) >= new Date(f.startDate)) &&
        (!f.endDate || new Date(tx.date) <= new Date(f.endDate))
      );
    });

    // Sort
    data.sort((a, b) => {
      const { key, direction } = sort;
      let aVal = key === "date" ? new Date(a[key]) : key === "amount" ? +a[key] : a[key];
      let bVal = key === "date" ? new Date(b[key]) : key === "amount" ? +b[key] : b[key];
      return direction === "asc" ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
    });

    // Paginate
    const totalPages = Math.ceil(data.length / itemsPerPage);
    const paginated = data.slice((page - 1) * itemsPerPage, page * itemsPerPage);

    return { filtered: data, totalPages, paginated };
  }, [transactions, filters, sort, page]);

  // --- Handlers ---
  const handleSort = useCallback(key => {
    setSort(s => ({
      key,
      direction: s.key === key && s.direction === "asc" ? "desc" : "asc"
    }));
    setPage(1);
  }, []);

  const handleExport = useCallback(() => {
    const csv = [
      ["Date", "Description", "Category", "Type", "Amount", "Currency"],
      ...filtered.map(tx => {
        // Convert for export consistency
        const displayAmount = convertCurrency(tx.amount, "USD", currency);
        return [
          new Date(tx.date).toLocaleDateString(),
          tx.description || "",
          tx.category || "",
          tx.type,
          displayAmount.toFixed(2), // Use raw number for spreadsheets
          currency // Use the display currency code
        ]
      })
    ].map(row => row.map(f => `"${f}"`).join(",")).join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `transactions_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }, [filtered, currency]);

  const resetFilters = useCallback(() => {
    setFilters({ search: "", category: "All", type: "All", startDate: "", endDate: "" });
    setSort({ key: "date", direction: "desc" });
    setPage(1);
  }, []);

  const getSortIcon = key =>
    sort.key === key
      ? sort.direction === "asc"
        ? <ChevronUp className="w-4 h-4 text-indigo-600" />
        : <ChevronDown className="w-4 h-4 text-indigo-600" />
      : <ChevronDown className="w-4 h-4 opacity-40" />;

  // --- Loading / Error States ---
  if (loading)
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-500">
        <div className="animate-spin h-8 w-8 border-b-2 border-indigo-600 rounded-full mb-2"></div>
        Loading transactions...
      </div>
    );

  if (error)
    return (
      <div className="text-center py-12">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6 max-w-md mx-auto">
          <p className="text-red-600 dark:text-red-400 font-medium">Error Loading Transactions</p>
          <p className="text-red-500 dark:text-red-300 text-sm mt-1">{error}</p>
        </div>
      </div>
    );

  // --- Render ---
  return (
    <div className="space-y-6">
      {/* Header (omitted for brevity) */}
      <Card className="bg-white/70 backdrop-blur-lg border border-gray-100">
        <CardHeader>
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <CardTitle className="text-xl font-bold text-slate-800">Transaction History</CardTitle>
              <p className="text-slate-500 text-sm">
                {filtered.length} transaction{filtered.length !== 1 ? "s" : ""} found
              </p>
            </div>

            <div className="flex flex-wrap gap-3 items-center">
              {/* Search */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search transactions..."
                  value={filters.search}
                  onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
                  className="pl-10 pr-4 py-2 rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-indigo-500 w-64"
                />
              </div>

              <Button variant="outline" onClick={() => setShowFilters(v => !v)} className="flex items-center gap-2">
                <Filter className="w-4 h-4" />
                Filters
                {(filters.category !== "All" || filters.type !== "All" || filters.startDate || filters.endDate) && (
                  <Badge variant="secondary" className="ml-1">!</Badge>
                )}
              </Button>

              <Button
                onClick={handleExport}
                disabled={!filtered.length}
                className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>

        {/* Filters (omitted for brevity) */}
        <AnimatePresence>
          {showFilters && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                  {[
                    { label: "Category", value: filters.category, onChange: v => setFilters(f => ({ ...f, category: v })), options: categories },
                    { label: "Type", value: filters.type, onChange: v => setFilters(f => ({ ...f, type: v })), options: types },
                  ].map(({ label, value, onChange, options }) => (
                    <div key={label}>
                      <label className="text-sm font-medium text-slate-700 mb-2 block">{label}</label>
                      <select
                        value={value}
                        onChange={e => onChange(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                      >
                        {options.map(o => <option key={o}>{o}</option>)}
                      </select>
                    </div>
                  ))}

                  {["startDate", "endDate"].map(field => (
                    <div key={field}>
                      <label className="text-sm font-medium text-slate-700 mb-2 block">
                        {field === "startDate" ? "Start Date" : "End Date"}
                      </label>
                      <input
                        type="date"
                        value={filters[field]}
                        onChange={e => setFilters(f => ({ ...f, [field]: e.target.value }))}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                      />
                    </div>
                  ))}

                  <div className="md:col-span-4 flex justify-end">
                    <Button variant="outline" onClick={resetFilters}>Reset Filters</Button>
                  </div>
                </div>
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      {/* Table */}
      <Card className="bg-white/70 backdrop-blur-lg border border-gray-100">
        <CardContent className="p-0">
          {!paginated.length ? (
            <div className="text-center py-12">
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-8 max-w-md mx-auto">
                <Filter className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                <p className="text-slate-500 font-medium">No transactions found</p>
                <p className="text-slate-400 text-sm mt-1">
                  {transactions.length === 0
                    ? "No transactions available. Add your first transaction to get started."
                    : "Try adjusting your filters."}
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      {[
                        { key: "date", label: "Date" },
                        { key: "description", label: "Description" },
                        { key: "category", label: "Category" },
                        { key: "type", label: "Type" },
                        { key: "amount", label: "Amount" },
                        { key: "actions", label: "Actions" },
                      ].map(({ key, label }) => (
                        <th key={key} className="p-4 text-left text-sm font-semibold text-slate-700">
                          {key !== "actions" ? (
                            <button onClick={() => handleSort(key)} className="flex items-center gap-1">
                              {label} {getSortIcon(key)}
                            </button>
                          ) : label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence>
                      {paginated.map((tx, i) => {
                        // 🔑 Currency Conversion Logic
                        const displayAmount = convertCurrency(tx.amount, "USD", currency);
                        const formatted = formatCurrency(displayAmount, currency);

                        return (
                          <motion.tr
                            key={tx.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.15, delay: i * 0.02 }}
                            className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                          >
                            <td className="p-4 text-slate-700">{new Date(tx.date).toLocaleDateString()}</td>
                            <td className="p-4 text-slate-800 font-medium">{tx.description || "—"}</td>
                            <td className="p-4">
                              <Badge variant="outline" className="bg-slate-100">
                                {tx.category || "Uncategorized"}
                              </Badge>
                            </td>
                            <td className="p-4">
                              <Badge
                                variant={tx.type === "income" ? "default" : "destructive"}
                                className={tx.type === "income"
                                  ? "bg-green-100 text-green-800"
                                  : "bg-red-100 text-red-800"}
                              >
                                {tx.type.charAt(0).toUpperCase() + tx.type.slice(1)}
                              </Badge>
                            </td>
                            {/* 🔑 Amount Display: Use the converted and formatted value */}
                            <td className={`p-4 text-right font-semibold ${tx.type === "expense" ? "text-red-600" : "text-green-600"}`}>
                              {formatted}
                              {/* 🐛 Debugging Helper Line */}
                              <p className="text-xs text-slate-500 mt-0.5">
                                Stored: {formatCurrency(tx.amount, "USD")}
                              </p>
                            </td>
                            <td className="p-4 flex gap-1 justify-center">
                              <Button variant="ghost" size="icon" onClick={() => onEdit(tx)}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => onDelete(tx.id)}>
                                <Trash2 className="w-4 h-4 text-red-500" />
                              </Button>
                            </td>
                          </motion.tr>
                        );
                      })}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>

              {/* Pagination (omitted for brevity) */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t border-slate-200">
                  <p className="text-sm text-slate-500">
                    Showing {(page - 1) * itemsPerPage + 1}–
                    {Math.min(page * itemsPerPage, filtered.length)} of {filtered.length}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                      Previous
                    </Button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => (
                      <Button
                        key={i}
                        variant={page === i + 1 ? "default" : "outline"}
                        size="sm"
                        onClick={() => setPage(i + 1)}
                      >
                        {i + 1}
                      </Button>
                    ))}
                    <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
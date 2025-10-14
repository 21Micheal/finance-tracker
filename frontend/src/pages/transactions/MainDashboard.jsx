import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useTransactions } from "@/hooks/useTransactions";
import { useCurrency } from "@/context/CurrencyContext";
import { BudgetAlerts } from '@/components/BudgetAlerts';
import { BUDGET_CATEGORIES, DEFAULT_SPENDING_CAPS } from '@/utils/budgetService';
import { Button } from "@/components/ui/Button";
import DashboardView from "@/pages/transactions/DashboardView";
import TransactionsView from "@/pages/transactions/TransactionsView";
import SettingsView from "@/pages/transactions/SettingsView";
import { AddTransactionModal } from "@/pages/transactions/AddTransactionModal";
import { EditTransactionModal } from "@/pages/transactions/EditTransactionModal";
import { generateAIInsights } from "@/lib/aiInsights";
import { motion, AnimatePresence } from "framer-motion";
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";
import { 
  Wallet, 
  TrendingUp, 
  TrendingDown, 
  BarChart3, 
  ListOrdered, 
  Settings, 
  Brain, 
  Lightbulb, 
  Loader2, 
  FileDown, 
  ChevronDown, 
  ChevronUp,
  AlertCircle
} from "lucide-react";
import jsPDF from "jspdf";

export default function TransactionsDashboard() {
  const [view, setView] = useState("dashboard");
  const [savingsGoal, setSavingsGoal] = useState(() => {
    return parseFloat(localStorage.getItem("savingsGoal")) || 5000;
  });
  const [showAddModal, setShowAddModal] = useState(false);
  const [editTx, setEditTx] = useState(null);
  const [showInsight, setShowInsight] = useState(null);
  const [aiInsights, setAIInsights] = useState(null);
  const [aiLoading, setAILoading] = useState(false);
  const [aiError, setAIError] = useState("");
  const [expanded, setExpanded] = useState({
    trends: true,
    tips: false,
    summary: true,
  });
  // Add spending caps state
  const [spendingCaps, setSpendingCaps] = useState(() => {
    const saved = localStorage.getItem('spendingCaps');
    return saved ? JSON.parse(saved) : DEFAULT_SPENDING_CAPS;
  });

  const { user } = useAuth();
  const { currency, format } = useCurrency(); // Updated: use format instead of rate
  const { transactions, addTransaction, updateTransaction, deleteTransaction, loading, error } =
    useTransactions(user);

  // Persist savings goal
  useEffect(() => {
    localStorage.setItem("savingsGoal", savingsGoal);
  }, [savingsGoal]);

  // Calculate summary data
  const summary = useMemo(() => {
    const income = transactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);
    const expense = transactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);
    const balance = income - expense;
    return { income, expense, balance };
  }, [transactions]);

  // Format transactions with currency using the format function
  const formattedTransactions = useMemo(() => 
    transactions.map((tx) => ({
      ...tx,
      amountFormatted: format(tx.amount), // Updated: use format
    })),
    [transactions, format]
  );

  // AI Insights Handler with proper error handling
  const handleGenerateInsights = async () => {
    setAILoading(true);
    setAIError("");
    setAIInsights(null);
    
    try {
      const insightsData = await generateAIInsights(transactions, currency);
      console.log("AI Insights Response:", insightsData);
      
      if (insightsData) {
        // Build comprehensive insights using all available data
        const trendsContent = [
          insightsData.spending_overview,
          insightsData.trend_analysis
        ].filter(text => text && text.trim() !== '').join('\n\n');

        const tipsContent = [
          ...(insightsData.recommendations || []),
          ...(insightsData.alerts || [])
        ].filter(tip => tip && tip.trim() !== '');

        const summaryContent = insightsData.savings_analysis;

        const transformedInsights = {
          trends: trendsContent || "No trend analysis available for your transactions.",
          tips: tipsContent.length > 0 ? `• ${tipsContent.join('\n• ')}` : "No specific recommendations available at this time.",
          summary: summaryContent || "No summary analysis available."
        };
        
        console.log("Final Insights to Display:", transformedInsights);
        setAIInsights(transformedInsights);
      } else {
        setAIError("No insights data received from AI service.");
      }
    } catch (err) {
      const errorMessage = err.message || "Failed to generate insights. Please try again.";
      setAIError(errorMessage);
      console.error("Generate Insights Failed:", err);
    } finally {
      setAILoading(false);
    }
  };

  const toggleSection = (section) => {
    setExpanded((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const handleExportPDF = () => {
    if (!aiInsights) return;
    
    const doc = new jsPDF();
    
    // Header
    doc.setFont("helvetica", "bold");
    doc.setTextColor(79, 70, 229); // Indigo color
    doc.setFontSize(18);
    doc.text("AI Financial Insights Report", 14, 20);
    
    // Date and details
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139); // Slate color
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 30);
    doc.text(`Currency: ${currency.toUpperCase()}`, 14, 36);
    
    // Insights content
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42); // Dark slate
    
    let startY = 50;
    
    // Trends section
    doc.setFont("helvetica", "bold");
    doc.text("Spending Trends", 14, startY);
    doc.setFont("helvetica", "normal");
    const trendsLines = doc.splitTextToSize(aiInsights.trends || "No trend data available.", 180);
    doc.text(trendsLines, 14, startY + 8);
    startY += trendsLines.length * 6 + 20;
    
    // Tips section
    doc.setFont("helvetica", "bold");
    doc.text("Improvement Tips", 14, startY);
    doc.setFont("helvetica", "normal");
    const tipsLines = doc.splitTextToSize(aiInsights.tips || "No tips available.", 180);
    doc.text(tipsLines, 14, startY + 8);
    startY += tipsLines.length * 6 + 20;
    
    // Summary section
    doc.setFont("helvetica", "bold");
    doc.text("Summary", 14, startY);
    doc.setFont("helvetica", "normal");
    const summaryLines = doc.splitTextToSize(aiInsights.summary || "No summary available.", 180);
    doc.text(summaryLines, 14, startY + 8);
    
    // Footer
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text("Generated by FinTrack AI Assistant", 14, doc.internal.pageSize.height - 10);
    
    doc.save("AI_Financial_Insights_Report.pdf");
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 flex flex-col">
      {/* Sticky Finance Summary Bar */}
      <div className="sticky top-0 z-30 bg-white/90 dark:bg-slate-800/90 backdrop-blur-lg shadow-sm border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-7xl mx-auto px-6 py-3 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-xl font-semibold text-indigo-600 dark:text-indigo-400">
            Finance Overview
          </h1>
          <div className="flex flex-wrap gap-6 text-sm sm:text-base">
            <SummaryItem
              label="Balance"
              value={format(summary.balance)} // Updated: use format
              color="text-indigo-500"
              icon={<Wallet className="w-4 h-4" />}
              onClick={() => setShowInsight("balance")}
            />
            <SummaryItem
              label="Income"
              value={format(summary.income)} // Updated: use format
              color="text-green-500"
              icon={<TrendingUp className="w-4 h-4" />}
              onClick={() => setShowInsight("income")}
            />
            <SummaryItem
              label="Expenses"
              value={format(summary.expense)} // Updated: use format
              color="text-red-500"
              icon={<TrendingDown className="w-4 h-4" />}
              onClick={() => setShowInsight("expenses")}
            />
            <SummaryItem
              label="Currency"
              value={currency.toUpperCase()}
              color="text-slate-500"
              onClick={() => setView("settings")}
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 max-w-7xl mx-auto space-y-8">
        <nav className="bg-white dark:bg-slate-800 rounded-2xl shadow-md p-4 sticky top-16 z-20">
          <div className="flex flex-wrap justify-center sm:justify-start gap-4">
            <Button
              onClick={() => setView("dashboard")}
              variant={view === "dashboard" ? "default" : "outline"}
              className="flex items-center gap-2"
            >
              <BarChart3 className="w-4 h-4" /> Dashboard
            </Button>
            <Button
              onClick={() => setView("transactions")}
              variant={view === "transactions" ? "default" : "outline"}
              className="flex items-center gap-2"
            >
              <ListOrdered className="w-4 h-4" /> Transactions
            </Button>
            <Button
              onClick={() => setView("settings")}
              variant={view === "settings" ? "default" : "outline"}
              className="flex items-center gap-2"
            >
              <Settings className="w-4 h-4" /> Settings
            </Button>
            <Button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white ml-auto"
            >
              + Add Transaction
            </Button>
          </div>
        </nav>

        {/* View Content */}
        {view === "dashboard" && (
          <div className="space-y-8">
            {/* Add Budget Alerts at the top */}
            <BudgetAlerts 
              transactions={transactions}
              spendingCaps={spendingCaps}
              currency={currency}
              format={format} // Pass format function instead of rate
              userId={user?.id}
            />
            
            <DashboardView
              transactions={formattedTransactions}
              savingsGoal={savingsGoal}
              loading={loading}
              error={error}
              currency={currency}
              format={format} // Pass format function instead of rate
            />
            
            {/* 🧠 AI INSIGHTS PANEL */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-indigo-100 dark:border-slate-700">
              <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Brain className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                  <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
                    AI Financial Assistant
                  </h2>
                </div>
                {aiInsights && (
                  <Button
                    onClick={handleExportPDF}
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2"
                  >
                    <FileDown className="w-4 h-4" /> Export PDF
                  </Button>
                )}
              </div>

              <div className="p-6">
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
                  Let AI analyze your spending and income patterns for deeper financial insight.
                </p>

                <Button
                  onClick={handleGenerateInsights}
                  disabled={aiLoading || transactions.length === 0}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2 mb-6"
                >
                  {aiLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating Insights...
                    </>
                  ) : (
                    <>
                      <Brain className="w-4 h-4" />
                      Generate AI Insights
                    </>
                  )}
                </Button>

                {transactions.length === 0 && (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Add some transactions to generate AI insights.
                  </p>
                )}

                {/* Error Display */}
                {aiError && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl"
                  >
                    <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                      <AlertCircle className="w-4 h-4" />
                      <strong>Error:</strong> {aiError}
                    </div>
                  </motion.div>
                )}

                {aiInsights && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-4"
                  >
                    {/* TRENDS */}
                    <div className="bg-gradient-to-br from-indigo-50 to-white dark:from-slate-800 dark:to-slate-900 rounded-xl p-4 border border-indigo-100 dark:border-slate-700">
                      <div
                        onClick={() => toggleSection("trends")}
                        className="flex justify-between items-center cursor-pointer mb-2"
                      >
                        <h4 className="font-semibold flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                          <Lightbulb className="w-5 h-5" /> Spending Trends
                        </h4>
                        {expanded.trends ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                      {expanded.trends && (
                        <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
                          {aiInsights.trends || "No trend data available."}
                        </p>
                      )}
                    </div>

                    {/* TIPS */}
                    <div className="bg-gradient-to-br from-green-50 to-white dark:from-slate-800 dark:to-slate-900 rounded-xl p-4 border border-green-100 dark:border-slate-700">
                      <div
                        onClick={() => toggleSection("tips")}
                        className="flex justify-between items-center cursor-pointer mb-2"
                      >
                        <h4 className="font-semibold flex items-center gap-2 text-green-600 dark:text-green-400">
                          <Lightbulb className="w-5 h-5" /> Improvement Tips
                        </h4>
                        {expanded.tips ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                      {expanded.tips && (
                        <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
                          {aiInsights.tips || "No tips available."}
                        </p>
                      )}
                    </div>

                    {/* SUMMARY */}
                    <div className="bg-gradient-to-br from-slate-50 to-white dark:from-slate-800 dark:to-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                      <div
                        onClick={() => toggleSection("summary")}
                        className="flex justify-between items-center cursor-pointer mb-2"
                      >
                        <h4 className="font-semibold flex items-center gap-2 text-slate-600 dark:text-slate-400">
                          <Lightbulb className="w-5 h-5" /> Summary
                        </h4>
                        {expanded.summary ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                      {expanded.summary && (
                        <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
                          {aiInsights.summary || "No summary available."}
                        </p>
                      )}
                    </div>
                  </motion.div>
                )}
              </div>
            </div>
          </div>
          
        )}
        
        {view === "transactions" && (
          <TransactionsView
            transactions={formattedTransactions}
            loading={loading}
            error={error}
            onEdit={setEditTx}
            onDelete={deleteTransaction}
            currency={currency}
          />
        )}
        
        {view === "settings" && (
          <SettingsView
            savingsGoal={savingsGoal}
            setSavingsGoal={setSavingsGoal}
            currency={currency}
          />
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showAddModal && (
          <AddTransactionModal
            onClose={() => setShowAddModal(false)}
            onAdd={addTransaction}
          />
        )}
        {editTx && (
          <EditTransactionModal
            transaction={editTx}
            onClose={() => setEditTx(null)}
            onUpdate={updateTransaction}
          />
        )}
        {showInsight && (
          <InsightModal
            type={showInsight}
            summary={summary}
            currency={currency}
            format={format} // Pass format function instead of rate
            onClose={() => setShowInsight(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// Summary Item Component
const SummaryItem = ({ label, value, color, icon, onClick }) => (
  <button
    onClick={onClick}
    className="flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all px-3 py-2 rounded-xl"
  >
    {icon && <span className={color}>{icon}</span>}
    <div className="flex flex-col items-start text-left">
      <span className="text-slate-500 text-xs">{label}</span>
      <span className={`font-semibold ${color}`}>{value}</span>
    </div>
  </button>
);

// Insight Modal Component - Updated to use format function
const InsightModal = ({ type, summary, currency, format, onClose }) => {
  const titleMap = {
    balance: "Balance Overview",
    income: "Income Breakdown",
    expenses: "Expense Breakdown",
  };

  const title = titleMap[type];
  const amount = summary[type === "balance" ? "balance" : type === "income" ? "income" : "expense"];

  const chartData = [
    { name: "Income", value: summary.income },
    { name: "Expenses", value: summary.expense },
  ];

  const percentage = summary.income > 0 ? Math.round((summary.balance / summary.income) * 100) : 0;
  const gaugeColor = percentage > 60 ? "text-green-500" : percentage > 30 ? "text-yellow-500" : "text-red-500";

  return (
    <motion.div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6 space-y-4"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
      >
        {/* Header */}
        <div className="flex justify-between items-start">
          <h2 className="text-lg font-semibold text-indigo-600 dark:text-indigo-400">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Value Display */}
        <div className="text-center py-2">
          <p className="text-4xl font-bold text-slate-800 dark:text-slate-100">
            {format(amount)} {/* Updated: use format */}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Based on your transactions in {currency.toUpperCase()}
          </p>
        </div>

        {/* Chart Visualization */}
        <div className="w-full h-48 mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
              <XAxis 
                dataKey="name" 
                stroke="#94a3b8" 
                className="text-slate-600 dark:text-slate-400"
              />
              <YAxis 
                stroke="#94a3b8"
                className="text-slate-600 dark:text-slate-400"
              />
              <Tooltip
                formatter={(val) => format(val)} // Updated: use format
                labelStyle={{ color: "#64748b" }}
                contentStyle={{ 
                  backgroundColor: 'white',
                  borderColor: '#e2e8f0',
                  borderRadius: '8px',
                  color: '#1e293b'
                }}
              />
              <Bar
                dataKey="value"
                fill={type === "income" ? "#10b981" : type === "expenses" ? "#ef4444" : "#6366f1"}
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Savings Rate Indicator */}
        {type === "balance" && (
          <div className="mt-4 flex flex-col items-center space-y-2">
            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3 overflow-hidden">
              <motion.div
                className={`h-3 rounded-full ${gaugeColor.replace("text-", "bg-")}`}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(percentage, 100)}%` }}
                transition={{ duration: 1 }}
              />
            </div>
            <span className={`text-sm font-semibold ${gaugeColor}`}>
              {percentage}% of income retained
            </span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end pt-4">
          <Button onClick={onClose} variant="outline">
            Close
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
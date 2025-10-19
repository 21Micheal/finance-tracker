import { useState, useMemo, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useTransactions } from "@/hooks/useTransactions";
import { useCurrency } from "@/context/CurrencyContext";
import { BudgetAlerts } from '@/components/BudgetAlerts';
import { DEFAULT_SPENDING_CAPS } from '@/utils/budgetService';
import { Button } from "@/components/ui/Button";
import DashboardView from "@/pages/transactions/DashboardView";
import TransactionsView from "@/pages/transactions/TransactionsView";
import SettingsView from "@/pages/settings/SettingsView";
import { AddTransactionModal } from "@/pages/transactions/AddTransactionModal";
import { EditTransactionModal } from "@/pages/transactions/EditTransactionModal";
import { generateAIInsights } from "@/lib/aiInsights";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/cards";
import { toast } from "react-hot-toast"; 
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
  Clock,
  RefreshCw,
  ArrowDownCircle,
  ArrowUpCircle,
  Phone,
  AlertCircle,
  Filter
} from "lucide-react";
import jsPDF from "jspdf";

// Constants
const MPESA_SYNC_INTERVAL = 60000; // Increased to 60 seconds to reduce frequency

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
    mpesa: true,
  });
  const [mpesaTransactions, setMpesaTransactions] = useState([]);
  const [lastSync, setLastSync] = useState(null);
  const [spendingCaps, setSpendingCaps] = useState(() => {
    const saved = localStorage.getItem("spendingCaps");
    return saved ? JSON.parse(saved) : DEFAULT_SPENDING_CAPS;
  });
  const [dateRange, setDateRange] = useState("all"); // "week", "month", "year", "all"

  const { user } = useAuth();
  const { currency, format } = useCurrency();
  const {
    transactions,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    loading,
    error,
    fetchMpesaTransactions,
  } = useTransactions(user);

  // 🧠 Persist savings goal and spending caps
  useEffect(() => {
    localStorage.setItem("savingsGoal", savingsGoal.toString());
  }, [savingsGoal]);

  useEffect(() => {
    localStorage.setItem("spendingCaps", JSON.stringify(spendingCaps));
  }, [spendingCaps]);

  // 🔄 Sync M-Pesa transactions with proper cleanup and reduced frequency
  const syncMpesaTransactions = useCallback(async () => {
    try {
      const mpesaTx = await fetchMpesaTransactions();
      
      if (Array.isArray(mpesaTx) && mpesaTx.length > 0) {
        // Update recent transactions for the M-Pesa feed display only
        setMpesaTransactions(mpesaTx.slice(-5));
        setLastSync(new Date());
      }
    } catch (err) {
      console.error("M-Pesa sync error:", err);
      // Don't show toast for connection errors to reduce noise
    }
  }, [fetchMpesaTransactions]);

  // M-Pesa sync effect with proper cleanup
  useEffect(() => {
    let intervalId;
    
    const initializeSync = async () => {
      await syncMpesaTransactions(); // Initial sync
      intervalId = setInterval(syncMpesaTransactions, MPESA_SYNC_INTERVAL);
    };

    initializeSync();

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [syncMpesaTransactions]);

  // 💰 Filter transactions by date range
  const filteredTransactions = useMemo(() => {
    if (dateRange === "all") return transactions;

    const now = new Date();
    let startDate = new Date();

    switch (dateRange) {
      case "week":
        startDate.setDate(now.getDate() - 7);
        break;
      case "month":
        startDate.setMonth(now.getMonth() - 1);
        break;
      case "year":
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        return transactions;
    }

    return transactions.filter(tx => {
      const txDate = new Date(tx.date);
      return txDate >= startDate;
    });
  }, [transactions, dateRange]);

  // 💰 Summary calculations using filtered transactions
  const summary = useMemo(() => {
    const income = filteredTransactions
      .filter(t => t.type === "income")
      .reduce((sum, t) => sum + (t.amount || 0), 0);
    
    const expense = filteredTransactions
      .filter(t => t.type === "expense")
      .reduce((sum, t) => sum + (t.amount || 0), 0);
    
    const balance = income - expense;
    const savingsRate = income > 0 ? (balance / income) * 100 : 0;

    return { income, expense, balance, savingsRate };
  }, [filteredTransactions]);

  // 💵 Format filtered transactions
  const formattedTransactions = useMemo(() =>
    filteredTransactions.map(tx => ({
      ...tx,
      amountFormatted: format(tx.amount),
    })),
    [filteredTransactions, format]
  );

  // ⏱ Manual refresh with loading state
  const [isSyncing, setIsSyncing] = useState(false);
  const handleManualSync = async () => {
    setIsSyncing(true);
    toast.loading("🔄 Syncing M-Pesa...");
    
    try {
      await syncMpesaTransactions();
      toast.dismiss();
      toast.success("✅ Sync completed!");
    } catch (error) {
      toast.dismiss();
      toast.error("❌ Sync failed");
    } finally {
      setIsSyncing(false);
    }
  };

  // AI Insights Handler with proper error handling
  const handleGenerateInsights = async () => {
    if (filteredTransactions.length === 0) {
      setAIError("No transactions available to analyze.");
      toast.error("Add transactions to generate insights");
      return;
    }

    setAILoading(true);
    setAIError("");
    setAIInsights(null);
    
    try {
      const insightsData = await generateAIInsights(filteredTransactions, currency);
      
      if (insightsData) {
        const transformedInsights = {
          trends: insightsData.spending_overview || insightsData.trend_analysis || "No trend analysis available.",
          tips: Array.isArray(insightsData.recommendations) 
            ? `• ${insightsData.recommendations.join('\n• ')}`
            : "No specific recommendations available at this time.",
          summary: insightsData.savings_analysis || "No summary analysis available.",
        };
        
        setAIInsights(transformedInsights);
        toast.success("AI insights generated successfully!");
      } else {
        setAIError("No insights data received.");
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
    setExpanded(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleExportPDF = () => {
    if (!aiInsights) return;
    
    const doc = new jsPDF();
    let yPosition = 20;
    
    // Header
    doc.setFont("helvetica", "bold");
    doc.setTextColor(79, 70, 229);
    doc.setFontSize(18);
    doc.text("AI Financial Insights Report", 14, yPosition);
    yPosition += 15;

    // Date and details
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, yPosition);
    yPosition += 6;
    doc.text(`Currency: ${currency.toUpperCase()}`, 14, yPosition);
    yPosition += 6;
    doc.text(`Transactions Analyzed: ${filteredTransactions.length}`, 14, yPosition);
    yPosition += 15;

    // Helper function to add section
    const addSection = (title, content) => {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(12);
      doc.text(title, 14, yPosition);
      yPosition += 8;

      doc.setFont("helvetica", "normal");
      const lines = doc.splitTextToSize(content || "No data available.", 180);
      doc.text(lines, 14, yPosition);
      yPosition += lines.length * 6 + 15;

      // Page break check
      if (yPosition > 250) {
        doc.addPage();
        yPosition = 20;
      }
    };

    // Add insights sections
    addSection("📈 Spending Trends", aiInsights.trends);
    addSection("💡 Smart Recommendations", aiInsights.tips);
    addSection("🏦 Financial Summary", aiInsights.summary);

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text("Generated by FinTrack AI Assistant", 14, doc.internal.pageSize.height - 10);
    
    doc.save("AI_Financial_Insights_Report.pdf");
    toast.success("PDF report downloaded!");
  };

  // Navigation items for cleaner code
  const navItems = [
    { key: "dashboard", label: "Dashboard", icon: BarChart3 },
    { key: "transactions", label: "Transactions", icon: ListOrdered },
    { key: "settings", label: "Settings", icon: Settings },
  ];

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
              value={format(summary.balance)}
              color="text-indigo-500"
              icon={<Wallet className="w-4 h-4" />}
              onClick={() => setShowInsight("balance")}
            />
            <SummaryItem
              label="Income"
              value={format(summary.income)}
              color="text-green-500"
              icon={<TrendingUp className="w-4 h-4" />}
              onClick={() => setShowInsight("income")}
            />
            <SummaryItem
              label="Expenses"
              value={format(summary.expense)}
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
        {/* Navigation */}
        <nav className="bg-white dark:bg-slate-800 rounded-2xl shadow-md p-4 sticky top-16 z-20">
          <div className="flex flex-wrap justify-center sm:justify-start gap-4">
            {navItems.map(({ key, label, icon: Icon }) => (
              <Button
                key={key}
                onClick={() => setView(key)}
                variant={view === key ? "default" : "outline"}
                className="flex items-center gap-2"
              >
                <Icon className="w-4 h-4" /> {label}
              </Button>
            ))}
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
            {/* Date Range Filter */}
            <Card className="rounded-2xl shadow-md border border-slate-200 dark:border-slate-700">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-slate-500" />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Filter by Date Range:
                    </span>
                  </div>
                  <select
                    value={dateRange}
                    onChange={(e) => setDateRange(e.target.value)}
                    className="bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1 text-sm text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="all" className="text-slate-700 dark:text-slate-300">All Time</option>
                    <option value="week" className="text-slate-700 dark:text-slate-300">Past Week</option>
                    <option value="month" className="text-slate-700 dark:text-slate-300">Past Month</option>
                    <option value="year" className="text-slate-700 dark:text-slate-300">Past Year</option>
                  </select>
                </div>
              </CardContent>
            </Card>

            {/* Budget Alerts */}
            <BudgetAlerts 
              transactions={filteredTransactions}
              spendingCaps={spendingCaps}
              currency={currency}
              format={format}
              userId={user?.id}
            />
            
            {/* M-Pesa Activity Card */}
            <Card className="rounded-2xl shadow-md border border-slate-200 dark:border-slate-700">
              <CardContent className="p-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium flex items-center gap-2 text-slate-800 dark:text-slate-200">
                    <Phone className="w-5 h-5 text-green-600" />
                    Live M-Pesa Feed
                  </h3>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleManualSync}
                      disabled={isSyncing}
                      className="flex items-center gap-1"
                    >
                      <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                      {isSyncing ? "Syncing..." : "Sync"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggleSection("mpesa")}
                    >
                      {expanded.mpesa ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                {expanded.mpesa && (
                  <div className="space-y-3">
                    {mpesaTransactions.length > 0 ? (
                      mpesaTransactions.map((tx) => (
                        <MpesaTransactionItem key={tx.id} transaction={tx} format={format} />
                      ))
                    ) : (
                      <p className="text-slate-500 dark:text-slate-400 text-sm italic text-center py-4">
                        No M-Pesa transactions synced yet.
                      </p>
                    )}
                    
                    <div className="text-xs text-slate-400 dark:text-slate-500 text-right mt-3 pt-2 border-t border-slate-100 dark:border-slate-700">
                      Last sync: {lastSync ? lastSync.toLocaleTimeString() : "Not synced yet"}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Dashboard View with Charts */}
            <DashboardView
              transactions={formattedTransactions}
              savingsGoal={savingsGoal}
              loading={loading}
              error={error}
              currency={currency}
              format={format}
            />
            
            {/* AI Insights Panel */}
            <AIInsightsPanel
              aiInsights={aiInsights}
              aiLoading={aiLoading}
              aiError={aiError}
              transactionsCount={filteredTransactions.length}
              expanded={expanded}
              onToggleSection={toggleSection}
              onGenerateInsights={handleGenerateInsights}
              onExportPDF={handleExportPDF}
            />
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
            format={format}
            onClose={() => setShowInsight(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// Sub-components for better organization
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

const MpesaTransactionItem = ({ transaction, format }) => (
  <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
    <div className="flex-1">
      <p className="font-medium text-sm text-slate-800 dark:text-slate-200">{transaction.name || "M-Pesa Payment"}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
        <Clock className="w-3 h-3" />
        {new Date(transaction.date).toLocaleString()}
      </p>
      <p className="text-xs text-slate-400 dark:text-slate-500 capitalize">
        {transaction.transaction_type || "General"}
      </p>
    </div>
    <span
      className={`font-semibold text-sm flex items-center gap-1 ${
        transaction.type === "income" ? "text-green-600" : "text-red-600"
      }`}
    >
      {transaction.type === "income" ? (
        <ArrowDownCircle className="w-4 h-4" />
      ) : (
        <ArrowUpCircle className="w-4 h-4" />
      )}
      {format(transaction.amount)}
    </span>
  </div>
);

const AIInsightsPanel = ({ 
  aiInsights, 
  aiLoading, 
  aiError, 
  transactionsCount, 
  expanded, 
  onToggleSection, 
  onGenerateInsights, 
  onExportPDF 
}) => (
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
          onClick={onExportPDF}
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
        onClick={onGenerateInsights}
        disabled={aiLoading || transactionsCount === 0}
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

      {transactionsCount === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Add some transactions to generate AI insights.
        </p>
      )}

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
          <InsightSection
            title="Spending Trends"
            content={aiInsights.trends}
            expanded={expanded.trends}
            onToggle={() => onToggleSection("trends")}
            color="indigo"
          />
          <InsightSection
            title="Improvement Tips"
            content={aiInsights.tips}
            expanded={expanded.tips}
            onToggle={() => onToggleSection("tips")}
            color="green"
          />
          <InsightSection
            title="Summary"
            content={aiInsights.summary}
            expanded={expanded.summary}
            onToggle={() => onToggleSection("summary")}
            color="slate"
          />
        </motion.div>
      )}
    </div>
  </div>
);

const InsightSection = ({ title, content, expanded, onToggle, color }) => {
  const colorClasses = {
    indigo: "from-indigo-50 to-white border-indigo-100 text-indigo-600 dark:from-slate-800 dark:to-slate-900 dark:border-slate-700 dark:text-indigo-400",
    green: "from-green-50 to-white border-green-100 text-green-600 dark:from-slate-800 dark:to-slate-900 dark:border-slate-700 dark:text-green-400",
    slate: "from-slate-50 to-white border-slate-200 text-slate-600 dark:from-slate-800 dark:to-slate-900 dark:border-slate-700 dark:text-slate-400"
  };

  return (
    <div className={`bg-gradient-to-br rounded-xl p-4 border ${colorClasses[color]}`}>
      <div
        onClick={onToggle}
        className="flex justify-between items-center cursor-pointer mb-2"
      >
        <h4 className="font-semibold flex items-center gap-2">
          <Lightbulb className="w-5 h-5" /> {title}
        </h4>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </div>
      {expanded && (
        <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
          {content}
        </p>
      )}
    </div>
  );
};

// Insight Modal Component
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
            {format(amount)}
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
                formatter={(val) => format(val)}
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
};
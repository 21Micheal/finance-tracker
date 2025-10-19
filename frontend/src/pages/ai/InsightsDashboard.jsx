// src/pages/InsightsDashboard.jsx
import React, { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import jsPDF from "jspdf";
import {
  Brain,
  Lightbulb,
  Loader2,
  FileDown,
  ChevronDown,
  ChevronUp,
  BarChart3,
  PiggyBank,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Wallet,
  PieChart
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { useAuth } from "@/context/AuthContext";
import { useCurrency } from "@/context/CurrencyContext";
import { useTransactions } from "@/hooks/useTransactions";
import { Card, CardContent, CardHeader } from "@/components/ui/cards";
import { Button } from "@/components/ui/Button";
import { generateAIInsights, getMonthlyTrends, getSpendingCategories } from "@/lib/aiInsights";
import AlertsPanel from "@/components/AlertsPanel";

export default function InsightsDashboard() {
  const { user } = useAuth();
  const { currency } = useCurrency();
  const { transactions, fetchMpesaTransactions, loading: transactionsLoading } = useTransactions(user);

  // State
  const [aiInsights, setAIInsights] = useState(null);
  const [aiLoading, setAILoading] = useState(false);
  const [aiError, setAIError] = useState("");
  const [monthlyTrends, setMonthlyTrends] = useState([]);
  const [categories, setCategories] = useState([]);
  const [expanded, setExpanded] = useState({
    trends: true,
    tips: false,
    summary: true,
  });
  const [refreshing, setRefreshing] = useState(false);

  // Toggle sections
  const toggleSection = useCallback((section) => {
    setExpanded(prev => ({ ...prev, [section]: !prev[section] }));
  }, []);

  // Load analytics data
  const loadAnalyticsData = useCallback(async () => {
    try {
      const [trendData, categoryData] = await Promise.all([
        getMonthlyTrends(transactions),
        getSpendingCategories(transactions),
      ]);
      setMonthlyTrends(trendData || []);
      setCategories(categoryData || []);
    } catch (error) {
      console.error("Error loading analytics data:", error);
    }
  }, [transactions]);

  // Initialize dashboard
  useEffect(() => {
    if (transactions.length > 0) {
      loadAnalyticsData();
    }
  }, [transactions, loadAnalyticsData]);

  // Generate AI Insights with M-Pesa integration
  const handleGenerateInsights = useCallback(async () => {
    if (!transactions.length) {
      setAIError("No transactions available to analyze.");
      toast.error("Add transactions to generate insights");
      return;
    }

    setAILoading(true);
    setAIError("");
    setAIInsights(null);

    try {
      // Sync latest M-Pesa data before analysis
      await fetchMpesaTransactions();
      
      const insightsData = await generateAIInsights(transactions, currency);
      
      if (!insightsData) {
        throw new Error("No insights data returned from AI service.");
      }

      const transformedInsights = {
        trends: insightsData.spending_overview || insightsData.trend_analysis || "No trend analysis available.",
        tips: Array.isArray(insightsData.recommendations) 
          ? `• ${insightsData.recommendations.join('\n• ')}`
          : "No specific recommendations available at this time.",
        summary: insightsData.savings_analysis || "No summary analysis available.",
      };

      setAIInsights(transformedInsights);
      toast.success("AI insights generated successfully!");
    } catch (err) {
      console.error("❌ AI Insights Error:", err);
      const errorMessage = err.message || "Failed to generate insights. Please try again.";
      setAIError(errorMessage);
      toast.error("AI insights generation failed");
    } finally {
      setAILoading(false);
    }
  }, [transactions, currency, fetchMpesaTransactions]);

  // Export PDF report
  const handleExportPDF = useCallback(() => {
    if (!aiInsights) return;

    const doc = new jsPDF();
    let yPosition = 20;

    // Header
    doc.setFont("helvetica", "bold");
    doc.setTextColor(79, 70, 229);
    doc.setFontSize(18);
    doc.text("AI Financial Insights Report", 14, yPosition);
    yPosition += 15;

    // Metadata
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, yPosition);
    yPosition += 6;
    doc.text(`Currency: ${currency.toUpperCase()}`, 14, yPosition);
    yPosition += 6;
    doc.text(`Transactions Analyzed: ${transactions.length}`, 14, yPosition);
    yPosition += 15;

    // Helper function to add sections
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
    addSection("📈 Spending Trends & Patterns", aiInsights.trends);
    addSection("💡 Smart Recommendations", aiInsights.tips);
    addSection("🏦 Financial Summary", aiInsights.summary);

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text("Generated by FinTrack AI Assistant", 14, doc.internal.pageSize.height - 10);

    doc.save(`Financial_Insights_${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success("PDF report downloaded!");
  }, [aiInsights, currency, transactions.length]);

  // Refresh all data
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchMpesaTransactions();
      await loadAnalyticsData();
      toast.success("Data refreshed!");
    } catch (error) {
      toast.error("Failed to refresh data");
    } finally {
      setRefreshing(false);
    }
  };

  // Loading state
  if (transactionsLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex flex-col items-center justify-center h-64 space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          <p className="text-slate-600 dark:text-slate-400">
            Loading your financial insights...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto ml-0 lg:ml-0">
      {/* Header Section */}
      <motion.header 
        className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-3">
            <Brain className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
            Advanced Financial Insights
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-2">
            AI-powered analysis of your financial patterns and opportunities
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-sm text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-3 py-1 rounded-full">
            {transactions.length} transactions
          </div>
          <Button
            onClick={handleRefresh}
            disabled={refreshing}
            variant="outline"
            size="sm"
            className="flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </motion.header>

      {/* Analytics Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Monthly Trends */}
        <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-50 to-white dark:from-blue-900/20 dark:to-slate-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="text-sm font-medium text-blue-600 dark:text-blue-400">Income Trends</h3>
            <TrendingUp className="w-4 h-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            {monthlyTrends.length > 0 ? (
              <div className="space-y-1">
                {monthlyTrends.slice(0, 3).map((trend) => (
                  <div key={trend.month} className="flex justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-400">{trend.month}</span>
                    <span className="font-semibold text-green-600">
                      {trend.income?.toLocaleString()} {currency}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 dark:text-slate-500 text-sm">No income data</p>
            )}
          </CardContent>
        </Card>

        {/* Expense Trends */}
        <Card className="border-0 shadow-lg bg-gradient-to-br from-red-50 to-white dark:from-red-900/20 dark:to-slate-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="text-sm font-medium text-red-600 dark:text-red-400">Expense Trends</h3>
            <TrendingDown className="w-4 h-4 text-red-500" />
          </CardHeader>
          <CardContent>
            {monthlyTrends.length > 0 ? (
              <div className="space-y-1">
                {monthlyTrends.slice(0, 3).map((trend) => (
                  <div key={trend.month} className="flex justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-400">{trend.month}</span>
                    <span className="font-semibold text-red-600">
                      {trend.expense?.toLocaleString()} {currency}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 dark:text-slate-500 text-sm">No expense data</p>
            )}
          </CardContent>
        </Card>

        {/* Top Categories */}
        <Card className="border-0 shadow-lg bg-gradient-to-br from-green-50 to-white dark:from-green-900/20 dark:to-slate-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="text-sm font-medium text-green-600 dark:text-green-400">Top Categories</h3>
            <PieChart className="w-4 h-4 text-green-500" />
          </CardHeader>
          <CardContent>
            {categories.length > 0 ? (
              <div className="space-y-1">
                {categories.slice(0, 3).map((cat) => (
                  <div key={cat.category} className="flex justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-400 truncate">{cat.category}</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      {cat.total?.toLocaleString()} {currency}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 dark:text-slate-500 text-sm">No category data</p>
            )}
          </CardContent>
        </Card>

        {/* Savings Overview */}
        <Card className="border-0 shadow-lg bg-gradient-to-br from-purple-50 to-white dark:from-purple-900/20 dark:to-slate-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="text-sm font-medium text-purple-600 dark:text-purple-400">Savings</h3>
            <PiggyBank className="w-4 h-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            {monthlyTrends.length > 0 ? (
              <div className="space-y-1">
                {monthlyTrends.slice(0, 2).map((trend) => (
                  <div key={trend.month} className="flex justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-400">{trend.month}</span>
                    <span className="font-semibold text-purple-600">
                      {((trend.income || 0) - (trend.expense || 0))?.toLocaleString()} {currency}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 dark:text-slate-500 text-sm">No savings data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* AI Insights Panel */}
      <motion.section 
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-indigo-100 dark:border-slate-700"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-3">
            <Brain className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            AI Financial Analysis
          </h2>

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
            Get AI-powered analysis of your spending trends, savings behavior, and opportunities for optimization.
          </p>

          <Button
            onClick={handleGenerateInsights}
            disabled={aiLoading || !transactions.length}
            className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2 mb-6"
          >
            {aiLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating Insights...
              </>
            ) : (
              <>
                <Lightbulb className="w-4 h-4" />
                Generate AI Insights
              </>
            )}
          </Button>

          {/* Error Display */}
          {aiError && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-2"
            >
              <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5" />
              <span className="text-sm text-red-700 dark:text-red-400">
                {aiError}
              </span>
            </motion.div>
          )}

          {/* Empty State */}
          {!transactions.length && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-4 mb-6">
              <p className="text-amber-800 dark:text-amber-300 text-sm">
                <strong>No transactions available.</strong> Add some transactions or sync M-Pesa to generate AI insights.
              </p>
            </div>
          )}

          {/* AI Insights Display */}
          <AnimatePresence>
            {aiInsights && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                {[
                  {
                    key: "trends",
                    title: "Spending Trends & Patterns",
                    icon: BarChart3,
                    color: "indigo",
                    content: aiInsights.trends,
                  },
                  {
                    key: "tips", 
                    title: "Smart Recommendations",
                    icon: Lightbulb,
                    color: "green",
                    content: aiInsights.tips,
                  },
                  {
                    key: "summary",
                    title: "Financial Summary", 
                    icon: PiggyBank,
                    color: "blue",
                    content: aiInsights.summary,
                  },
                ].map(({ key, title, icon: Icon, color, content }) => {
                  // Define color classes properly to avoid duplicate keys
                  const colorClasses = {
                    indigo: "from-indigo-50 to-white border-indigo-100 text-indigo-600 dark:text-indigo-400",
                    green: "from-green-50 to-white border-green-100 text-green-600 dark:text-green-400", 
                    blue: "from-blue-50 to-white border-blue-100 text-blue-600 dark:text-blue-400"
                  };

                  return (
                    <motion.div
                      key={key} // This ensures unique keys
                      className={`bg-gradient-to-br rounded-xl p-4 border dark:from-slate-800 dark:to-slate-900 dark:border-slate-700 ${colorClasses[color]}`}
                    >
                      <div
                        onClick={() => toggleSection(key)}
                        className="flex justify-between items-center cursor-pointer mb-2"
                      >
                        <h4 className={`font-semibold flex items-center gap-2 ${colorClasses[color].split(' ').find(cls => cls.includes('text-'))}`}>
                          <Icon className="w-5 h-5" />
                          {title}
                        </h4>
                        {expanded[key] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                      {expanded[key] && (
                        <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                          {content}
                        </p>
                      )}
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.section>

      {/* Alerts Section */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <AlertsPanel />
      </motion.section>
    </div>
  );
}
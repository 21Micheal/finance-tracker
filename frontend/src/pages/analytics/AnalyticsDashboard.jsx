import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useCurrency } from "@/context/CurrencyContext";
import { useAuth } from "@/context/AuthContext";
import { useTransactions } from "@/hooks/useTransactions";
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, Legend
} from "recharts";
import { 
  ArrowDownCircle, 
  ArrowUpCircle, 
  TrendingUp, 
  Smartphone, 
  RefreshCw,
  PieChart as PieChartIcon,
  BarChart3,
  Wallet
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/cards";
import { Button } from "@/components/ui/Button";
import { motion } from "framer-motion";

const COLORS = ["#4f46e5", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#06b6d4"];

export default function AnalyticsDashboard() {
  const { currency, format } = useCurrency();
  const { user } = useAuth();
  const { transactions, fetchMpesaTransactions } = useTransactions(user);

  const [analytics, setAnalytics] = useState({
    totalIncome: 0,
    totalExpense: 0,
    balance: 0,
    byCategory: [],
    monthlyTrends: [],
    topCategories: []
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mpesaIncluded, setMpesaIncluded] = useState(false);

  // Process transactions for analytics
  const processAnalytics = useCallback((txs) => {
    if (!txs || txs.length === 0) {
      return {
        totalIncome: 0,
        totalExpense: 0,
        balance: 0,
        byCategory: [],
        monthlyTrends: [],
        topCategories: []
      };
    }

    // Calculate totals
    const income = txs
      .filter((t) => t.type === "income")
      .reduce((acc, t) => acc + (t.amount || 0), 0);

    const expense = txs
      .filter((t) => t.type === "expense")
      .reduce((acc, t) => acc + (t.amount || 0), 0);

    // Category breakdown for pie chart
    const categoryMap = {};
    txs.forEach((t) => {
      if (t.type === "expense") {
        const category = t.category || "Uncategorized";
        categoryMap[category] = (categoryMap[category] || 0) + (t.amount || 0);
      }
    });

    const byCategory = Object.entries(categoryMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Monthly trends for bar chart
    const trendMap = {};
    txs.forEach((t) => {
      try {
        const date = new Date(t.date);
        const month = date.toLocaleString("default", { month: "short", year: "2-digit" });
        if (!trendMap[month]) {
          trendMap[month] = { 
            month, 
            income: 0, 
            expense: 0,
            savings: 0 
          };
        }

        if (t.type === "income") trendMap[month].income += t.amount || 0;
        if (t.type === "expense") trendMap[month].expense += t.amount || 0;
      } catch (error) {
        console.warn("Invalid transaction date:", t.date);
      }
    });

    // Calculate savings for each month
    Object.values(trendMap).forEach(month => {
      month.savings = month.income - month.expense;
    });

    const monthlyTrends = Object.values(trendMap)
      .sort((a, b) => {
        const dateA = new Date(a.month);
        const dateB = new Date(b.month);
        return dateA - dateB;
      });

    // Top categories for quick overview
    const topCategories = byCategory.slice(0, 5);

    return {
      totalIncome: income,
      totalExpense: expense,
      balance: income - expense,
      byCategory,
      monthlyTrends,
      topCategories
    };
  }, []);

  // Load analytics data
  const loadAnalytics = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      // Check for M-Pesa transactions
      const hasMpesa = transactions.some(tx => tx.source === 'mpesa');
      setMpesaIncluded(hasMpesa);

      // Process current transactions for analytics
      const analyticsData = processAnalytics(transactions);
      setAnalytics(analyticsData);

      if (isRefresh) {
        toast.success("Analytics updated!");
      }
    } catch (err) {
      console.error("🔥 Error loading analytics:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [transactions, processAnalytics]);

  // Manual refresh
  const handleRefresh = async () => {
    try {
      await fetchMpesaTransactions();
      await loadAnalytics(true);
    } catch (error) {
      console.error("Refresh failed:", error);
    }
  };

  // Load analytics when transactions change
  useEffect(() => {
    if (transactions.length > 0) {
      loadAnalytics();
    }
  }, [loadAnalytics, transactions.length]);

  // Custom tooltip for charts
  const CurrencyTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-800 text-white p-3 rounded-lg shadow-lg border border-slate-700 text-sm">
          <p className="font-semibold mb-2">{label}</p>
          {payload.map((p, i) => (
            <p key={i} style={{ color: p.color }} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
              {`${p.name}: ${format(p.value)}`}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // Custom label for pie chart
  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
    if (percent < 0.05) return null; // Don't show labels for small slices
    
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text 
        x={x} 
        y={y} 
        fill="white" 
        textAnchor={x > cx ? 'start' : 'end'} 
        dominantBaseline="central"
        className="text-xs font-medium"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  if (loading) {
    return (
      <motion.div 
        className="p-6 ml-0 lg:ml-0 min-h-screen flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400">Loading analytics...</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div 
      className="p-6 space-y-6 ml-0 lg:ml-0 min-h-screen bg-gray-50 dark:bg-slate-900"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      {/* Header */}
      <motion.div 
        className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-3">
            <BarChart3 className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
            Analytics Overview
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-2">
            Visual insights into your financial patterns and spending habits
          </p>
        </div>

        <div className="flex items-center gap-3">
          {mpesaIncluded && (
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-3 py-1 rounded-full">
              <Smartphone className="w-4 h-4" />
              <span>M-Pesa Included</span>
            </div>
          )}
          <Button
            onClick={handleRefresh}
            disabled={refreshing}
            variant="outline"
            size="sm"
            className="flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </motion.div>

      {/* Summary Cards */}
      <motion.div 
        className="grid grid-cols-1 md:grid-cols-3 gap-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card className="border-0 shadow-lg bg-gradient-to-br from-green-50 to-white dark:from-green-900/20 dark:to-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <ArrowUpCircle className="text-green-500 w-6 h-6" />
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Total Income</p>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {format(analytics.totalIncome)}
                </h2>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg bg-gradient-to-br from-red-50 to-white dark:from-red-900/20 dark:to-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <ArrowDownCircle className="text-red-500 w-6 h-6" />
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Total Expense</p>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {format(analytics.totalExpense)}
                </h2>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-50 to-white dark:from-blue-900/20 dark:to-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <TrendingUp className="text-blue-500 w-6 h-6" />
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Net Balance</p>
                <h2 className={`text-2xl font-bold ${
                  analytics.balance >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {format(analytics.balance)}
                </h2>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Spending by Category Pie Chart */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="border-0 shadow-lg h-full">
            <CardHeader className="flex flex-row items-center space-y-0 pb-4">
              <PieChartIcon className="w-5 h-5 text-indigo-600 mr-2" />
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                Spending by Category
              </h3>
            </CardHeader>
            <CardContent>
              {analytics.byCategory.length > 0 ? (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={analytics.byCategory}
                        dataKey="value"
                        nameKey="name"
                        outerRadius={120}
                        innerRadius={60}
                        label={renderCustomizedLabel}
                        labelLine={false}
                      >
                        {analytics.byCategory.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={COLORS[index % COLORS.length]} 
                          />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => format(value)} />
                      <Legend 
                        formatter={(value, entry) => (
                          <span className="text-sm text-slate-600 dark:text-slate-300">
                            {value}
                          </span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-80 flex items-center justify-center text-slate-500 dark:text-slate-400">
                  <div className="text-center">
                    <PieChartIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No spending data available</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Monthly Trends Bar Chart */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="border-0 shadow-lg h-full">
            <CardHeader className="flex flex-row items-center space-y-0 pb-4">
              <BarChart3 className="w-5 h-5 text-indigo-600 mr-2" />
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                Monthly Trends
              </h3>
            </CardHeader>
            <CardContent>
              {analytics.monthlyTrends.length > 0 ? (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.monthlyTrends}>
                      <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                      <XAxis 
                        dataKey="month" 
                        tick={{ fontSize: 12 }}
                      />
                      <YAxis 
                        tickFormatter={(value) => format(value)}
                        tick={{ fontSize: 12 }}
                      />
                      <Tooltip content={<CurrencyTooltip />} />
                      <Legend />
                      <Bar 
                        dataKey="income" 
                        name="Income" 
                        fill="#10b981" 
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar 
                        dataKey="expense" 
                        name="Expense" 
                        fill="#ef4444" 
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-80 flex items-center justify-center text-slate-500 dark:text-slate-400">
                  <div className="text-center">
                    <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No monthly trend data available</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Additional Chart - Savings Trend */}
      {analytics.monthlyTrends.length > 1 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="border-0 shadow-lg">
            <CardHeader className="flex flex-row items-center space-y-0 pb-4">
              <TrendingUp className="w-5 h-5 text-indigo-600 mr-2" />
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                Savings Trend
              </h3>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={analytics.monthlyTrends}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                    <XAxis 
                      dataKey="month" 
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis 
                      tickFormatter={(value) => format(value)}
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip content={<CurrencyTooltip />} />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="savings" 
                      name="Savings" 
                      stroke="#8b5cf6" 
                      strokeWidth={3}
                      dot={{ fill: '#8b5cf6', strokeWidth: 2, r: 4 }}
                      activeDot={{ r: 6, fill: '#8b5cf6' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Empty State */}
      {transactions.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card className="text-center py-12 border-2 border-dashed border-slate-300 dark:border-slate-600">
            <CardContent>
              <Wallet className="w-12 h-12 text-slate-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-600 dark:text-slate-400 mb-2">
                No Transactions Found
              </h3>
              <p className="text-slate-500 dark:text-slate-500 mb-4">
                Add some transactions to see analytics
              </p>
              <Button
                onClick={handleRefresh}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Sync Data
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </motion.div>
  );
}
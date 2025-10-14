import React, { useMemo, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/cards";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/Button";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  PiggyBank,
  Calculator,
  Wallet,
  Target,
  Award,
  BarChart3,
  PieChart as PieChartIcon,
  LineChart as LineChartIcon,
  Download,
  Calendar,
} from "lucide-react";

const COLORS = ["#6366f1", "#818cf8", "#a5b4fc", "#c7d2fe", "#e0e7ff", "#22c55e", "#ef4444"];

export default function DashboardView({
  transactions = [],
  savingsGoal,
  loading,
  error,
  currency,
  format, // Updated: receive format function instead of rate
}) {
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [monthRange, setMonthRange] = useState([1, 12]);

  // Formatting helper
  const formatRange = useCallback(() => {
    const startMonth = new Date(0, monthRange[0] - 1).toLocaleString("default", { month: "short" });
    const endMonth = new Date(0, monthRange[1] - 1).toLocaleString("default", { month: "short" });
    return `${startMonth} – ${endMonth} ${year}`;
  }, [monthRange, year]);

  const stats = useMemo(() => {
    if (!transactions.length)
      return {
        totalIncome: 0,
        totalExpense: 0,
        netSavings: 0,
        savingsRate: 0,
        avgMonthlyExpense: 0,
        topCategory: "N/A",
        monthlyData: [],
        categoryData: [],
        netWorthGrowth: [],
        projectedSavings: [],
        topCategories: [],
        biggestExpense: null,
        goalProgress: 0,
      };

    // Filter transactions by date range
    const filteredTransactions = transactions.filter((t) => {
      const d = new Date(t.date);
      const transactionYear = d.getFullYear().toString();
      const transactionMonth = d.getMonth() + 1;
      return transactionYear === year && transactionMonth >= monthRange[0] && transactionMonth <= monthRange[1];
    });

    const incomeTx = filteredTransactions.filter((tx) => tx.type === "income");
    const expenseTx = filteredTransactions.filter((tx) => tx.type === "expense");

    // Basic calculations
    const totalIncome = incomeTx.reduce((s, t) => s + t.amount, 0);
    const totalExpense = expenseTx.reduce((s, t) => s + t.amount, 0);
    const netSavings = totalIncome - totalExpense;
    const savingsRate = totalIncome ? ((netSavings / totalIncome) * 100) : 0;

    const months = new Set(
      filteredTransactions.map((t) => new Date(t.date).toISOString().slice(0, 7))
    ).size;
    const avgMonthlyExpense = months ? totalExpense / months : 0;

    // Category data
    const categoryMap = {};
    expenseTx.forEach((t) => {
      categoryMap[t.category] = (categoryMap[t.category] || 0) + t.amount;
    });
    const categoryData = Object.entries(categoryMap).map(([name, value]) => ({
      name,
      value,
    }));
    const topCategory = categoryData.length > 0
      ? categoryData.sort((a, b) => b.value - a.value)[0].name
      : "N/A";

    // Top 3 categories
    const topCategories = categoryData
      .sort((a, b) => b.value - a.value)
      .slice(0, 3);

    // Biggest expense
    const biggestExpense = expenseTx.length > 0
      ? expenseTx.sort((a, b) => b.amount - a.amount)[0]
      : null;

    // Monthly data
    const monthlyMap = {};
    filteredTransactions.forEach((t) => {
      const month = new Date(t.date).toLocaleString("default", { month: "short" });
      if (!monthlyMap[month]) monthlyMap[month] = { month, income: 0, expense: 0 };
      if (t.type === "income") monthlyMap[month].income += t.amount;
      else monthlyMap[month].expense += t.amount;
    });
    const monthlyData = Object.values(monthlyMap);

    // Net worth growth (cumulative)
    const netWorthGrowth = monthlyData.map((month, index, array) => {
      const cumulativeBalance = array
        .slice(0, index + 1)
        .reduce((sum, m) => sum + (m.income - m.expense), 0);
      return {
        ...month,
        netWorth: cumulativeBalance,
      };
    });

    // Goal progress (all time)
    const allTimeBalance = transactions.reduce(
      (acc, t) => acc + (t.type === "income" ? t.amount : -t.amount),
      0
    );
    const goalProgress = savingsGoal > 0 ? Math.min((allTimeBalance / savingsGoal) * 100, 100) : 0;

    // Projected savings (simplified)
    const currentMonth = new Date().getMonth();
    const projectedSavings = monthlyData.map((month, index) => {
      const isProjected = index > currentMonth;
      return {
        ...month,
        balance: monthlyData.slice(0, index + 1).reduce((sum, m) => sum + (m.income - m.expense), 0),
        type: isProjected ? "Projected" : "Actual",
      };
    });

    return {
      totalIncome,
      totalExpense,
      netSavings,
      savingsRate,
      avgMonthlyExpense,
      topCategory,
      monthlyData,
      categoryData,
      netWorthGrowth,
      projectedSavings,
      topCategories,
      biggestExpense,
      goalProgress,
      filteredTransactions,
    };
  }, [transactions, year, monthRange, savingsGoal]);

  if (loading) return <div className="text-center py-8">Loading data...</div>;
  if (error) return <div className="text-center py-8 text-red-500">{error}</div>;

  const fadeUp = { hidden: { opacity: 0, y: 30 }, visible: { opacity: 1, y: 0 } };

  return (
    <motion.div
      className="space-y-8"
      initial="hidden"
      animate="visible"
      transition={{ staggerChildren: 0.15 }}
    >
      {/* 🔹 Filters */}
      <motion.div variants={fadeUp}>
        <Card className="bg-white/70 backdrop-blur-lg border border-gray-100">
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-4 items-center">
              <span className="text-sm font-semibold text-gray-700">Filter Range:</span>
              
              <select
                className="border rounded-lg px-3 py-2 bg-white text-sm"
                value={year}
                onChange={(e) => setYear(e.target.value)}
              >
                {[2023, 2024, 2025].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>

              <select
                className="border rounded-lg px-3 py-2 bg-white text-sm"
                value={monthRange[0]}
                onChange={(e) => {
                  const start = parseInt(e.target.value, 10);
                  setMonthRange([start, Math.max(start, monthRange[1])]);
                }}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m} disabled={m > monthRange[1]}>
                    From {new Date(0, m - 1).toLocaleString("default", { month: "short" })}
                  </option>
                ))}
              </select>

              <select
                className="border rounded-lg px-3 py-2 bg-white text-sm"
                value={monthRange[1]}
                onChange={(e) => {
                  const end = parseInt(e.target.value, 10);
                  setMonthRange([Math.min(monthRange[0], end), end]);
                }}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m} disabled={m < monthRange[0]}>
                    To {new Date(0, m - 1).toLocaleString("default", { month: "short" })}
                  </option>
                ))}
              </select>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setYear(new Date().getFullYear().toString());
                  setMonthRange([1, 12]);
                }}
              >
                Reset Filters
              </Button>

              <div className="ml-auto text-sm text-gray-600">
                Viewing: <span className="font-medium">{formatRange()}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* 🔹 Primary KPIs */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            title: "Total Income",
            value: format(stats.totalIncome), // Updated: use format
            icon: <Wallet className="w-5 h-5 text-green-500" />,
            gradient: "from-green-50 to-green-100/60",
            trend: "positive",
          },
          {
            title: "Total Expenses",
            value: format(stats.totalExpense), // Updated: use format
            icon: <TrendingDown className="w-5 h-5 text-rose-500" />,
            gradient: "from-rose-50 to-rose-100/60",
            trend: "negative",
          },
          {
            title: "Net Balance",
            value: format(stats.netSavings), // Updated: use format
            icon: <PiggyBank className="w-5 h-5 text-indigo-500" />,
            gradient: "from-indigo-50 to-indigo-100/60",
            trend: stats.netSavings >= 0 ? "positive" : "negative",
          },
          {
            title: "Goal Progress",
            value: `${stats.goalProgress.toFixed(1)}%`,
            icon: <Target className="w-5 h-5 text-blue-500" />,
            gradient: "from-blue-50 to-blue-100/60",
            content: (
              <Progress value={stats.goalProgress} className="mt-2" />
            ),
          },
        ].map((kpi, i) => (
          <motion.div key={i} variants={fadeUp}>
            <Card className={`bg-gradient-to-br ${kpi.gradient} backdrop-blur-lg shadow-sm border border-white/40 hover:shadow-lg transition-all`}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{kpi.title}</CardTitle>
                {kpi.icon}
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{kpi.value}</div>
                {kpi.content}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* 🔹 Secondary KPIs */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            title: "Savings Rate",
            value: `${stats.savingsRate.toFixed(1)}%`,
            icon: <TrendingUp className="w-4 h-4 text-emerald-500" />,
            description: "of income saved",
          },
          {
            title: "Avg Monthly Expense",
            value: format(stats.avgMonthlyExpense), // Updated: use format
            icon: <Calculator className="w-4 h-4 text-amber-500" />,
            description: `over ${monthRange[1] - monthRange[0] + 1} months`,
          },
          {
            title: "Top Spending Category",
            value: stats.topCategory,
            icon: <Award className="w-4 h-4 text-purple-500" />,
            description: "highest expense",
          },
          {
            title: "Biggest Expense",
            value: stats.biggestExpense 
              ? format(stats.biggestExpense.amount) // Updated: use format
              : "N/A",
            icon: <BarChart3 className="w-4 h-4 text-red-500" />,
            description: stats.biggestExpense?.category || "",
          },
        ].map((kpi, i) => (
          <motion.div key={i} variants={fadeUp}>
            <Card className="bg-white/70 backdrop-blur-lg border border-gray-100 hover:shadow-md transition-all">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{kpi.title}</CardTitle>
                {kpi.icon}
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold">{kpi.value}</div>
                <p className="text-xs text-gray-500 mt-1">{kpi.description}</p>
                {stats.topCategories.length > 0 && kpi.title === "Top Spending Category" && (
                  <div className="mt-2 space-y-1">
                    {stats.topCategories.slice(0, 3).map((cat, index) => (
                      <div key={cat.name} className="flex justify-between text-xs">
                        <span>{index + 1}. {cat.name}</span>
                        <span className="font-medium">{format(cat.value)}</span> {/* Updated: use format */}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* 🔹 Main Charts */}
      <div className="grid gap-8 lg:grid-cols-2">
        {/* Income vs Expenses */}
        <motion.div variants={fadeUp}>
          <Card className="bg-white/70 backdrop-blur-lg border border-gray-100 hover:shadow-md transition-all">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Income vs Expenses
              </CardTitle>
              <span className="text-sm text-gray-500">{formatRange()}</span>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={stats.monthlyData}>
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(value) => format(value)} /> {/* Updated: use format */}
                  <Legend />
                  <Bar dataKey="income" fill="#22c55e" name="Income" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expense" fill="#ef4444" name="Expense" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        {/* Category Breakdown */}
        <motion.div variants={fadeUp}>
          <Card className="bg-white/70 backdrop-blur-lg border border-gray-100 hover:shadow-md transition-all">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <PieChartIcon className="w-5 h-5" />
                Spending by Category
              </CardTitle>
              <span className="text-sm text-gray-500">{formatRange()}</span>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={stats.categoryData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    labelLine={false}
                  >
                    {stats.categoryData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => format(value)} /> {/* Updated: use format */}
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* 🔹 Advanced Charts */}
      <div className="grid gap-8 lg:grid-cols-2">
        {/* Net Worth Growth */}
        <motion.div variants={fadeUp}>
          <Card className="bg-white/70 backdrop-blur-lg border border-gray-100 hover:shadow-md transition-all">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <LineChartIcon className="w-5 h-5" />
                Net Worth Growth
              </CardTitle>
              <span className="text-sm text-gray-500">{formatRange()}</span>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={stats.netWorthGrowth}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                  <XAxis dataKey="month" />
                  <YAxis tickFormatter={(value) => format(value)} /> {/* Updated: use format */}
                  <Tooltip formatter={(value) => format(value)} /> {/* Updated: use format */}
                  <Line 
                    type="monotone" 
                    dataKey="netWorth" 
                    stroke="#6366f1" 
                    strokeWidth={3}
                    dot={{ r: 4 }}
                    activeDot={{ r: 8 }}
                    name="Cumulative Balance"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        {/* Projected Savings vs Goal */}
        <motion.div variants={fadeUp}>
          <Card className="bg-white/70 backdrop-blur-lg border border-gray-100 hover:shadow-md transition-all">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5" />
                Projected Savings vs Goal
              </CardTitle>
              <span className="text-sm text-gray-500">{year}</span>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={stats.projectedSavings}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                  <XAxis dataKey="month" />
                  <YAxis tickFormatter={(value) => format(value)} /> {/* Updated: use format */}
                  <Tooltip formatter={(value) => format(value)} /> {/* Updated: use format */}
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="balance" 
                    stroke="#6366f1" 
                    strokeWidth={3}
                    dot={{ r: 4 }}
                    activeDot={{ r: 8 }}
                    name="Actual"
                    data={stats.projectedSavings.filter(d => d.type === "Actual")}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="balance" 
                    stroke="#f59e0b" 
                    strokeWidth={3}
                    strokeDasharray="5 5"
                    dot={false}
                    name="Projected"
                    data={stats.projectedSavings.filter(d => d.type === "Projected")}
                  />
                  <ReferenceLine 
                    y={savingsGoal} 
                    stroke="#10b981" 
                    strokeDasharray="3 3"
                    label={{ 
                      value: `Goal: ${format(savingsGoal)}`, // Updated: use format
                      position: "top",
                      fill: "#10b981"
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* 🔹 Export Section */}
      <motion.div variants={fadeUp} className="flex justify-end">
        <Button className="flex items-center gap-2">
          <Download className="w-4 h-4" />
          Export Dashboard Report
        </Button>
      </motion.div>
    </motion.div>
  );
}
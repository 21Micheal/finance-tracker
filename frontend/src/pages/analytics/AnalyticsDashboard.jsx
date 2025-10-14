import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useCurrency } from "@/context/CurrencyContext";
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { ArrowDownCircle, ArrowUpCircle, TrendingUp } from "lucide-react";

const COLORS = ["#4f46e5", "#818cf8", "#a5b4fc", "#c7d2fe"];

export default function AnalyticsDashboard() {
  // Use currency and format from context
  const { currency, format } = useCurrency(); // Updated: use format instead of rate
  
  const [summary, setSummary] = useState({
    totalIncome: 0,
    totalExpense: 0,
    balance: 0,
    byCategory: [],
    monthlyTrends: [],
  });

  useEffect(() => {
    const fetchData = async () => {
      const user = (await supabase.auth.getUser()).data?.user;
      if (!user) return;

      const { data, error } = await supabase
        .from("transactions")
        .select("amount, type, category, date")
        .eq("user_id", user.id);

      if (error) {
        console.error(error);
        return;
      }

      // 1. Calculate totals (amounts are already stored in user's preferred currency)
      const income = data
        .filter((t) => t.type === "income")
        .reduce((acc, t) => acc + t.amount, 0);
        
      const expense = data
        .filter((t) => t.type === "expense")
        .reduce((acc, t) => acc + t.amount, 0);

      // 2. Aggregate by Category
      const categoryMap = {};
      data.forEach((t) => {
        if (t.type === "expense") { 
          if (!categoryMap[t.category]) categoryMap[t.category] = 0;
          categoryMap[t.category] += t.amount;
        }
      });

      const byCategory = Object.entries(categoryMap).map(([name, value]) => ({
        name,
        value,
      }));

      // 3. Monthly trend
      const trendMap = {};
      data.forEach((t) => {
        const month = new Date(t.date).toLocaleString("default", {
          month: "short",
        });
        if (!trendMap[month]) trendMap[month] = { month, income: 0, expense: 0 };
        
        if (t.type === "income") {
          trendMap[month].income += t.amount;
        } else if (t.type === "expense") {
          trendMap[month].expense += t.amount;
        }
      });
      
      const monthlyTrends = Object.values(trendMap);

      setSummary({
        totalIncome: income,
        totalExpense: expense,
        balance: income - expense,
        byCategory,
        monthlyTrends,
      });
    };

    fetchData();
  }, [currency]); // Re-run effect when currency changes

  // Custom Tooltip formatter for BarChart to display currency
  const CurrencyTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-800 text-white p-2 rounded-lg shadow-md text-sm border border-slate-700">
          <p className="font-semibold mb-1">{label}</p>
          {payload.map((p, i) => (
            <p key={i} style={{ color: p.color }}>
              {`${p.name}: ${format(p.value)}`} {/* Updated: use format */}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
        Analytics Overview
      </h1>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Income Card */}
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <ArrowUpCircle className="text-green-500 w-6 h-6" />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Total Income
            </p>
          </div>
          <h2 className="text-2xl font-semibold mt-2 text-slate-900 dark:text-slate-100">
            {format(summary.totalIncome)} {/* Updated: use format */}
          </h2>
        </div>

        {/* Total Expense Card */}
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <ArrowDownCircle className="text-red-500 w-6 h-6" />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Total Expense
            </p>
          </div>
          <h2 className="text-2xl font-semibold mt-2 text-slate-900 dark:text-slate-100">
            {format(summary.totalExpense)} {/* Updated: use format */}
          </h2>
        </div>

        {/* Balance Card */}
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <TrendingUp className="text-indigo-500 w-6 h-6" />
            <p className="text-sm text-slate-500 dark:text-slate-400">Balance</p>
          </div>
          <h2 className="text-2xl font-semibold mt-2 text-slate-900 dark:text-slate-100">
            {format(summary.balance)} {/* Updated: use format */}
          </h2>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Category breakdown (Expense) */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold mb-4 text-slate-800 dark:text-slate-100">
            Spending by Category
          </h3>
          <div className="h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={summary.byCategory}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={90}
                  label={({ name, value }) =>
                    `${name}: ${format(value)}`  // Updated: use format
                  } 
                >
                  {summary.byCategory.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value) => format(value)} // Updated: use format
                  contentStyle={{
                    backgroundColor: "#1e293b",
                    color: "#fff",
                    borderRadius: "0.5rem",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Monthly trend (Bar Chart) */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold mb-4 text-slate-800 dark:text-slate-100">
            Monthly Trends
          </h3>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={summary.monthlyTrends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(value) => format(value)} /> {/* Updated: use format */}
                <Tooltip content={<CurrencyTooltip />} />
                <Bar dataKey="income" fill="#4f46e5" name="Income" />
                <Bar dataKey="expense" fill="#f87171" name="Expense" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
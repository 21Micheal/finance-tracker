const API_BASE = import.meta.env.VITE_FLASK_API_URL;
import { supabase } from "@/lib/supabaseClient";

export async function generateAIInsights(transactions, currency) {
  try {
    const response = await fetch(`${API_BASE}/api/ai_insights`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactions, currency }),
    });
    console.log("AI Insights → Status:", response.status);
    const text = await response.text();
    console.log("AI Insights → Raw response:", text || "(empty)");
    if (!text) throw new Error("Empty response from server");
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error("Response was not valid JSON: " + text.slice(0, 200));
    }
    if (!response.ok) {
      throw new Error(data.error || "Server error occurred");
    }
    return data.insights;
  } catch (err) {
    console.error("AI Insights Error:", err);
    throw err;
  }
}

export function getMonthlyTrends(transactions, currency) {
  if (!transactions || transactions.length === 0) return [];
  const monthly = {};
  transactions.forEach(t => {
    const month = new Date(t.date).toLocaleString("default", { month: "short", year: "numeric" });
    if (!monthly[month]) monthly[month] = { income: 0, spending: 0, savings: 0, month };
    if (t.type === "income") monthly[month].income += t.amount;
    else monthly[month].spending += t.amount;
  });
  Object.values(monthly).forEach(m => (m.savings = m.income - m.spending));
  return Object.values(monthly).sort((a, b) => new Date(a.month) - new Date(b.month));
}

export function calculateTrendSummary(trends, currency) {
  if (!trends || trends.length < 2) return null;
  const last = trends[trends.length - 1];
  const prev = trends[trends.length - 2];
  const calcChange = (curr, prev) =>
    prev === 0 ? 0 : ((curr - prev) / Math.abs(prev)) * 100;
  const calcDiff = (curr, prev) => curr - prev;
  return {
    spendingChange: calcChange(last.spending, prev.spending),
    incomeChange: calcChange(last.income, prev.income),
    savingsChange: calcChange(last.savings, prev.savings),
    spendingDiff: calcDiff(last.spending, prev.spending),
    incomeDiff: calcDiff(last.income, prev.income),
    savingsDiff: calcDiff(last.savings, prev.savings),
  };
}

export async function fetchAllTransactions() {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .order("date", { ascending: true });
  if (error) {
    console.error("Error fetching transactions:", error);
    throw error;
  }
  return data || [];
}

export async function analyzeLongTermTrends(currency = "USD") {
  try {
    const transactions = await fetchAllTransactions();
    if (!transactions.length) {
      return { error: "No transactions found." };
    }
    // 1️⃣ Get monthly grouped data
    const trends = getMonthlyTrends(transactions, currency);
    // 2️⃣ Compute summary (month-over-month changes)
    const summaryData = calculateTrendSummary(trends, currency);
    if (!summaryData) {
      return {
        summary: "Not enough data to determine trend.",
        trends,
      };
    }
    const spendingChange = summaryData.spendingChange.toFixed(1);
    const direction = spendingChange > 0 ? "increased" : "decreased";
    return {
      summary: `Your spending ${direction} by ${Math.abs(spendingChange)}% compared to last month.`,
      trends,
      details: summaryData,
    };
  } catch (err) {
    console.error("analyzeLongTermTrends error:", err);
    return { error: "Failed to analyze long-term trends." };
  }
}

// Generate smart alerts based on trend data
export function generateSmartAlerts(trendData) {
  const alerts = [];
  
  if (!trendData?.trends || trendData.trends.length < 2) {
    return alerts;
  }

  const last = trendData.trends.at(-1);
  const prev = trendData.trends.at(-2);
  
  // Spending alerts
  const change = ((last.spending - prev.spending) / prev.spending) * 100;
  
  if (change > 15) {
    alerts.push({
      type: "warning",
      title: "Spending Surge",
      message: `Your spending increased by ${change.toFixed(1)}% compared to last month.`,
      iconType: "trendingUp",
    });
  } else if (change < -10) {
    alerts.push({
      type: "success",
      title: "Great Progress!",
      message: `Your spending dropped by ${Math.abs(change).toFixed(1)}% — keep it up!`,
      iconType: "trendingDown",
    });
  } else {
    alerts.push({
      type: "neutral",
      title: "Stable Spending",
      message: "Your monthly spending stayed roughly consistent.",
      iconType: "scale",
    });
  }

  // Savings alerts
  const savingChange = ((last.savings - prev.savings) / Math.abs(prev.savings || 1)) * 100;
  
  if (savingChange > 10) {
    alerts.push({
      type: "success",
      title: "Savings Improving",
      message: `Savings improved by ${savingChange.toFixed(1)}% this month.`,
      iconType: "trendingUpGreen",
    });
  } else if (savingChange < -10) {
    alerts.push({
      type: "warning",
      title: "Savings Decline",
      message: `Savings decreased by ${Math.abs(savingChange).toFixed(1)}%. Consider reviewing expenses.`,
      iconType: "trendingDownRed",
    });
  }

  return alerts;
}
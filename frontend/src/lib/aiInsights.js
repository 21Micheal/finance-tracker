const API_BASE = import.meta.env.VITE_FLASK_API_URL;
import { supabase } from "@/lib/supabaseClient";

/**
 * 🔹 Generate AI insights using transactions passed from React
 */
export async function generateAIInsights(transactions, currency) {
  try {
    // Validate input
    if (!transactions || !Array.isArray(transactions)) {
      console.warn("No transactions provided to generateAIInsights");
      return "No transactions available for analysis.";
    }

    if (transactions.length === 0) {
      return "Add some transactions to generate AI insights.";
    }

    console.log(`🧠 Generating AI insights for ${transactions.length} transactions`);

    const response = await fetch(`${API_BASE}/api/ai_insights`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactions, currency }),
    });

    console.log("AI Insights → Status:", response.status);
    
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const data = await response.json();
    return data.insights || "No insights generated.";

  } catch (err) {
    console.error("AI Insights Error:", err);
    // Return a fallback message instead of throwing
    return "Unable to generate AI insights at this time. Please try again later.";
  }
}

/**
 * 🔹 Compute monthly trends from provided transactions
 */
export function getMonthlyTrends(transactions, currency) {
  if (!transactions || transactions.length === 0) return [];

  const monthly = {};

  transactions.forEach(t => {
    try {
      const month = new Date(t.date).toLocaleString("default", {
        month: "short",
        year: "numeric",
      });
      if (!monthly[month]) monthly[month] = { income: 0, spending: 0, savings: 0, month };
      
      if (t.type === "income") {
        monthly[month].income += t.amount || 0;
      } else {
        monthly[month].spending += t.amount || 0;
      }
    } catch (error) {
      console.warn("Invalid transaction date:", t.date);
    }
  });

  Object.values(monthly).forEach(m => {
    m.savings = m.income - m.spending;
  });

  return Object.values(monthly).sort(
    (a, b) => new Date(a.month) - new Date(b.month)
  );
}

/**
 * 🔹 Get spending categories from provided transactions
 */
export function getSpendingCategories(transactions) {
  if (!transactions || transactions.length === 0) return [];

  const categories = {};
  
  transactions
    .filter((tx) => tx.type === "expense")
    .forEach((tx) => {
      const category = tx.category || "Uncategorized";
      categories[category] = (categories[category] || 0) + (tx.amount || 0);
    });

  return Object.entries(categories)
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total); // Sort by highest spending first
}

/**
 * 🔹 Summarize month-over-month trend changes
 */
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

/**
 * 🔹 Analyze long-term trends from provided transactions (NO API CALLS)
 */
export function analyzeLongTermTrends(transactions, currency = "USD") {
  try {
    if (!transactions || transactions.length === 0) {
      return { 
        error: "No transactions available for analysis.",
        trends: [],
        details: null
      };
    }

    console.log(`📊 Analyzing ${transactions.length} transactions for trends`);

    // Group monthly
    const trends = getMonthlyTrends(transactions, currency);
    const summaryData = calculateTrendSummary(trends, currency);

    if (!summaryData) {
      return {
        summary: "Not enough historical data to determine trends. Add more transactions across multiple months.",
        trends,
        details: null
      };
    }

    const spendingChange = summaryData.spendingChange;
    const incomeChange = summaryData.incomeChange;
    const savingsChange = summaryData.savingsChange;

    let summary = "";
    
    if (Math.abs(spendingChange) > 5) {
      const direction = spendingChange > 0 ? "increased" : "decreased";
      summary += `Your spending ${direction} by ${Math.abs(spendingChange).toFixed(1)}% compared to last month. `;
    } else {
      summary += "Your spending remained stable this month. ";
    }

    if (Math.abs(incomeChange) > 5) {
      const direction = incomeChange > 0 ? "increased" : "decreased";
      summary += `Income ${direction} by ${Math.abs(incomeChange).toFixed(1)}%. `;
    }

    if (savingsChange > 10) {
      summary += `Savings improved significantly by ${savingsChange.toFixed(1)}%.`;
    } else if (savingsChange < -10) {
      summary += `Savings decreased by ${Math.abs(savingsChange).toFixed(1)}%.`;
    }

    return {
      summary: summary || "Financial patterns are relatively stable this period.",
      trends,
      details: summaryData,
    };
  } catch (err) {
    console.error("analyzeLongTermTrends error:", err);
    return { 
      error: "Failed to analyze transaction trends.",
      trends: [],
      details: null
    };
  }
}

/**
 * 🔹 Generate alerts from trend data
 */
export function generateSmartAlerts(trendData) {
  const alerts = [];

  if (!trendData?.trends || trendData.trends.length < 2) {
    alerts.push({
      type: "info",
      title: "More Data Needed",
      message: "Add more transactions across multiple months to generate detailed alerts.",
      iconType: "scale",
    });
    return alerts;
  }

  const last = trendData.trends[trendData.trends.length - 1];
  const prev = trendData.trends[trendData.trends.length - 2];

  const spendingChange = ((last.spending - prev.spending) / prev.spending) * 100;

  if (spendingChange > 20) {
    alerts.push({
      type: "warning",
      title: "Spending Surge",
      message: `Your spending increased by ${spendingChange.toFixed(1)}% compared to last month.`,
      iconType: "trendingUp",
    });
  } else if (spendingChange < -15) {
    alerts.push({
      type: "success",
      title: "Great Progress!",
      message: `Your spending dropped by ${Math.abs(spendingChange).toFixed(1)}% — keep it up!`,
      iconType: "trendingDown",
    });
  } else if (Math.abs(spendingChange) < 5) {
    alerts.push({
      type: "neutral",
      title: "Stable Spending",
      message: "Your monthly spending stayed consistent.",
      iconType: "scale",
    });
  }

  const savingChange = ((last.savings - prev.savings) / Math.abs(prev.savings || 1)) * 100;

  if (savingChange > 15) {
    alerts.push({
      type: "success",
      title: "Savings Improving",
      message: `Savings improved by ${savingChange.toFixed(1)}% this month.`,
      iconType: "trendingUpGreen",
    });
  } else if (savingChange < -15) {
    alerts.push({
      type: "warning",
      title: "Savings Decline",
      message: `Savings decreased by ${Math.abs(savingChange).toFixed(1)}%. Consider reviewing expenses.`,
      iconType: "trendingDownRed",
    });
  }

  // Add budget alert if spending is high
  if (last.spending > last.income * 0.8) {
    alerts.push({
      type: "warning",
      title: "High Spending Ratio",
      message: `You're spending ${((last.spending / last.income) * 100).toFixed(1)}% of your income.`,
      iconType: "alertTriangle",
    });
  }

  return alerts;
}

// 🚫 REMOVE THIS FUNCTION - it's causing the infinite loop!
/*
export async function fetchAllTransactions() {
  try {
    // This causes infinite loops by making API calls
    const { data: supabaseTx, error } = await supabase
      .from("transactions")
      .select("*")
      .order("date", { ascending: true });

    if (error) throw error;

    const mpesaResponse = await fetch(`${API_BASE}/api/mpesa/transactions`);
    const mpesaTx = mpesaResponse.ok ? await mpesaResponse.json() : [];

    console.log(`📦 Supabase: ${supabaseTx?.length || 0}, M-Pesa: ${mpesaTx?.length || 0}`);

    const allTx = [...(supabaseTx || []), ...(mpesaTx || [])];
    return allTx || [];
  } catch (err) {
    console.error("Error fetching combined transactions:", err);
    throw err;
  }
}
*/
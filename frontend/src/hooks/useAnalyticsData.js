import { useMemo } from "react";
import { useTransactions } from "@/hooks/useTransactions";

export function useAnalyticsData(user) {
  const { transactions } = useTransactions(user);

  const analytics = useMemo(() => {
    if (!transactions || transactions.length === 0)
      return { totalIncome: 0, totalExpense: 0, categories: [], monthly: [] };

    // Separate income and expenses
    const income = transactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);

    const expense = transactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);

    // Group by category
    const categories = Object.entries(
      transactions.reduce((acc, t) => {
        if (t.type === "expense") {
          acc[t.category] = (acc[t.category] || 0) + t.amount;
        }
        return acc;
      }, {})
    ).map(([name, value]) => ({ name, value }));

    // Group by month
    const monthly = Object.entries(
      transactions.reduce((acc, t) => {
        const month = new Date(t.date).toLocaleString("default", { month: "short", year: "numeric" });
        acc[month] = acc[month] || { income: 0, expense: 0 };
        if (t.type === "income") acc[month].income += t.amount;
        else acc[month].expense += t.amount;
        return acc;
      }, {})
    ).map(([month, values]) => ({ month, ...values }));

    return {
      totalIncome: income,
      totalExpense: expense,
      balance: income - expense,
      categories,
      monthly,
    };
  }, [transactions]);

  return analytics;
}

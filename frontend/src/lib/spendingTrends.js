const API_BASE = import.meta.env.VITE_FLASK_API_URL;

export async function generateAIInsights(transactions, currency) {
  try {
    const response = await fetch(`${API_BASE}/api/api_spending_trends`, {
    method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactions }),
    });

    if (!response.ok) throw new Error("Failed to fetch trends");
    const data = await response.json();
    return data.trends || [];
  } catch (err) {
    console.error("Spending Trends Error:", err);
    return [];
  }
}

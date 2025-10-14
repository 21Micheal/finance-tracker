import React, { useState } from "react";
import { fetchSpendingTrends } from "../api/spendingTrends";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function SpendingTrends({ transactions }) {
  const [trends, setTrends] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleAnalyzeTrends = async () => {
    setLoading(true);
    const results = await fetchSpendingTrends(transactions);
    setTrends(results);
    setLoading(false);
  };

  return (
    <Card className="p-6 rounded-2xl shadow-md">
      <CardHeader className="text-xl font-semibold">Spending Trends</CardHeader>
      <CardContent>
        <Button onClick={handleAnalyzeTrends} disabled={loading}>
          {loading ? "Analyzing..." : "Analyze Trends"}
        </Button>
        <div className="mt-4 space-y-2">
          {trends.length > 0 ? (
            trends.map((t, idx) => (
              <p key={idx} className="text-gray-700">{t}</p>
            ))
          ) : (
            <p className="text-gray-500">No trend data available.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

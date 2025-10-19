from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from collections import defaultdict
import numpy as np
import pandas as pd
from uuid import UUID
from typing import Union

router = APIRouter(prefix="/api", tags=["AI Insights"])

# ---------- Models ----------
class Transaction(BaseModel):
    id: Union[int, str, UUID]
    date: str
    amount: float
    type: str
    category: Optional[str] = "Other"

class AIRequest(BaseModel):
    transactions: List[Transaction]
    currency: str = "USD"
    savingsGoal: Optional[float] = 0.0


# ---------- /api/ai_insights ----------
@router.post("/ai_insights")
async def ai_insights(request: AIRequest):
    try:
        transactions = request.transactions
        currency = request.currency
        savings_goal = request.savingsGoal or 0.0

        if not transactions:
            raise HTTPException(status_code=400, detail="No transactions provided")

        # Split
        expenses = [t for t in transactions if t.type == "expense"]
        income = [t for t in transactions if t.type == "income"]

        total_expense = sum(t.amount for t in expenses)
        total_income = sum(t.amount for t in income)
        savings = total_income - total_expense
        savings_rate = (savings / total_income * 100) if total_income else 0

        # Categories
        category_totals = defaultdict(float)
        for tx in expenses:
            category_totals[tx.category] += tx.amount
        top_cats = sorted(category_totals.items(), key=lambda x: x[1], reverse=True)[:3]

        # Monthly breakdowns
        monthly_expenses, monthly_income = defaultdict(float), defaultdict(float)
        for tx in transactions:
            try:
                month = datetime.fromisoformat(tx.date).strftime("%Y-%m")
                if tx.type == "expense":
                    monthly_expenses[month] += tx.amount
                elif tx.type == "income":
                    monthly_income[month] += tx.amount
            except Exception:
                continue

        sorted_months = sorted(monthly_expenses.items())
        month_values = [v for _, v in sorted_months]
        avg_monthly_expense = np.mean(month_values) if month_values else 0

        # Detect trend
        trend = "stable"
        if len(month_values) >= 2:
            diff = month_values[-1] - month_values[-2]
            if diff > 0.1 * month_values[-2]:
                trend = "increasing"
            elif diff < -0.1 * month_values[-2]:
                trend = "decreasing"

        # Overspending streak
        overspending_streak = sum(
            month_values[i] > month_values[i - 1]
            for i in range(1, len(month_values))
        )
        streak_alert = (
            f"You’ve had {overspending_streak} consecutive months of rising expenses."
            if overspending_streak >= 2
            else ""
        )

        # Irregular income
        income_values = list(monthly_income.values())
        irregular_income = (
            np.std(income_values) / np.mean(income_values) > 0.3
            if len(income_values) >= 2
            else False
        )

        # Growth percentage
        growth_rate = 0
        if len(month_values) >= 2:
            prev, curr = month_values[-2], month_values[-1]
            growth_rate = ((curr - prev) / prev * 100) if prev else 0

        # Goal projection
        goal_eta = None
        if savings > 0 and savings_goal > 0:
            avg_monthly_savings = savings_rate / 100 * avg_monthly_expense
            if avg_monthly_savings > 0:
                months_to_goal = (savings_goal - savings) / avg_monthly_savings
                goal_eta = f"Approx. {months_to_goal:.1f} months to reach goal."

        # Insights
        insights = {
            "spending_overview": (
                f"You’ve spent {currency} {total_expense:,.2f}. "
                f"Top categories: {', '.join([f'{c[0]} ({currency} {c[1]:,.2f})' for c in top_cats])}. "
                f"Avg monthly expense: {currency} {avg_monthly_expense:,.2f}."
            ),
            "trend_analysis": (
                f"Spending trend: {trend}. "
                f"Month-over-month change: {growth_rate:+.1f}%."
            ),
            "savings_analysis": (
                f"Savings: {currency} {savings:,.2f} ({savings_rate:.1f}% of income)."
            ),
            "goal_projection": goal_eta or "Goal projection unavailable.",
            "streak_alert": streak_alert,
            "income_stability": (
                "⚠️ Income appears irregular — plan a buffer for low months."
                if irregular_income else "✅ Income appears stable."
            ),
        }

        # Alerts
        alerts = []
        if savings_rate < 10:
            alerts.append("⚠️ Low savings rate — consider automating monthly transfers.")
        if total_expense > total_income:
            alerts.append("🚨 Expenses exceed income — review budget allocations.")
        if overspending_streak >= 2:
            alerts.append("📈 Continuous spending increase detected.")
        insights["alerts"] = alerts

        return {"insights": insights}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process insights: {e}")


# ---------- /api/ai_spending_trends ----------
@router.post("/ai_spending_trends")
async def ai_spending_trends(request: AIRequest):
    try:
        transactions = request.transactions
        if not transactions:
            raise HTTPException(status_code=400, detail="No transactions provided")

        df = pd.DataFrame([t.dict() for t in transactions])
        df["date"] = pd.to_datetime(df["date"])
        df["month"] = df["date"].dt.to_period("M")

        monthly = (
            df.groupby(["category", "month"])["amount"]
            .sum()
            .reset_index()
            .sort_values(["category", "month"])
        )

        trends = []
        for category, group in monthly.groupby("category"):
            group = group.sort_values("month")
            if len(group) < 2:
                continue

            last_month = group.iloc[-2]
            current_month = group.iloc[-1]
            change = ((current_month["amount"] - last_month["amount"]) / last_month["amount"]) * 100

            if change > 10:
                message = f"📈 Your spending in {category} increased by {change:.1f}% this month."
            elif change < -10:
                message = f"📉 You reduced spending in {category} by {abs(change):.1f}% — great job!"
            else:
                message = f"⚖️ Your spending in {category} is stable."

            trends.append(message)

        return {"trends": trends}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Trend Analysis Error: {e}")

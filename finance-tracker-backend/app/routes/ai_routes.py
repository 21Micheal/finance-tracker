from flask import Blueprint, jsonify, request
from datetime import datetime
import numpy as np
from collections import defaultdict
import pandas as pd

ai_bp = Blueprint('ai', __name__)

@ai_bp.route("/ai_insights", methods=["POST"])
def ai_insights():
    try:
        data = request.get_json()
        transactions = data.get("transactions", [])
        currency = data.get("currency", "USD")
        savings_goal = float(data.get("savingsGoal", 0))

        if not transactions:
            return jsonify({"error": "No transactions provided"}), 400

        # Split transactions
        expenses = [t for t in transactions if t.get("type") == "expense"]
        income = [t for t in transactions if t.get("type") == "income"]

        # Totals
        total_expense = sum(float(t["amount"]) for t in expenses)
        total_income = sum(float(t["amount"]) for t in income)
        savings = total_income - total_expense
        savings_rate = (savings / total_income * 100) if total_income else 0

        # Category totals
        category_totals = defaultdict(float)
        for tx in expenses:
            category_totals[tx.get("category", "Other")] += float(tx["amount"])
        top_cats = sorted(category_totals.items(), key=lambda x: x[1], reverse=True)[:3]

        # Monthly breakdowns
        monthly_expenses, monthly_income = defaultdict(float), defaultdict(float)
        for tx in transactions:
            try:
                month = datetime.fromisoformat(tx["date"]).strftime("%Y-%m")
                if tx.get("type") == "expense":
                    monthly_expenses[month] += float(tx["amount"])
                elif tx.get("type") == "income":
                    monthly_income[month] += float(tx["amount"])
            except Exception:
                continue

        # Monthly trends
        sorted_months = sorted(monthly_expenses.items())
        month_labels = [m for m, _ in sorted_months]
        month_values = [v for _, v in sorted_months]
        avg_monthly_expense = np.mean(month_values) if month_values else 0

        # Detect trend direction
        trend = None
        if len(month_values) >= 2:
            diff = month_values[-1] - month_values[-2]
            if diff > 0.1 * month_values[-2]:
                trend = "increasing"
            elif diff < -0.1 * month_values[-2]:
                trend = "decreasing"
            else:
                trend = "stable"

        # --- New Intelligence Layer ---

        # 1️⃣ Overspending streak detection
        overspending_streak = 0
        for i in range(1, len(month_values)):
            if month_values[i] > month_values[i - 1]:
                overspending_streak += 1
        streak_alert = (
            f"You’ve had {overspending_streak} consecutive months of rising expenses."
            if overspending_streak >= 2
            else ""
        )

        # 2️⃣ Irregular income check
        income_values = list(monthly_income.values())
        irregular_income = (
            np.std(income_values) / np.mean(income_values) > 0.3
            if len(income_values) >= 2
            else False
        )

        # 3️⃣ Growth percentage
        growth_rate = 0
        if len(month_values) >= 2:
            prev, curr = month_values[-2], month_values[-1]
            growth_rate = ((curr - prev) / prev * 100) if prev else 0

        # 4️⃣ Goal projection (ETA)
        goal_eta = None
        if savings > 0 and savings_goal > 0:
            avg_monthly_savings = savings_rate / 100 * avg_monthly_expense
            months_to_goal = (savings_goal - savings) / avg_monthly_savings if avg_monthly_savings > 0 else None
            goal_eta = f"Approx. {months_to_goal:.1f} months to reach goal." if months_to_goal else None

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

        # Alerts & Recommendations
        alerts = []
        if savings_rate < 10:
            alerts.append("⚠️ Low savings rate — consider automating monthly transfers.")
        if total_expense > total_income:
            alerts.append("🚨 Expenses exceed income — review budget allocations.")
        if overspending_streak >= 2:
            alerts.append("📈 Continuous spending increase detected.")

        insights["alerts"] = alerts

        return jsonify({"insights": insights}), 200

    except Exception as e:
        print("AI Insights error:", e)
        return jsonify({"error": "Failed to process insights"}), 500


@ai_bp.route("/ai_spending_trends", methods=["POST"])
def ai_spending_trends():
    try:
        data = request.get_json()
        transactions = data.get("transactions", [])

        if not transactions:
            return jsonify({"error": "No transactions provided"}), 400

        # Convert to DataFrame
        df = pd.DataFrame(transactions)

        # Ensure date column is datetime
        df["date"] = pd.to_datetime(df["date"])
        df["month"] = df["date"].dt.to_period("M")

        # Group by category and month
        monthly = (
            df.groupby(["category", "month"])["amount"]
            .sum()
            .reset_index()
            .sort_values(["category", "month"])
        )

        # Calculate month-over-month change
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

        return jsonify({"trends": trends})

    except Exception as e:
        print("Trend Analysis Error:", e)
        return jsonify({"error": str(e)}), 500

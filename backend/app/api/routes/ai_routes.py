from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from collections import defaultdict
import numpy as np
import pandas as pd
from uuid import UUID
from typing import Union
# Removed sklearn dependency and use numpy.polyfit for simple linear regression fallback
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.transaction import Transaction, User
# Import current user dependency and User model for authentication
from app.api.deps import get_current_user
from prophet import Prophet
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["AI Insights"])

# ---------- Models ----------
class Transaction(BaseModel):
    id: Union[int, str, UUID]
    date: str
    amount: float
    type: str = Field(default="expense")  # Add default
    category: str = Field(default="Other")  # Add default
    
    class Config:
        # Allow extra fields from your database
        extra = "ignore"

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


@router.post("/ai_spending_trends_debug")
async def ai_spending_trends_debug(request: dict):
    """Debug endpoint to see raw request data"""
    logger.info(f"📥 RAW REQUEST DATA: {request}")
    
    # Check transaction structure
    if "transactions" in request:
        transactions = request["transactions"]
        logger.info(f"📊 Transactions count: {len(transactions)}")
        
        if transactions and len(transactions) > 0:
            sample = transactions[0]
            logger.info(f"📋 Sample transaction structure:")
            logger.info(f"  Keys: {list(sample.keys())}")
            logger.info(f"  Types: {{key: type(value) for key, value in sample.items()}}")
            
            # Check for required fields
            required = ["id", "date", "amount", "type", "category"]
            missing = [field for field in required if field not in sample]
            if missing:
                logger.error(f"❌ Missing fields: {missing}")
    
    return {"received": True, "data": request}

# ---------- /api/ai_spending_trends ----------
@router.post("/ai_spending_trends")
async def ai_spending_trends(request: AIRequest):
    try:
                # DEBUG: Log the incoming request
        logger.info(f"📥 Received AI spending trends request:")
        logger.info(f"  Transaction count: {len(request.transactions) if request.transactions else 0}")
        logger.info(f"  Currency: {request.currency}")
        
        if request.transactions and len(request.transactions) > 0:
            sample_txn = request.transactions[0]
            logger.info(f"  Sample transaction: {sample_txn}")
            logger.info(f"  Sample transaction type: {type(sample_txn)}")
        transactions = request.transactions
        if not transactions:
            return {"trends": [], "message": "No transactions to analyze"}

        # Convert Pydantic objects to simple dictionaries safely
        # model_dump is the Pydantic v2 way; use .dict() if on v1
        data = []
        for t in transactions:
            d = t.model_dump() if hasattr(t, 'model_dump') else t.dict()
            # Ensure the UUID/Int ID is a string so Pandas doesn't choke
            d['id'] = str(d['id']) 
            data.append(d)

        df = pd.DataFrame(data)
        
        # Ensure date is parsed correctly
        df["date"] = pd.to_datetime(df["date"])
        
        # ⚠️ CRITICAL FIX: The logic crashes if there is only 1 month of data
        # because current_month = group.iloc[-1] and last_month = group.iloc[-2]
        # will throw an IndexError if len(group) < 2.
        
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
            
            # Skip if we don't have enough months to compare
            if len(group) < 2:
                trends.append(f"⚖️ Spending in {category} is being tracked for the first time.")
                continue

            last_month = group.iloc[-2]
            current_month = group.iloc[-1]
            
            # Avoid division by zero
            denom = last_month["amount"] if last_month["amount"] != 0 else 1
            change = ((current_month["amount"] - denom) / denom) * 100

            if change > 10:
                message = f"📈 Your spending in {category} increased by {change:.1f}% this month."
            elif change < -10:
                message = f"📉 You reduced spending in {category} by {abs(change):.1f}% — great job!"
            else:
                message = f"⚖️ Your spending in {category} is stable."
            trends.append(message)

        return {"trends": trends}

    except Exception as e:
        logger.error(f"Trend Analysis Error: {str(e)}")
        # Provide the actual error in the response for easier debugging
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")

@router.get("/predict")
async def predict_financial_trends(
    granularity: str = Query("monthly", enum=["weekly", "monthly"]),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        # 1. Fetch data
        transactions = db.query(Transaction).filter(Transaction.user_id == current_user.id).all()

        if len(transactions) < 3:
            return {"forecast": [], "message": "Need at least 3 transactions to generate a forecast."}

        # 2. Preparation
        df = pd.DataFrame([{"date": t.date, "amount": t.amount, "type": t.type} for t in transactions])
        df["date"] = pd.to_datetime(df["date"])

        # Calculate Historical Baseline (The "Dynamic Budget")
        # We take the average of historical monthly expenses to act as a benchmark
        hist_monthly = df[df["type"] == "expense"].set_index("date").resample("ME")["amount"].sum()
        avg_monthly_spend = float(hist_monthly.mean()) if not hist_monthly.empty else 0

        if granularity == "weekly":
            df["period"] = df["date"].dt.to_period("W").dt.to_timestamp()
            freq_code, periods_to_predict, date_format = "W", 4, "Week %U"
            benchmark = avg_monthly_spend / 4
        else:
            df["period"] = df["date"].dt.to_period("M").dt.to_timestamp()
            freq_code, periods_to_predict, date_format = "MS", 3, "%B %Y"
            benchmark = avg_monthly_spend

        # Aggregate metrics for Prophet
        data_grouped = df.groupby(["period", "type"])["amount"].sum().unstack(fill_value=0).reset_index()
        for col in ["income", "expense"]:
            if col not in data_grouped.columns: data_grouped[col] = 0.0
        
        if len(data_grouped) < 2:
            return {"forecast": [], "message": "Insufficient history for this view."}

        # 3. Prediction Logic
        forecasts = {}
        def prophet_forecast(series_name):
            sub_df = pd.DataFrame({"ds": data_grouped["period"], "y": data_grouped[series_name]})
            model = Prophet(yearly_seasonality=False, weekly_seasonality=(granularity == "weekly"), daily_seasonality=False)
            model.fit(sub_df)
            future = model.make_future_dataframe(periods=periods_to_predict, freq=freq_code)
            return model.predict(future)[["ds", "yhat"]].tail(periods_to_predict)

        for metric in ["income", "expense"]:
            forecasts[metric] = prophet_forecast(metric)

        # 4. Format Output with "Smart Baseline" Alerts
        forecast_result = []
        for i in range(periods_to_predict):
            ds = forecasts["income"].iloc[i]["ds"]
            pred_expense = round(float(forecasts["expense"].iloc[i]["yhat"]), 2)
            pred_income = round(float(forecasts["income"].iloc[i]["yhat"]), 2)
            
            # Alert logic: Is predicted spending > historical average?
            is_unusual = benchmark > 0 and pred_expense > (benchmark * 1.1) # 10% buffer
            
            forecast_result.append({
                "label": ds.strftime(date_format),
                "date": ds.strftime("%Y-%m-%d"),
                "income": pred_income,
                "expense": pred_expense,
                "savings": round(pred_income - pred_expense, 2),
                "insight": {
                    "baseline_limit": round(benchmark, 2),
                    "is_above_average": is_unusual,
                    "difference_from_avg": round(pred_expense - benchmark, 2)
                }
            })

        return {
            "granularity": granularity,
            "historical_avg_spending": round(avg_monthly_spend, 2),
            "forecast": forecast_result,
            "alerts": [f"Heads up! Your spending in {f['label']} is predicted to be higher than your usual average." for f in forecast_result if f['insight']['is_above_average']]
        }

    except Exception as e:
        logger.error(f"Prediction Error: {str(e)}")
        return {"forecast": [], "error": "Could not generate forecast"}
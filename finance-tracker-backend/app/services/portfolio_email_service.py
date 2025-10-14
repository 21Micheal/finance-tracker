from datetime import datetime, timedelta
from flask import render_template
from app import db
from app.models import User, Investment, InvestmentHistory
from app.services.email_service import send_email

def send_portfolio_summary():
    """
    Send a weekly/daily portfolio summary email to all users.
    """
    users = User.query.all()
    now = datetime.utcnow()
    last_week = now - timedelta(days=7)

    for user in users:
        investments = Investment.query.filter_by(user_id=user.id).all()
        if not investments:
            continue

        portfolio_data = []
        total_value = 0

        for inv in investments:
            # Latest snapshot
            latest = (
                InvestmentHistory.query
                .filter(InvestmentHistory.investment_id == inv.id)
                .order_by(InvestmentHistory.recorded_at.desc())
                .first()
            )
            # Snapshot 1 week ago
            past = (
                InvestmentHistory.query
                .filter(
                    InvestmentHistory.investment_id == inv.id,
                    InvestmentHistory.recorded_at <= last_week
                )
                .order_by(InvestmentHistory.recorded_at.desc())
                .first()
            )

            current_value = latest.value if latest else 0
            past_value = past.value if past else current_value
            change = current_value - past_value
            change_pct = (change / past_value * 100) if past_value > 0 else 0

            portfolio_data.append({
                "symbol": inv.symbol,
                "quantity": inv.quantity,
                "current_value": current_value,
                "change": change,
                "change_pct": round(change_pct, 2)
            })
            total_value += current_value

        # Render HTML template
        html_body = render_template(
            "emails/portfolio_summary.html",
            portfolio_data=portfolio_data,
            total_value=total_value,
            now=now
        )

        send_email(
            to=user.email,
            subject="📈 Your Weekly Portfolio Summary",
            body=html_body
        )

        print(f"✅ Sent portfolio summary email to {user.email}")

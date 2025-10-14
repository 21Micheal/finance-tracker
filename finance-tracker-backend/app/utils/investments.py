from app.models import Investment, InvestmentSnapshot, db
from datetime import datetime,  timedelta
from sqlalchemy import func

def calculate_investment_roi(investment: Investment):
    """Calculate ROI for a single investment"""
    if not investment.current_price:
        return None
    
    invested = investment.units * investment.purchase_price
    current_value = investment.units * investment.current_price
    roi = (current_value - invested) / invested * 100 if invested > 0 else 0
    return {
        "investment_id": investment.id,
        "name": investment.name,
        "roi_percent": round(roi, 2),
        "current_value": current_value,
        "invested": invested,
    }


def calculate_portfolio_return(user_id: int):
    """Aggregate returns across all investments"""
    investments = Investment.query.filter_by(user_id=user_id).all()

    total_invested = 0
    total_value = 0
    results = []

    for inv in investments:
        metrics = calculate_investment_roi(inv)
        if metrics:
            total_invested += metrics["invested"]
            total_value += metrics["current_value"]
            results.append(metrics)

    portfolio_roi = ((total_value - total_invested) / total_invested * 100) if total_invested > 0 else 0
    return {
        "total_invested": total_invested,
        "total_value": total_value,
        "portfolio_roi_percent": round(portfolio_roi, 2),
        "investments": results
    }

def get_snapshot_return(user_id: int, days: int = 30):
    """
    Calculate portfolio return using snapshots over a time window.
    Uses cost_basis and value from InvestmentSnapshot.
    """
    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=days)

    # Latest snapshot per investment (end of period)
    latest_snapshots = (
        db.session.query(InvestmentSnapshot)
        .join(Investment, Investment.id == InvestmentSnapshot.investment_id)
        .filter(
            Investment.user_id == user_id,
            InvestmentSnapshot.snapshot_date <= end_date,
        )
        .order_by(InvestmentSnapshot.investment_id, InvestmentSnapshot.snapshot_date.desc())
        .distinct(InvestmentSnapshot.investment_id)
        .all()
    )

    # Earliest snapshot per investment (start of period)
    earliest_snapshots = (
        db.session.query(InvestmentSnapshot)
        .join(Investment, Investment.id == InvestmentSnapshot.investment_id)
        .filter(
            Investment.user_id == user_id,
            InvestmentSnapshot.snapshot_date >= start_date,
        )
        .order_by(InvestmentSnapshot.investment_id, InvestmentSnapshot.snapshot_date.asc())
        .distinct(InvestmentSnapshot.investment_id)
        .all()
    )

    # Compute portfolio performance
    results = []
    total_cost_basis = 0
    total_value_now = 0

    for early, late in zip(earliest_snapshots, latest_snapshots):
        invested_amount = float(late.cost_basis or 0)
        value_now = float(late.value or 0)

        roi = 0
        if invested_amount > 0:
            roi = (value_now - invested_amount) / invested_amount * 100

        results.append({
            "investment_id": late.investment_id,
            "start_date": str(early.snapshot_date),
            "end_date": str(late.snapshot_date),
            "cost_basis": invested_amount,
            "current_value": value_now,
            "roi_percent": roi
        })

        total_cost_basis += invested_amount
        total_value_now += value_now

    portfolio_roi = 0
    if total_cost_basis > 0:
        portfolio_roi = (total_value_now - total_cost_basis) / total_cost_basis * 100

    return {
        "investments": results,
        "portfolio": {
            "cost_basis": total_cost_basis,
            "current_value": total_value_now,
            "roi_percent": portfolio_roi
        }
    }


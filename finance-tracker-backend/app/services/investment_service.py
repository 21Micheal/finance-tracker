from datetime import datetime, timedelta
from app import db
from app.models import Investment, InvestmentHistory, Category, Transaction, InvestmentTransaction
from app.services.price_service import fetch_current_price
from sqlalchemy import func

def snapshot_investments():
    """
    Take a snapshot of all user investments and store in InvestmentHistory + InvestmentSnapshot.
    Runs daily via APScheduler.
    """
    investments = Investment.query.all()
    for inv in investments:
        current_price = fetch_current_price(inv.symbol)
        if not current_price:
            continue

        current_value = float(inv.quantity) * current_price
        cost_basis = (inv.average_price or 0) * float(inv.quantity)

        # Save to InvestmentHistory (price-only log)
        history = InvestmentHistory(
            investment_id=inv.id,
            price=current_price,
            value=current_value,
            recorded_at=datetime.utcnow()
        )
        db.session.add(history)

        # Save to InvestmentSnapshot (portfolio tracking)
        try:
            cost_basis = float(inv.quantity) * float(inv.avg_buy_price or 0)

            snapshot = InvestmentSnapshot(
                investment_id=inv.id,
                user_id=inv.user_id,
                value=current_value,
                units=inv.quantity,
                price=current_price,
                cost_basis=cost_basis,  # ✅ track invested amount
                snapshot_date=datetime.utcnow().date()
            )
            db.session.add(history)
            db.session.add(snapshot)

        except ImportError:
            pass  # Skip if model not present

    db.session.commit()
    print(f"📊 Investment snapshot taken at {datetime.utcnow()}")


from app.models import InvestmentTransaction, Transaction, Category, db
from app.models import InvestmentSnapshot

def backfill_investment_transactions(user_id):
    # Auto-create categories for investment events if missing
    # Fetch only transactions not yet synced
    unsynced = InvestmentTransaction.query.filter_by(user_id=user_id, synced_at=None).all()

    if not unsynced:
        return

    # Ensure "Investments" category exists
    category = Category.query.filter_by(user_id=user_id, name="Investments").first()
    if not category:
        category = Category(
            user_id=user_id,
            name="Investments",
            type="expense",   # investments reduce cash, dividends will be positive
            color="#00FFAA"
        )
        db.session.add(category)
        db.session.commit()

    for itx in unsynced:
        txn = Transaction(
            user_id=user_id,
            category_id=category.id,
            amount=itx.amount if itx.type != "buy" else -abs(itx.amount),
            description=f"Investment {itx.type.capitalize()} - {itx.investment.name}",
            date=itx.date,
        )
        db.session.add(txn)

        # Mark as synced
        itx.synced_at = datetime.utcnow()

    db.session.commit()

    # Define categories mapping for investment transaction types
    categories = {
        "buy": "Investments",
        "sell": "Investment Income",
        "dividend": "Dividends",
        "interest": "Interest",
    }

    category_map = {}
    for t_type, cat_name in categories.items():
        category = Category.query.filter_by(user_id=user_id, name=cat_name).first()
        if not category:
            category = Category(
                user_id=user_id,
                name=cat_name,
                type="expense" if t_type in ["buy"] else "income",
                color="#6A5ACD",  # arbitrary default
            )
            db.session.add(category)
            db.session.commit()
        category_map[t_type] = category.id

    # Sync transactions
    investment_txs = InvestmentTransaction.query.filter_by(user_id=user_id).all()
    synced = 0

    for itx in investment_txs:
        # Check if already synced
        existing = Transaction.query.filter_by(
            user_id=user_id,
            date=itx.date,
            amount=itx.amount,
            category_id=category_map[itx.type]
        ).first()

        if not existing:
            tx = Transaction(
                user_id=user_id,
                category_id=category_map[itx.type],
                amount=itx.amount if itx.type != "buy" else -abs(itx.amount),
                description=f"{itx.type.capitalize()} - {itx.investment.name}",
                date=itx.date,
            )
            db.session.add(tx)
            synced += 1

    db.session.commit()
    return {"message": f"Backfilled {synced} new investment transactions"}


def calculate_investment_roi(investment_id: int, days: int = 30):
    """Calculate ROI for a single investment based on latest snapshot."""
    inv = Investment.query.get(investment_id)
    if not inv or inv.cost_basis is None:
        return None  # Skip if cost basis not set

    end_date = datetime.utcnow().date()
    start_date = end_date - timedelta(days=days)

    # earliest snapshot
    earliest = (
        InvestmentSnapshot.query
        .filter_by(investment_id=investment_id)
        .filter(InvestmentSnapshot.snapshot_date >= start_date)
        .order_by(InvestmentSnapshot.snapshot_date.asc())
        .first()
    )
    # latest snapshot
    latest = (
        InvestmentSnapshot.query
        .filter_by(investment_id=investment_id)
        .filter(InvestmentSnapshot.snapshot_date <= end_date)
        .order_by(InvestmentSnapshot.snapshot_date.desc())
        .first()
    )

    if not earliest or not latest or not earliest.value or not earliest.cost_basis:
        return None

    roi = (latest.value - earliest.cost_basis) / earliest.cost_basis * 100
    return {
        "investment_id": investment_id,
        "roi": round(roi, 2),
        "start_value": float(earliest.cost_basis),
        "end_value": float(latest.value),
        "period": f"{days}d"
    }


def calculate_portfolio_return(user_id: int, days: int = 30):
    """Aggregate ROI across all investments for a user."""
    investments = Investment.query.filter_by(user_id=user_id).all()
    total_start = 0
    total_end = 0

    for inv in investments:
        result = calculate_investment_roi(inv.id, days)
        if result:
            total_start += result["start_value"]
            total_end += result["end_value"]

    if total_start == 0:
        return None

    portfolio_roi = (total_end - total_start) / total_start * 100
    return {
        "roi": round(portfolio_roi, 2),
        "start_value": round(total_start, 2),
        "end_value": round(total_end, 2),
        "period": f"{days}d"
    }


def calculate_portfolio_roi(user_id: int):
    """Calculate total ROI across a user's entire portfolio."""
    investments = Investment.query.filter_by(user_id=user_id).all()

    total_value = 0
    total_cost = 0

    for inv in investments:
        if inv.cost_basis is None:
            continue  # skip if user hasn’t set cost basis

        latest_snapshot = (
            InvestmentSnapshot.query
            .filter_by(investment_id=inv.id)
            .order_by(InvestmentSnapshot.snapshot_date.desc())
            .first()
        )
        if not latest_snapshot:
            continue

        total_value += float(latest_snapshot.value)
        total_cost += float(inv.cost_basis)

    if total_cost == 0:
        return None

    portfolio_roi = ((total_value - total_cost) / total_cost) * 100
    return {
        "user_id": user_id,
        "total_value": round(total_value, 2),
        "total_cost_basis": round(total_cost, 2),
        "roi_percent": round(portfolio_roi, 2)
    }


def get_portfolio_history(user_id: int, days: int = 30):
    """Return historical portfolio value for trend analysis."""
    end_date = datetime.utcnow().date()
    start_date = end_date - timedelta(days=days)

    snapshots = (
        db.session.query(
            InvestmentSnapshot.snapshot_date,
            func.sum(InvestmentSnapshot.value).label("portfolio_value")
        )
        .join(Investment, Investment.id == InvestmentSnapshot.investment_id)
        .filter(
            Investment.user_id == user_id,
            InvestmentSnapshot.snapshot_date.between(start_date, end_date)
        )
        .group_by(InvestmentSnapshot.snapshot_date)
        .order_by(InvestmentSnapshot.snapshot_date.asc())
        .all()
    )

    return [
        {"date": s.snapshot_date.isoformat(), "portfolio_value": float(s.portfolio_value)}
        for s in snapshots
    ]
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime
from ..extensions import db
from ..models import Investment, InvestmentSnapshot, InvestmentHistory, InvestmentTransaction, Transaction
from ..services.price_service import fetch_current_price
from ..utils.categories import get_investment_category  # Add this import if the function exists in category_service
from ..utils.investments import calculate_portfolio_return, get_snapshot_return
from app.services.investment_service import (
    calculate_investment_roi,
    calculate_portfolio_roi,
    get_portfolio_history
)


investments_bp = Blueprint("investments", __name__)

# Create investment
@investments_bp.route("/", methods=["POST"])
@jwt_required()
def create_investment():
    user_id = int(get_jwt_identity())
    data = request.get_json()

    symbol = data.get("symbol")
    quantity = data.get("quantity")
    cost_basis = data.get("cost_basis")

    # ✅ Enforce cost_basis
    if cost_basis is None:
        return jsonify({"error": "Cost basis must be provided"}), 400

    inv = Investment(
        user_id=user_id,
        symbol=symbol,
        quantity=quantity,
        cost_basis=cost_basis
    )

    db.session.add(inv)
    db.session.commit()

    return jsonify({
        "id": inv.id,
        "symbol": inv.symbol,
        "quantity": float(inv.quantity),
        "cost_basis": float(inv.cost_basis)
    }), 201
# Add investment
@investments_bp.route("/", methods=["POST"])
@jwt_required()
def add_investment():
    user_id = int(get_jwt_identity())
    data = request.get_json()

    symbol = data.get("symbol")
    quantity = float(data.get("quantity", 0))
    average_price = float(data.get("average_price", 0))

    if not symbol or quantity <= 0 or average_price <= 0:
        return jsonify({"error": "symbol, quantity, and average_price are required"}), 400

    cost_basis = average_price * quantity

    inv = Investment(
        user_id=user_id,
        name=data["name"],
        type=data["type"],
        units=data["units"],
        purchase_price=data["purchase_price"],
        current_price=data.get("current_price"),
        purchase_date=datetime.strptime(data["purchase_date"], "%Y-%m-%d").date(),
        symbol=symbol.upper(),
        quantity=quantity,
        average_price=average_price,
        cost_basis=cost_basis,
    )

    db.session.add(inv)
    db.session.commit()

    return jsonify({
        "id": inv.id,
        "symbol": inv.symbol,
        "quantity": inv.quantity,
        "average_price": inv.average_price,
        "cost_basis": inv.cost_basis,
    }), 201



@investments_bp.route('/transactions', methods=['POST'])
@jwt_required()
def add_investment_transaction():
    user_id = get_jwt_identity()
    data = request.get_json()

    txn = InvestmentTransaction(
        user_id=user_id,
        investment_id=data["investment_id"],
        type=data["type"],
        amount=data["amount"],
        date=datetime.strptime(data["date"], "%Y-%m-%d"),
        description=data.get("description", "")
    )
    db.session.add(txn)
    db.session.flush()

    # 🔹 Auto-map category
    cat = get_investment_category(user_id, data["type"])

    # 🔹 Mirror in main Transaction table for reports
    new_txn = Transaction(
        user_id=user_id,
        category_id=cat.id,
        amount=data["amount"],
        description=f"Investment: {data['type'].capitalize()}",
        date=txn.date
    )
    db.session.add(new_txn)

    db.session.commit()

    return jsonify({"msg": "Investment transaction added"}), 201



# Get all investments
@investments_bp.route("/", methods=["GET"])
@jwt_required()
def get_investments():
    user_id = int(get_jwt_identity())
    investments = Investment.query.filter_by(user_id=user_id).all()

    return jsonify([
        {
            "id": inv.id,
            "name": inv.name,
            "type": inv.type,
            "units": str(inv.units),
            "purchase_price": str(inv.purchase_price),
            "current_price": str(inv.current_price) if inv.current_price else None,
            "invested_amount": str(inv.invested_amount),
            "current_value": str(inv.current_value),
            "profit_loss": str(inv.profit_loss),
            "purchase_date": str(inv.purchase_date)
        } for inv in investments
    ]), 200


# Update current price
@investments_bp.route("/<int:investment_id>", methods=["PATCH"])
@jwt_required()
def update_investment(investment_id):
    user_id = int(get_jwt_identity())
    inv = Investment.query.filter_by(id=investment_id, user_id=user_id).first()

    if not inv:
        return jsonify({"error": "Investment not found"}), 404

    data = request.get_json()
    if "current_price" in data:
        inv.current_price = data["current_price"]

    if "quantity" in data:
        inv.quantity = float(data["quantity"])

    if "average_price" in data:
        inv.average_price = float(data["average_price"])

    # Recompute cost_basis if relevant
    if inv.average_price and inv.quantity:
        inv.cost_basis = inv.average_price * inv.quantity

    db.session.commit()
    return jsonify({
        "id": inv.id,
        "symbol": inv.symbol,
        "quantity": inv.quantity,
        "average_price": inv.average_price,
        "cost_basis": inv.cost_basis,
    }), 200


# Delete investment
@investments_bp.route("/<int:investment_id>", methods=["DELETE"])
@jwt_required()
def delete_investment(investment_id):
    user_id = int(get_jwt_identity())
    inv = Investment.query.filter_by(id=investment_id, user_id=user_id).first()

    if not inv:
        return jsonify({"error": "Investment not found"}), 404

    db.session.delete(inv)
    db.session.commit()
    return jsonify({"message": "Investment deleted"}), 200


# Get investment history
@investments_bp.route("/<int:investment_id>/history", methods=["GET"])
@jwt_required()
def investment_history(investment_id):
    user_id = int(get_jwt_identity())
    snapshots = InvestmentSnapshot.query.filter_by(user_id=user_id, investment_id=investment_id).order_by(InvestmentSnapshot.date.asc()).all()

    if not snapshots:
        return jsonify({"message": "No history available"}), 200

    return jsonify([
        {
            "date": str(s.date),
            "invested_amount": str(s.invested_amount),
            "current_value": str(s.current_value),
            "profit_loss": str(s.profit_loss)
        } for s in snapshots
    ]), 200


@investments_bp.route("/refresh-prices", methods=["POST"])
@jwt_required()
def refresh_prices():
    user_id = int(get_jwt_identity())
    investments = Investment.query.filter_by(user_id=user_id).all()

    updated = []
    for inv in investments:
        if not inv.symbol:
            continue
        price = fetch_current_price(inv.symbol)
        if price is not None:
            inv.current_value = price
            inv.profit_loss = inv.current_value - inv.invested_amount
            updated.append({"symbol": inv.symbol, "price": price})
    db.session.commit()

    return jsonify({"updated": updated}), 200

@investments_bp.route("/portfolio", methods=["GET"])
@jwt_required()
def portfolio_summary():
    user_id = get_jwt_identity()
    investments = Investment.query.filter_by(user_id=user_id).all()

    summary = []
    total_value = 0
    for inv in investments:
        current_price = fetch_current_price(inv.symbol)
        if not current_price:
            continue

        current_value = float(inv.quantity) * current_price
        invested = float(inv.quantity) * float(inv.avg_buy_price)
        pnl = current_value - invested
        pnl_pct = (pnl / invested * 100) if invested > 0 else 0

        # log history
        history = InvestmentHistory(
            investment_id=inv.id,
            price=current_price,
            value=current_value
        )
        db.session.add(history)

        summary.append({
            "symbol": inv.symbol,
            "quantity": float(inv.quantity),
            "avg_buy_price": float(inv.avg_buy_price),
            "current_price": current_price,
            "current_value": current_value,
            "pnl": round(pnl, 2),
            "pnl_pct": round(pnl_pct, 2),
        })

        total_value += current_value

    db.session.commit()

    return jsonify({
        "total_value": total_value,
        "holdings": summary
    }), 200



@investments_bp.route("/history/<symbol>", methods=["GET"])
@jwt_required()
def get_investment_history(symbol):
    user_id = get_jwt_identity()
    inv = Investment.query.filter_by(user_id=user_id, symbol=symbol).first_or_404()

    history = InvestmentHistory.query.filter_by(investment_id=inv.id).order_by(InvestmentHistory.recorded_at.asc()).all()

    return jsonify([
        {
            "price": float(h.price),
            "value": float(h.value),
            "recorded_at": h.recorded_at.strftime("%Y-%m-%d %H:%M:%S")
        }
        for h in history
    ])



@investments_bp.route("/chart/portfolio", methods=["GET"])
@jwt_required()
def portfolio_chart():
    """
    Returns aggregated portfolio value over time (line chart data).
    """
    user_id = get_jwt_identity()

    # group by recorded_at (day), sum values
    data = (
        db.session.query(
            db.func.date(InvestmentHistory.recorded_at).label("date"),
            db.func.sum(InvestmentHistory.value).label("total_value")
        )
        .join(Investment, Investment.id == InvestmentHistory.investment_id)
        .filter(Investment.user_id == user_id)
        .group_by(db.func.date(InvestmentHistory.recorded_at))
        .order_by(db.func.date(InvestmentHistory.recorded_at))
        .all()
    )

    return jsonify([
        {"date": str(row.date), "total_value": float(row.total_value)} for row in data
    ])


@investments_bp.route("/chart/<symbol>", methods=["GET"])
@jwt_required()
def investment_chart(symbol):
    """
    Returns historical values for a single investment (line chart).
    """
    user_id = get_jwt_identity()
    inv = Investment.query.filter_by(user_id=user_id, symbol=symbol).first_or_404()

    history = InvestmentHistory.query.filter_by(investment_id=inv.id).order_by(InvestmentHistory.recorded_at.asc()).all()

    return jsonify([
        {
            "date": h.recorded_at.strftime("%Y-%m-%d"),
            "value": float(h.value),
            "price": float(h.price)
        }
        for h in history
    ])


@investments_bp.route("/chart/allocation", methods=["GET"])
@jwt_required()
def portfolio_allocation():
    """
    Returns allocation of portfolio by symbol (pie chart).
    """
    user_id = get_jwt_identity()

    investments = Investment.query.filter_by(user_id=user_id).all()
    allocation = []
    total_value = 0

    # calculate total portfolio value
    for inv in investments:
        current_price = fetch_current_price(inv.symbol)
        if not current_price:
            continue
        current_value = float(inv.quantity) * current_price
        total_value += current_value
        allocation.append((inv.symbol, current_value))

    # compute percentages
    result = [
        {
            "symbol": symbol,
            "value": round(value, 2),
            "percentage": round((value / total_value) * 100, 2) if total_value > 0 else 0
        }
        for symbol, value in allocation
    ]

    return jsonify(result), 200

@investments_bp.route("/chart/allocation/type", methods=["GET"])
@jwt_required()
def portfolio_allocation_by_type():
    user_id = get_jwt_identity()

    investments = Investment.query.filter_by(user_id=user_id).all()
    totals = {}
    total_value = 0

    for inv in investments:
        current_price = fetch_current_price(inv.symbol)
        if not current_price:
            continue
        value = float(inv.quantity) * current_price
        totals[inv.type] = totals.get(inv.type, 0) + value
        total_value += value

    result = [
        {
            "type": t,
            "value": round(v, 2),
            "percentage": round((v / total_value) * 100, 2) if total_value > 0 else 0
        }
        for t, v in totals.items()
    ]

    return jsonify(result), 200

@investments_bp.route("/snapshots", methods=["POST"])
@jwt_required()
def create_snapshot():
    user_id = int(get_jwt_identity())
    from app.services.investment_service import take_investment_snapshot
    snapshots = take_investment_snapshot(user_id)

    return jsonify([{
        "id": s.id,
        "investment_id": s.investment_id,
        "value": float(s.value),
        "units": float(s.units),
        "price": float(s.price),
        "date": s.snapshot_date.isoformat()
    } for s in snapshots]), 201


@investments_bp.route("/snapshots/history", methods=["GET"])
@jwt_required()
def get_snapshot_history():
    user_id = int(get_jwt_identity())
    snapshots = InvestmentSnapshot.query.filter_by(user_id=user_id).order_by(
        InvestmentSnapshot.snapshot_date.asc()
    ).all()

    return jsonify([{
        "id": s.id,
        "investment_id": s.investment_id,
        "value": float(s.value),
        "units": float(s.units),
        "price": float(s.price),
        "date": s.snapshot_date.isoformat()
    } for s in snapshots])


@investments_bp.route("/snapshots/run", methods=["POST"])
@jwt_required()
def run_snapshot():
    """Manually trigger snapshots (for testing/dev)."""
    from app.services.investment_service import snapshot_job
    snapshot_job()
    return jsonify({"message": "Snapshots created"}), 201


@investments_bp.route("/performance", methods=["GET"])
@jwt_required()
def portfolio_performance():
    user_id = int(get_jwt_identity())
    days = int(request.args.get("days", 30))
    result = calculate_portfolio_return(user_id, days)
    if not result:
        return jsonify({"message": "Not enough data"}), 200
    return jsonify(result)


@investments_bp.route("/performance/history", methods=["GET"])
@jwt_required()
def get_portfolio_performance_history():
    """Get portfolio return over a time window based on snapshots"""
    user_id = int(get_jwt_identity())
    days = request.args.get("days", default=30, type=int)

    try:
        performance = get_snapshot_return(user_id, days)
        return jsonify({
            "days": days,
            "performance": performance
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ✅ Portfolio ROI
@investments_bp.route("/performance/portfolio", methods=["GET"])
@jwt_required()
def portfolio_performance_roi():
    user_id = int(get_jwt_identity())
    roi = calculate_portfolio_roi(user_id)
    if not roi:
        return jsonify({"message": "No cost basis set or no snapshots available"}), 400
    return jsonify(roi), 200


# ✅ Single Investment ROI
@investments_bp.route("/performance/<int:investment_id>", methods=["GET"])
@jwt_required()
def investment_performance(investment_id):
    roi = calculate_investment_roi(investment_id)
    if not roi:
        return jsonify({"message": "No cost basis set or no snapshots available"}), 400
    return jsonify(roi), 200


# ✅ Portfolio History (trend)
@investments_bp.route("/performance/history", methods=["GET"])
@jwt_required()
def portfolio_history():
    user_id = int(get_jwt_identity())
    days = int(request.args.get("days", 30))
    history = get_portfolio_history(user_id, days)
    return jsonify(history), 200
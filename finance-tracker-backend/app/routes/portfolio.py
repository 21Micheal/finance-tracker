from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import func
from ..models import Investment
from ..models import PortfolioSnapshot
from ..extensions import db

portfolio_bp = Blueprint("portfolio", __name__)

@portfolio_bp.route("/summary", methods=["GET"])
@jwt_required()
def portfolio_summary():
    user_id = int(get_jwt_identity())

    investments = Investment.query.filter_by(user_id=user_id).all()

    if not investments:
        return jsonify({"message": "No investments found", "total_invested": 0, "current_value": 0, "profit_loss": 0, "by_type": {}}), 200

    total_invested = sum([inv.invested_amount for inv in investments])
    current_value = sum([inv.current_value for inv in investments])
    profit_loss = current_value - total_invested

    # Group by type
    by_type = {}
    for inv in investments:
        if inv.type not in by_type:
            by_type[inv.type] = {"invested": 0, "current": 0, "profit_loss": 0}
        by_type[inv.type]["invested"] += inv.invested_amount
        by_type[inv.type]["current"] += inv.current_value
        by_type[inv.type]["profit_loss"] += inv.profit_loss

    # Convert Decimal → str for JSON safety
    summary = {
        "total_invested": str(total_invested),
        "current_value": str(current_value),
        "profit_loss": str(profit_loss),
        "profit_loss_percentage": f"{(profit_loss / total_invested * 100):.2f}%" if total_invested > 0 else "0%",
        "by_type": {
            t: {
                "invested": str(v["invested"]),
                "current": str(v["current"]),
                "profit_loss": str(v["profit_loss"]),
                "profit_loss_percentage": f"{(v['profit_loss'] / v['invested'] * 100):.2f}%" if v["invested"] > 0 else "0%"
            }
            for t, v in by_type.items()
        }
    }

    return jsonify(summary), 200


@portfolio_bp.route("/history", methods=["GET"])
@jwt_required()
def portfolio_history():
    user_id = int(get_jwt_identity())
    snapshots = PortfolioSnapshot.query.filter_by(user_id=user_id).order_by(PortfolioSnapshot.date.asc()).all()

    return jsonify([
        {
            "date": str(s.date),
            "total_invested": str(s.total_invested),
            "current_value": str(s.current_value),
            "profit_loss": str(s.profit_loss)
        } for s in snapshots
    ]), 200
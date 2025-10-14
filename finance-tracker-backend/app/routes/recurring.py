from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..extensions import db
from ..models import RecurringTransaction, Transaction, Category
from datetime import datetime, timedelta

recurring_bp = Blueprint("recurring", __name__)

def calculate_next_date(current, frequency):
    if frequency == "daily":
        return current + timedelta(days=1)
    elif frequency == "weekly":
        return current + timedelta(weeks=1)
    elif frequency == "monthly":
        return datetime(current.year + (current.month // 12), ((current.month % 12) + 1), current.day).date()
    elif frequency == "yearly":
        return datetime(current.year + 1, current.month, current.day).date()
    else:
        return None


# Create recurring transaction
@recurring_bp.route("/", methods=["POST"])
@jwt_required()
def create_recurring():
    user_id = int(get_jwt_identity())
    data = request.get_json()

    category = Category.query.filter_by(id=data["category_id"], user_id=user_id).first()
    if not category:
        return jsonify({"error": "Invalid category"}), 400

    start_date = datetime.strptime(data["start_date"], "%Y-%m-%d").date()
    frequency = data.get("frequency")
    if frequency not in ["daily", "weekly", "monthly", "yearly"]:
        return jsonify({"error": "Invalid frequency"}), 400

    recurring = RecurringTransaction(
        user_id=user_id,
        category_id=category.id,
        amount=data["amount"],
        description=data.get("description", ""),
        start_date=start_date,
        frequency=frequency,
        next_date=start_date,
        end_date=datetime.strptime(data["end_date"], "%Y-%m-%d").date() if data.get("end_date") else None
    )

    db.session.add(recurring)
    db.session.commit()

    return jsonify({"message": "Recurring transaction created", "id": recurring.id}), 201


# Get recurring transactions
@recurring_bp.route("/", methods=["GET"])
@jwt_required()
def get_recurring():
    user_id = int(get_jwt_identity())
    rec = RecurringTransaction.query.filter_by(user_id=user_id).all()
    return jsonify([
        {
            "id": r.id,
            "category_id": r.category_id,
            "amount": str(r.amount),
            "description": r.description,
            "frequency": r.frequency,
            "start_date": str(r.start_date),
            "next_date": str(r.next_date),
            "end_date": str(r.end_date) if r.end_date else None
        } for r in rec
    ]), 200

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..extensions import db
from ..models import Budget, Category, BankTransaction, db
from sqlalchemy import func
from datetime import datetime, date

budget_bp = Blueprint("budgets", __name__)



# Get all budgets for user
@budget_bp.route("/<int:budget_id>", methods=["GET"])
@jwt_required()
def get_budget(budget_id):
    user_id = get_jwt_identity()
    budget = Budget.query.filter_by(id=budget_id, user_id=user_id).first_or_404()

    return jsonify({
        "id": budget.id,
        "category": budget.category.name,
        "amount": float(budget.amount),
        "period": budget.period,
        "start_date": budget.start_date.isoformat(),
        "end_date": budget.end_date.isoformat() if budget.end_date else None
    })


# Create budget
@budget_bp.route("/", methods=["POST"])
@jwt_required()
def create_budget():
    user_id = get_jwt_identity()
    data = request.get_json()

    category_id = data.get("category_id")
    amount = data.get("amount")
    period = data.get("period", "monthly")  # default monthly
    start_date = data.get("start_date")

    if start_date:
        try:
            start_date = datetime.strptime(start_date, "%Y-%m-%d").date()
        except ValueError:
            return jsonify({"error": "Invalid date format, use YYYY-MM-DD"}), 400
    else:
        start_date = datetime.utcnow().date()  # ✅ default today

    budget = Budget(
        user_id=user_id,
        category_id=category_id,
        amount=amount,
        period=period,
        start_date=start_date
    )
    db.session.add(budget)
    db.session.commit()

    return jsonify({
        "id": budget.id,
        "category_id": budget.category_id,
        "amount": str(budget.amount),
        "period": budget.period,
        "start_date": str(budget.start_date)
    }), 201


# Update budget
@budget_bp.route("/<int:budget_id>", methods=["PUT"])
@jwt_required()
def update_budget(budget_id):
    user_id = int(get_jwt_identity())
    budget = Budget.query.filter_by(id=budget_id, user_id=user_id).first()

    if not budget:
        return jsonify({"error": "Budget not found"}), 404

    data = request.get_json()

    if "amount" in data:
        try:
            budget.amount = float(data["amount"])
        except ValueError:
            return jsonify({"error": "Invalid amount"}), 400

    if "period" in data:
        if data["period"] not in ["monthly", "yearly"]:
            return jsonify({"error": "Period must be 'monthly' or 'yearly'"}), 400
        budget.period = data["period"]

    if "category_id" in data:
        category = Category.query.filter_by(id=data["category_id"], user_id=user_id).first()
        if not category:
            return jsonify({"error": "Invalid category"}), 400
        budget.category_id = data["category_id"]

    db.session.commit()
    return jsonify({"message": "Budget updated"}), 200



def filter_transactions_by_budget(query, budget: Budget):
    """Filter transactions based on the budget's period definition."""
    if budget.period_type == "monthly":
        year, month = budget.period_value.split("-")
        query = query.filter(
            func.extract("year", BankTransaction.date) == int(year),
            func.extract("month", BankTransaction.date) == int(month)
        )
    elif budget.period_type == "weekly":
        year, week = budget.period_value.split("-W")
        query = query.filter(
            func.extract("isoyear", BankTransaction.date) == int(year),
            func.extract("week", BankTransaction.date) == int(week)
        )
    elif budget.period_type == "quarterly":
        year, quarter = budget.period_value.split("-Q")
        query = query.filter(
            func.extract("year", BankTransaction.date) == int(year),
            func.extract("quarter", BankTransaction.date) == int(quarter)
        )
    elif budget.period_type == "custom" and budget.start_date and budget.end_date:
        query = query.filter(
            BankTransaction.date >= budget.start_date,
            BankTransaction.date <= budget.end_date
        )
    return query


@budget_bp.route("/", methods=["GET"])
@jwt_required()
def list_budgets():
    user_id = get_jwt_identity()

    budgets = Budget.query.filter_by(user_id=user_id).all()
    results = []

    for b in budgets:
        query = BankTransaction.query.filter(
            BankTransaction.user_id == user_id,
            BankTransaction.category_id == b.category_id,
            BankTransaction.date >= b.start_date,
        )
        if b.end_date:
            query = query.filter(BankTransaction.date <= b.end_date)

        spent = db.session.query(func.coalesce(func.sum(BankTransaction.amount), 0)).filter(query.whereclause).scalar()

        remaining = float(b.amount) - float(spent)
        percent_used = (float(spent) / float(b.amount)) * 100 if b.amount > 0 else 0

        results.append({
            "id": b.id,
            "category_id": b.category_id,
            "amount": float(b.amount),
            "frequency": b.frequency,
            "start_date": b.start_date.isoformat() if b.start_date else None,
            "end_date": b.end_date.isoformat() if b.end_date else None,
            "spent": float(spent),
            "remaining": remaining,
            "percent_used": percent_used,
        })

    return jsonify(results)



@budget_bp.route("/budgets/<int:budget_id>", methods=["DELETE"])
@jwt_required()
def delete_budget(budget_id):
    user_id = get_jwt_identity()
    budget = Budget.query.filter_by(id=budget_id, user_id=user_id).first()

    if not budget:
        return jsonify({"error": "Budget not found"}), 404

    db.session.delete(budget)
    db.session.commit()
    return jsonify({"message": "Budget deleted"}), 200


@budget_bp.route("/summary", methods=["GET"])
@jwt_required()
def budget_summary():
    user_id = get_jwt_identity()

    today = date.today()

    # fetch all active budgets
    budgets = Budget.query.filter(
        Budget.user_id == user_id,
        Budget.start_date <= today,
        (Budget.end_date == None) | (Budget.end_date >= today)
    ).all()

    results = []
    total_allocated = 0
    total_spent = 0

    for budget in budgets:
        # fetch transactions in budget range
        tx_query = BankTransaction.query.filter(
            BankTransaction.user_id == user_id,
            BankTransaction.category_id == budget.category_id,
            BankTransaction.date >= budget.start_date,
            (budget.end_date == None) | (BankTransaction.date <= budget.end_date)
        )

        spent = tx_query.with_entities(func.sum(BankTransaction.amount)).scalar() or 0
        spent = float(spent)

        total_allocated += float(budget.amount)
        total_spent += spent

        results.append({
            "budget_id": budget.id,
            "category_id": budget.category_id,
            "category_name": budget.category.name if budget.category else None,
            "allocated": float(budget.amount),
            "spent": spent,
            "remaining": float(budget.amount) - spent,
            "utilization_pct": round((spent / float(budget.amount) * 100), 2) if budget.amount > 0 else 0
        })

    overall_utilization = round((total_spent / total_allocated * 100), 2) if total_allocated > 0 else 0

    return jsonify({
        "overall": {
            "total_allocated": round(total_allocated, 2),
            "total_spent": round(total_spent, 2),
            "total_remaining": round(total_allocated - total_spent, 2),
            "utilization_pct": overall_utilization
        },
        "categories": results
    })
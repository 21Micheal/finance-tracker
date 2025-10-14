from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..extensions import db
from ..models import Category
from datetime import datetime, timedelta
from app.models import Transaction, Goal, db, BankTransaction


transaction_bp = Blueprint("transactions", __name__)

# Get transactions with optional date filtering
@transaction_bp.route("/", methods=["GET"], )
@jwt_required()
def get_transactions():
    user_id = int(get_jwt_identity())

    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")

    query = Transaction.query.filter_by(user_id=user_id)

    if start_date:
        try:
            start_date = datetime.strptime(start_date, "%Y-%m-%d").date()
            query = query.filter(Transaction.date >= start_date)
        except ValueError:
            return jsonify({"error": "Invalid start_date format. Use YYYY-MM-DD"}), 400

    if end_date:
        try:
            end_date = datetime.strptime(end_date, "%Y-%m-%d").date()
            query = query.filter(Transaction.date <= end_date)
        except ValueError:
            return jsonify({"error": "Invalid end_date format. Use YYYY-MM-DD"}), 400

    transactions = query.order_by(Transaction.date.desc()).all()

    return jsonify([
        {
            "id": t.id,
            "category_id": t.category_id,
            "amount": str(t.amount),
            "description": t.description,
            "date": t.date.isoformat(),
            "created_at": t.created_at.isoformat()
        } for t in transactions
    ]), 200

    # Modified create_transaction to update related goals
@transaction_bp.route("/", methods=["POST"])
@jwt_required()
def create_transaction():
    user_id = int(get_jwt_identity())
    data = request.get_json()

    try:
        amount = float(data.get("amount"))
        date = datetime.strptime(data.get("date"), "%Y-%m-%d")
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid amount or date format"}), 400

    category_id = data.get("category_id")
    category = Category.query.filter_by(id=category_id, user_id=user_id).first()
    if not category:
        return jsonify({"error": "Invalid category"}), 400

    transaction = Transaction(
        user_id=user_id,
        category_id=category_id,
        amount=amount,
        description=data.get("description"),
        date=date
    )

    db.session.add(transaction)
    db.session.commit()

    # Update related goals
    goal = Goal.query.filter_by(user_id=user_id, category_id=category_id).first()
    if goal:
        total_saved = db.session.query(
            db.func.sum(Transaction.amount)
        ).filter_by(user_id=user_id, category_id=category_id).scalar() or 0

        goal.current_amount = total_saved
        db.session.commit()

    return jsonify({"msg": "Transaction added", "transaction": transaction.id}), 201
# Create new transaction
# @transaction_bp.route("/", methods=["POST"])
# @jwt_required()
# def create_transaction():
#     user_id = int(get_jwt_identity())
#     data = request.get_json()

#     try:
#         amount = float(data.get("amount"))
#         date = datetime.strptime(data.get("date"), "%Y-%m-%d").date()
#     except (ValueError, TypeError):
#         return jsonify({"error": "Invalid amount or date format"}), 400

#     category_id = data.get("category_id")
#     category = Category.query.filter_by(id=category_id, user_id=user_id).first()
#     if not category:
#         return jsonify({"error": "Invalid category"}), 400

#     transaction = Transaction(
#         user_id=user_id,
#         category_id=category_id,
#         amount=amount,
#         description=data.get("description"),
#         date=date
#     )

#     db.session.add(transaction)
#     db.session.commit()

#     return jsonify({"message": "Transaction created", "id": transaction.id}), 201


# Update transaction
@transaction_bp.route("/<int:transaction_id>", methods=["PUT"])
@jwt_required()
def update_transaction(transaction_id):
    user_id = int(get_jwt_identity())
    transaction = Transaction.query.filter_by(id=transaction_id, user_id=user_id).first()

    if not transaction:
        return jsonify({"error": "Transaction not found"}), 404

    data = request.get_json()

    if "amount" in data:
        try:
            transaction.amount = float(data["amount"])
        except ValueError:
            return jsonify({"error": "Invalid amount"}), 400

    if "date" in data:
        try:
            transaction.date = datetime.strptime(data["date"], "%Y-%m-%d").date()
        except ValueError:
            return jsonify({"error": "Invalid date format"}), 400

    if "category_id" in data:
        category = Category.query.filter_by(id=data["category_id"], user_id=user_id).first()
        if not category:
            return jsonify({"error": "Invalid category"}), 400
        transaction.category_id = data["category_id"]

    if "description" in data:
        transaction.description = data["description"]

    db.session.commit()
    return jsonify({"message": "Transaction updated"}), 200


# Delete transaction
@transaction_bp.route("/<int:transaction_id>", methods=["DELETE"])
@jwt_required()
def delete_transaction(transaction_id):
    user_id = int(get_jwt_identity())
    transaction = Transaction.query.filter_by(id=transaction_id, user_id=user_id).first()

    if not transaction:
        return jsonify({"error": "Transaction not found"}), 404

    db.session.delete(transaction)
    db.session.commit()
    return jsonify({"message": "Transaction deleted"}), 200

from sqlalchemy import func
@transaction_bp.route("/timeseries", methods=["GET"])
@jwt_required()
def transactions_timeseries():
    user_id = get_jwt_identity()

    group_by = request.args.get("group_by", "month")  # day | week | month
    txn_type = request.args.get("type", "all")        # income | expense | all
    metric = request.args.get("metric", "amount")     # amount | cashflow
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")

    # ✅ Default to last 6 months if not provided
    if not start_date or not end_date:
        today = datetime.utcnow().date()
        six_months_ago = today - timedelta(days=180)
        if not start_date:
            start_date = six_months_ago
        if not end_date:
            end_date = today

    # Ensure string params become dates
    if isinstance(start_date, str):
        start_date = datetime.strptime(start_date, "%Y-%m-%d").date()
    if isinstance(end_date, str):
        end_date = datetime.strptime(end_date, "%Y-%m-%d").date()

    # Determine grouping
    if group_by == "day":
        trunc_func = func.date_trunc("day", Transaction.date)
    elif group_by == "week":
        trunc_func = func.date_trunc("week", Transaction.date)
    else:
        trunc_func = func.date_trunc("month", Transaction.date)

    if metric == "cashflow":
        # Cashflow trends: income, expenses, net
        income_query = (
            db.session.query(
                trunc_func.label("period"),
                func.coalesce(func.sum(Transaction.amount), 0).label("income")
            )
            .join(Category)
            .filter(Transaction.user_id == user_id, Category.type == "income")
            .filter(Transaction.date >= start_date, Transaction.date <= end_date)
            .group_by("period")
        )

        expense_query = (
            db.session.query(
                trunc_func.label("period"),
                func.coalesce(func.sum(Transaction.amount), 0).label("expense")
            )
            .join(Category)
            .filter(Transaction.user_id == user_id, Category.type == "expense")
            .filter(Transaction.date >= start_date, Transaction.date <= end_date)
            .group_by("period")
        )

        income_data = {row.period.strftime("%Y-%m-%d"): float(row.income) for row in income_query.all()}
        expense_data = {row.period.strftime("%Y-%m-%d"): float(row.expense) for row in expense_query.all()}

        # Merge into cashflow view
        all_periods = sorted(set(income_data.keys()) | set(expense_data.keys()))
        results = []
        total_income, total_expense = 0.0, 0.0

        for p in all_periods:
            inc = income_data.get(p, 0.0)
            exp = expense_data.get(p, 0.0)
            total_income += inc
            total_expense += exp
            results.append({
                "period": p,
                "income": inc,
                "expense": exp,
                "net": round(inc - exp, 2)
            })

        totals = {
            "total_income": round(total_income, 2),
            "total_expense": round(total_expense, 2),
            "total_net": round(total_income - total_expense, 2)
        }

        return jsonify({
            "cashflow": results,
            "totals": totals
        })

    else:
        # Category timeseries trend
        query = (
            db.session.query(
                trunc_func.label("period"),
                func.coalesce(func.sum(Transaction.amount), 0).label("total")
            )
            .join(Category)
            .filter(Transaction.user_id == user_id)
            .filter(Transaction.date >= start_date, Transaction.date <= end_date)
        )

        if txn_type in ["income", "expense"]:
            query = query.filter(Category.type == txn_type)

        query = query.group_by("period").order_by("period")

        results = []
        grand_total = 0.0

        for row in query.all():
            val = float(row.total)
            grand_total += val
            results.append({
                "period": row.period.strftime("%Y-%m-%d"),
                "total": val
            })

        totals = {
            "grand_total": round(grand_total, 2)
        }

        return jsonify({
            "timeseries": results,
            "totals": totals
        })



@transaction_bp.route("/summary/merchant", methods=["GET"])
@jwt_required()
def transactions_summary_merchant():
    user_id = get_jwt_identity()

    # Query params
    tx_type = request.args.get("type", "all")  # expense | income | all
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")
    limit = int(request.args.get("limit", 10))

    base_query = db.session.query(
        BankTransaction.name.label("merchant"),
        func.count(BankTransaction.id).label("count"),
        func.sum(BankTransaction.amount).label("total"),
        func.avg(BankTransaction.amount).label("average")
    ).filter(BankTransaction.user_id == user_id)

    if start_date:
        base_query = base_query.filter(BankTransaction.date >= start_date)
    if end_date:
        base_query = base_query.filter(BankTransaction.date <= end_date)

    if tx_type == "income":
        base_query = base_query.filter(BankTransaction.amount > 0)
    elif tx_type == "expense":
        base_query = base_query.filter(BankTransaction.amount < 0)

    # Full grouped data
    grouped = (
        base_query.group_by(BankTransaction.name)
        .order_by(func.sum(BankTransaction.amount).desc())
        .all()
    )

    # Split into top merchants + others
    top_merchants = grouped[:limit]
    others = grouped[limit:]

    # Build response
    results = [
        {
            "merchant": r.merchant,
            "count": r.count,
            "total": float(r.total or 0),
            "average": float(r.average or 0),
        }
        for r in top_merchants
    ]

    if others:
        results.append({
            "merchant": "Others",
            "count": sum(r.count for r in others),
            "total": float(sum(r.total or 0 for r in others)),
            "average": float(
                (sum(r.total or 0 for r in others) / sum(r.count for r in others))
                if sum(r.count for r in others) else 0
            )
        })

    return jsonify(results)

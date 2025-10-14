# app/routes/exports.py

import csv
import io
from flask import Blueprint, Response, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import Transaction, Category
from datetime import datetime

exports_bp = Blueprint("exports", __name__, url_prefix="/exports")

@exports_bp.route("/transactions.csv", methods=["GET"])
@jwt_required()
def export_transactions_csv():
    user_id = int(get_jwt_identity())

    # Fetch all transactions for the user
    # Parse query params
    start_date = request.args.get("start")
    end_date = request.args.get("end")

    query = Transaction.query.join(Category).filter(Transaction.user_id == user_id)

    if start_date:
        try:
            start = datetime.strptime(start_date, "%Y-%m-%d").date()
            query = query.filter(Transaction.date >= start)
        except ValueError:
            return {"error": "Invalid start date format (use YYYY-MM-DD)"}, 400

    if end_date:
        try:
            end = datetime.strptime(end_date, "%Y-%m-%d").date()
            query = query.filter(Transaction.date <= end)
        except ValueError:
            return {"error": "Invalid end date format (use YYYY-MM-DD)"}, 400

    txns = query.order_by(Transaction.date.desc()).all()

    # Create in-memory CSV
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Date", "Category", "Description", "Amount", "Source"])

    for txn in txns:
        # Infer source based on description prefix
        if txn.description.startswith("Bank Tx"):
            source = "bank"
        elif txn.description.startswith("Investment"):
            source = "investment"
        else:
            source = "manual"

        writer.writerow([
            txn.date,
            txn.category.name if txn.category else "Uncategorized",
            txn.description,
            float(txn.amount),
            source
        ])

    output.seek(0)

    return Response(
        output,
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment;filename=transactions.csv"}
    )

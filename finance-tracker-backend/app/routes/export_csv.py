import csv
import io
from flask import Blueprint, request, jsonify, Response
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..models import Transaction, Category
from ..extensions import db
from datetime import datetime

export_csv_bp = Blueprint("export_csv", __name__)

@export_csv_bp.route("/transactions", methods=["GET"])
@jwt_required()
def export_transactions():
    user_id = int(get_jwt_identity())

    # Optional filters
    start_date_str = request.args.get("start_date")
    end_date_str = request.args.get("end_date")

    query = Transaction.query.filter_by(user_id=user_id)

    if start_date_str:
        try:
            start_date = datetime.strptime(start_date_str, "%Y-%m-%d").date()
            query = query.filter(Transaction.date >= start_date)
        except ValueError:
            return jsonify({"error": "Invalid start_date format. Use YYYY-MM-DD"}), 400

    if end_date_str:
        try:
            end_date = datetime.strptime(end_date_str, "%Y-%m-%d").date()
            query = query.filter(Transaction.date <= end_date)
        except ValueError:
            return jsonify({"error": "Invalid end_date format. Use YYYY-MM-DD"}), 400

    transactions = query.order_by(Transaction.date.asc()).all()

    # Create CSV in memory
    output = io.StringIO()
    writer = csv.writer(output)

    # Header
    writer.writerow(["date", "amount", "description", "category", "type"])

    # Rows
    for tx in transactions:
        category = Category.query.get(tx.category_id)
        writer.writerow([
            tx.date.strftime("%Y-%m-%d"),
            str(tx.amount),
            tx.description,
            category.name if category else "Unknown",
            category.type if category else "Unknown"
        ])

    output.seek(0)

    # Return as file download
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=transactions_export.csv"
        }
    )

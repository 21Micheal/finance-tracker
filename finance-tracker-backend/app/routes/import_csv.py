import csv
import io
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..extensions import db
from ..models import Transaction, Category
from datetime import datetime

import_csv_bp = Blueprint("import_csv", __name__)

# Expected CSV columns:
# date, amount, description, category, type (income/expense)
# Example: 2025-09-01, 45.50, "Groceries at Walmart", Food, expense

@import_csv_bp.route("/transactions", methods=["POST"])
@jwt_required()
def import_transactions():
    user_id = int(get_jwt_identity())

    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    if not file.filename.endswith(".csv"):
        return jsonify({"error": "Only CSV files are allowed"}), 400

    try:
        stream = io.StringIO(file.stream.read().decode("utf-8"))
        reader = csv.DictReader(stream)

        imported = []
        errors = []

        for i, row in enumerate(reader, start=1):
            try:
                # Parse date
                date = datetime.strptime(row["date"], "%Y-%m-%d").date()

                # Parse amount
                amount = float(row["amount"])

                # Ensure category exists (create if missing)
                category_name = row.get("category", "").strip()
                category_type = row.get("type", "").strip().lower()

                if category_type not in ["income", "expense"]:
                    raise ValueError("Invalid type, must be income or expense")

                category = Category.query.filter_by(
                    user_id=user_id, name=category_name, type=category_type
                ).first()

                if not category:
                    category = Category(
                        user_id=user_id,
                        name=category_name,
                        type=category_type,
                        color="#000000"  # default color
                    )
                    db.session.add(category)
                    db.session.flush()  # get ID without commit

                # Create transaction
                transaction = Transaction(
                    user_id=user_id,
                    category_id=category.id,
                    amount=amount,
                    description=row.get("description", ""),
                    date=date
                )
                db.session.add(transaction)
                imported.append(row)

            except Exception as e:
                errors.append({"row": i, "error": str(e), "data": row})

        db.session.commit()

        return jsonify({
            "imported_count": len(imported),
            "errors": errors
        }), 201

    except Exception as e:
        return jsonify({"error": str(e)}), 500

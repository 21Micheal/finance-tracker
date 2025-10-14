from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime
from ..extensions import db
from ..models import BillReminder, Category
from app.jobs.bills import process_bills 

bills_bp = Blueprint("bills", __name__, url_prefix="/bills")

# Create bill reminder
@bills_bp.route("/", methods=["POST"])
@jwt_required()
def create_bill():
    user_id = int(get_jwt_identity())
    data = request.get_json()

    category = Category.query.filter_by(id=data["category_id"], user_id=user_id).first()
    if not category:
        return jsonify({"error": "Invalid category"}), 400

    due_date = datetime.strptime(data["due_date"], "%Y-%m-%d").date()

    bill = BillReminder(
        user_id=user_id,
        category_id=category.id,
        amount=data["amount"],
        description=data.get("description", ""),
        due_date=due_date,
        remind_days_before=data.get("remind_days_before", 3)
    )

    db.session.add(bill)
    db.session.commit()

    return jsonify({"message": "Bill reminder created", "id": bill.id}), 201


# Get all bill reminders
@bills_bp.route("/", methods=["GET"])
@jwt_required()
def get_bills():
    user_id = int(get_jwt_identity())
    bills = BillReminder.query.filter_by(user_id=user_id).all()

    return jsonify([
        {
            "id": b.id,
            "category_id": b.category_id,
            "amount": str(b.amount),
            "description": b.description,
            "due_date": str(b.due_date),
            "remind_days_before": b.remind_days_before,
            "notified": b.notified
        } for b in bills
    ]), 200


@bills_bp.route("/send-reminders", methods=["POST"])
@jwt_required()
def send_reminders():
    print("🚀 /send-reminders triggered")
    process_bills()
    return jsonify({"msg": "reminders processed"})

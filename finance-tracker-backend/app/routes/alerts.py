from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import db, BudgetAlert, Budget, Category

alerts_bp = Blueprint("alerts", __name__)

@alerts_bp.route("/alerts", methods=["GET"])
@jwt_required()
def list_alerts():
    """List persisted budget alerts for the logged-in user"""
    user_id = get_jwt_identity()

    limit = request.args.get("limit", type=int, default=20)
    offset = request.args.get("offset", type=int, default=0)
    severity = request.args.get("severity")

    query = BudgetAlert.query.filter_by(user_id=user_id)

    if severity:
        query = query.filter(BudgetAlert.severity == severity)

    total = query.count()
    alerts = query.order_by(BudgetAlert.created_at.desc()).offset(offset).limit(limit).all()

    return jsonify({
        "alerts": [
            {
                "id": a.id,
                "budget_id": a.budget_id,
                "message": a.message,
                "severity": a.severity,
                "created_at": a.created_at.isoformat(),
                "read": a.read,
                "budget": {
                    "id": a.budget.id if a.budget else None,
                    "amount": str(a.budget.amount) if a.budget else None,
                    "category": a.budget.category.name if a.budget and a.budget.category else None,
                }
            }
            for a in alerts
        ],
        "total": total,
        "limit": limit,
        "offset": offset
    })


@alerts_bp.route("/alerts/<int:alert_id>", methods=["PATCH"])
@jwt_required()
def update_alert(alert_id):
    """Mark alert as read or dismissed"""
    user_id = get_jwt_identity()
    data = request.get_json() or {}

    alert = BudgetAlert.query.filter_by(id=alert_id, user_id=user_id).first()
    if not alert:
        return jsonify({"error": "Alert not found"}), 404

    if "read" in data:
        alert.read = bool(data["read"])
    if "dismissed" in data:
        alert.dismissed = bool(data["dismissed"])

    db.session.commit()

    return jsonify({
        "id": alert.id,
        "message": alert.message,
        "read": alert.read,
        "dismissed": alert.dismissed,
        "severity": alert.severity
    })

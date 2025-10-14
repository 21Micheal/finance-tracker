# app/routes/category_rules.py

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from app.models import CategoryRule, BankTransaction, Category

rules_bp = Blueprint("rules", __name__, url_prefix="/rules")


@rules_bp.route("", methods=["POST"])
@jwt_required()
def create_rule():
    user_id = get_jwt_identity()
    data = request.json

    category_id = data.get("category_id")

    # ✅ Validate category belongs to user
    category = Category.query.filter_by(id=category_id, user_id=user_id).first()
    if not category:
        categories = Category.query.filter_by(user_id=user_id).all()
        return jsonify({
            "error": f"Invalid category_id: {category_id}",
            "valid_categories": [
                {"id": c.id, "name": c.name, "type": c.type}
                for c in categories
            ]
        }), 400

    rule = CategoryRule(
        user_id=user_id,
        category_id=category_id,
        match_text=data.get("match_text"),
        field=data.get("field", "name"),
        match_type=data.get("match_type", "contains"),
    )

    db.session.add(rule)
    db.session.commit()

    return jsonify({
        "id": rule.id,
        "category_id": rule.category_id,
        "match_text": rule.match_text,
        "field": rule.field,
        "match_type": rule.match_type
    }), 201



@rules_bp.route("", methods=["GET"])
@jwt_required()
def list_rules():
    """List all rules for the user"""
    user_id = int(get_jwt_identity())
    rules = CategoryRule.query.filter_by(user_id=user_id).all()

    return jsonify([
        {
            "id": r.id,
            "match_text": r.match_text,
            "match_type": r.match_type,
            "category_id": r.category_id
        } for r in rules
    ])


@rules_bp.route("/categories", methods=["GET"])
@jwt_required()
def list_rule_categories():
    """List all categories available for the current user."""
    user_id = get_jwt_identity()
    categories = Category.query.filter_by(user_id=user_id).all()

    return jsonify([
        {"id": c.id, "name": c.name, "type": c.type}
        for c in categories
    ])



@rules_bp.route("/<int:rule_id>", methods=["PUT"])
@jwt_required()
def update_rule(rule_id):
    """Update an existing rule"""
    user_id = int(get_jwt_identity())
    rule = CategoryRule.query.filter_by(id=rule_id, user_id=user_id).first_or_404()

    data = request.get_json()
    rule.match_text = data.get("match_text", rule.match_text)
    rule.match_type = data.get("match_type", rule.match_type)
    rule.category_id = data.get("category_id", rule.category_id)

    db.session.commit()
    return jsonify({"message": "Rule updated"})


@rules_bp.route("/<int:rule_id>", methods=["DELETE"])
@jwt_required()
def delete_rule(rule_id):
    """Delete a category rule"""
    user_id = int(get_jwt_identity())
    rule = CategoryRule.query.filter_by(id=rule_id, user_id=user_id).first_or_404()

    db.session.delete(rule)
    db.session.commit()

    return jsonify({"message": "Rule deleted"})


@rules_bp.route("/preview", methods=["POST"])
@jwt_required()
def preview_rule():
    """Preview which transactions a rule would match without saving it"""
    user_id = int(get_jwt_identity())
    data = request.get_json()

    match_text = data.get("match_text", "").lower()
    match_type = data.get("match_type", "contains")

    if not match_text:
        return jsonify({"error": "match_text is required"}), 400

    # Only check unsynced/new transactions to simulate the rule
    query = BankTransaction.query.filter_by(user_id=user_id)

    matches = []
    for txn in query.limit(100).all():  # safety limit
        name = (txn.name or "").lower()

        if (
            (match_type == "contains" and match_text in name)
            or (match_type == "exact" and name == match_text)
            or (match_type == "startswith" and name.startswith(match_text))
            or (match_type == "endswith" and name.endswith(match_text))
        ):
            matches.append({
                "id": txn.id,
                "name": txn.name,
                "amount": float(txn.amount),
                "date": txn.date.isoformat(),
                "category": txn.category
            })

    return jsonify({
        "rule": {"match_text": match_text, "match_type": match_type},
        "matches": matches,
        "count": len(matches)
    })
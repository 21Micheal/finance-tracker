from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import Goal, db, Transaction
from datetime import datetime

goals_bp = Blueprint("goals", __name__, url_prefix="/goals")

# ➡️ Create a goal
@goals_bp.route("/", methods=["POST"])
@jwt_required()
def create_goal():
    user_id = get_jwt_identity()
    data = request.get_json()

    goal = Goal(
        user_id=user_id,
        name=data["name"],
        target_amount=data["target_amount"],
        deadline=datetime.strptime(data["deadline"], "%Y-%m-%d") if data.get("deadline") else None,
        category_id=data.get("category_id")
    )
    db.session.add(goal)
    db.session.commit()
    return jsonify({"msg": "Goal created", "goal_id": goal.id}), 201


# ➡️ Get all goals
@goals_bp.route("/", methods=["GET"])
@jwt_required()
def get_goals():
    user_id = get_jwt_identity()
    goals = Goal.query.filter_by(user_id=user_id).all()

    result = []
    for g in goals:
        # 🔹 compute savings from all transactions in this goal’s category
        total_saved = 0
        if g.category_id:
            total_saved = db.session.query(
                db.func.sum(Transaction.amount)
            ).filter_by(user_id=user_id, category_id=g.category_id).scalar() or 0

        # keep DB in sync
        g.current_amount = total_saved

        progress = float(total_saved) / float(g.target_amount) * 100 if g.target_amount > 0 else 0

        result.append({
            "id": g.id,
            "name": g.name,
            "target_amount": float(g.target_amount),
            "current_amount": float(total_saved),
            "deadline": g.deadline.strftime("%Y-%m-%d") if g.deadline else None,
            "category_id": g.category_id,
            "progress": round(progress, 2)
        })

    db.session.commit()
    return jsonify(result), 200



# ➡️ Get single goal
@goals_bp.route("/<int:goal_id>", methods=["GET"])
@jwt_required()
def get_goal(goal_id):
    user_id = get_jwt_identity()
    goal = Goal.query.filter_by(id=goal_id, user_id=user_id).first_or_404()

    total_saved = 0
    if goal.category_id:
        total_saved = db.session.query(
            db.func.sum(Transaction.amount)
        ).filter_by(user_id=user_id, category_id=goal.category_id).scalar() or 0

    goal.current_amount = total_saved
    progress = float(total_saved) / float(goal.target_amount) * 100 if goal.target_amount > 0 else 0

    db.session.commit()

    return jsonify({
        "id": goal.id,
        "name": goal.name,
        "target_amount": float(goal.target_amount),
        "current_amount": float(total_saved),
        "deadline": goal.deadline.strftime("%Y-%m-%d") if goal.deadline else None,
        "category_id": goal.category_id,
        "progress": round(progress, 2)
    }), 200



# ➡️ Update goal
@goals_bp.route("/<int:goal_id>", methods=["PUT"])
@jwt_required()
def update_goal(goal_id):
    user_id = get_jwt_identity()
    goal = Goal.query.filter_by(id=goal_id, user_id=user_id).first_or_404()

    data = request.get_json()
    goal.name = data.get("name", goal.name)
    goal.target_amount = data.get("target_amount", goal.target_amount)
    goal.deadline = datetime.strptime(data["deadline"], "%Y-%m-%d") if data.get("deadline") else goal.deadline
    goal.category_id = data.get("category_id", goal.category_id)

    db.session.commit()
    return jsonify({"msg": "Goal updated"}), 200


# ➡️ Delete goal
@goals_bp.route("/<int:goal_id>", methods=["DELETE"])
@jwt_required()
def delete_goal(goal_id):
    user_id = get_jwt_identity()
    goal = Goal.query.filter_by(id=goal_id, user_id=user_id).first_or_404()

    db.session.delete(goal)
    db.session.commit()
    return jsonify({"msg": "Goal deleted"}), 200

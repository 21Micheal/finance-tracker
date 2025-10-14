from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..extensions import db
from ..models import Category

category_bp = Blueprint("categories", __name__)

# Get all categories for logged-in user
@category_bp.route("/", methods=["GET"])
@jwt_required()
def get_categories():
    user_id = int(get_jwt_identity()) 
    categories = Category.query.filter_by(user_id=user_id).all()
    return jsonify([
        {
            "id": c.id,
            "name": c.name,
            "type": c.type,
            "color": c.color
        } for c in categories
    ]), 200


# Create new category
@category_bp.route("/", methods=["POST"])
@jwt_required()
def create_category():
    user_id = int(get_jwt_identity()) 
    data = request.get_json()

    if not data.get("name") or not data.get("type"):
        return jsonify({"error": "Name and type are required"}), 400

    new_cat = Category(
        user_id=user_id,
        name=data["name"],
        type=data["type"],
        color=data.get("color", "#000000")
    )
    db.session.add(new_cat)
    db.session.commit()

    return jsonify({"message": "Category created", "id": new_cat.id}), 201


# Update category
@category_bp.route("/<int:category_id>", methods=["PUT"])
@jwt_required()
def update_category(category_id):
    user_id = int(get_jwt_identity()) 
    category = Category.query.filter_by(id=category_id, user_id=user_id).first()

    if not category:
        return jsonify({"error": "Category not found"}), 404

    data = request.get_json()
    if "name" in data:
        category.name = data["name"]
    if "type" in data:
        category.type = data["type"]
    if "color" in data:
        category.color = data["color"]

    db.session.commit()
    return jsonify({"message": "Category updated"}), 200


# Delete category
@category_bp.route("/<int:category_id>", methods=["DELETE"])
@jwt_required()
def delete_category(category_id):
    user_id = int(get_jwt_identity()) 
    category = Category.query.filter_by(id=category_id, user_id=user_id).first()

    if not category:
        return jsonify({"error": "Category not found"}), 404

    db.session.delete(category)
    db.session.commit()
    return jsonify({"message": "Category deleted"}), 200

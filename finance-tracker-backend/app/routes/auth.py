from flask import Blueprint, request, jsonify
from ..extensions import db # Keep only necessary extensions (like db)
from ..models import User
# Import all required functions/decorators directly from flask_jwt_extended
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity 
from sqlalchemy.exc import IntegrityError

auth_bp = Blueprint("auth", __name__)

@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json()
    email = data.get("email")
    password = data.get("password")

    if not email or not password:
        return jsonify({"error": "Email and password required"}), 400

    user = User(email=email)
    user.set_password(password)

    try:
        db.session.add(user)
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "Email already registered"}), 400

    return jsonify({"message": "User registered successfully"}), 201


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json()
    email = data.get("email")
    password = data.get("password")

    user = User.query.filter_by(email=email).first()
    if user and user.check_password(password):
        token = create_access_token(identity=str(user.id))
        return jsonify({"token": token, "user_id": user.id}), 200
    return jsonify({"error": "Invalid email or password"}), 401


@auth_bp.route("/me", methods=["GET"])
@jwt_required()
def me():
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    # Ensure the user exists before accessing attributes
    if user:
        return jsonify({"id": user.id, "email": user.email})
    return jsonify({"error": "User not found"}), 404

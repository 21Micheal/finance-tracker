from flask import Flask
from .config import Config
from .extensions import db, migrate, bcrypt, jwt
from .routes.auth import auth_bp
from .routes.category import category_bp
from .routes.transaction import transaction_bp
from .routes.budget import budget_bp
from .routes.reports import report_bp
from .routes.import_csv import import_csv_bp
from .routes.export_csv import export_csv_bp
from .routes.investments import investments_bp
from .routes.portfolio import portfolio_bp
from app.routes.goals import goals_bp
from .routes.bills import bills_bp
from app.routes.alerts import alerts_bp
from .scheduler import start_scheduler
from flask_cors import CORS
import os
from flask_mail import Mail
from flask import current_app
from app.routes.bank import bank_bp
from app.routes.exports import exports_bp
from app.routes.category_rules import rules_bp
from app.routes.ai_routes import ai_bp
mail = Mail()

def create_app(config_name=None):
    app = Flask(__name__)
    CORS(app) 
    app.config.from_object(Config)

        # Init extensions
    db.init_app(app)
    migrate.init_app(app, db)
    bcrypt.init_app(app)
    jwt.init_app(app)
    mail.init_app(app)



    # Register blueprints
    app.register_blueprint(auth_bp, url_prefix="/auth")
    app.register_blueprint(category_bp, url_prefix="/categories")
    app.register_blueprint(transaction_bp, url_prefix="/transactions")
    app.register_blueprint(budget_bp, url_prefix="/budgets")
    app.register_blueprint(report_bp, url_prefix="/reports")
    app.register_blueprint(import_csv_bp, url_prefix="/import")
    app.register_blueprint(export_csv_bp, url_prefix="/export")
    app.register_blueprint(investments_bp, url_prefix="/investments")
    app.register_blueprint(portfolio_bp, url_prefix="/portfolio")
    app.register_blueprint(bills_bp, url_prefix="/bills")
    app.register_blueprint(goals_bp)
    app.register_blueprint(bank_bp, url_prefix="/bank")
    app.register_blueprint(exports_bp)
    app.register_blueprint(rules_bp)
    app.register_blueprint(alerts_bp, url_prefix="")
    app.register_blueprint(ai_bp, url_prefix="/api")

        # Start scheduler inside context
    with app.app_context():
        from .scheduler import start_scheduler
        start_scheduler(app)


    return app

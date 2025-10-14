from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_bcrypt import Bcrypt
from flask_jwt_extended import JWTManager
import os
from plaid import ApiClient, Configuration
from plaid.api.plaid_api import PlaidApi

db = SQLAlchemy()
migrate = Migrate()
bcrypt = Bcrypt()
jwt = JWTManager()


PLAID_ENV = os.getenv("PLAID_ENV", "sandbox")
PLAID_HOSTS = {
    "sandbox": "https://sandbox.plaid.com",
    "development": "https://development.plaid.com",
    "production": "https://production.plaid.com"
}

configuration = Configuration(
    host=PLAID_HOSTS[PLAID_ENV],
    api_key={
        "clientId": os.getenv("PLAID_CLIENT_ID"),
        "secret": os.getenv("PLAID_SECRET")
    }
)

api_client = ApiClient(configuration)
plaid_client = PlaidApi(api_client)

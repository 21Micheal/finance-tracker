import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "supersecret")
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL", "postgresql://user:pass@localhost/finance_tracker")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "jwtsecret")

    MAIL_SERVER = "smtp.gmail.com"
    MAIL_PORT = 587
    MAIL_USE_TLS = True
    MAIL_USERNAME = os.environ.get("MAIL_USERNAME")  # your email
    MAIL_PASSWORD = os.environ.get("MAIL_PASSWORD")  # app password (not raw password)
    MAIL_DEFAULT_SENDER = os.environ.get('MAIL_USERNAME')
    #MAIL_DEFAULT_SENDER = os.environ.get("MAIL_DEFAULT_SENDER", "noreply@financetracker.com")


    # New flag to control scheduler
    ENABLE_SCHEDULER = os.environ.get("ENABLE_SCHEDULER", "false").lower() == "true"

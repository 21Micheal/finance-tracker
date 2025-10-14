from .extensions import db, bcrypt
from datetime import datetime
from sqlalchemy.dialects.postgresql import JSONB

class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    categories = db.relationship("Category", backref="user", lazy=True)
    transactions = db.relationship("Transaction", backref="user", lazy=True)
    budgets = db.relationship("Budget", backref="user", lazy=True)

    def set_password(self, password):
        self.password_hash = bcrypt.generate_password_hash(password).decode("utf-8")

    def check_password(self, password):
        return bcrypt.check_password_hash(self.password_hash, password)


class Category(db.Model):
    __tablename__ = "categories"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    type = db.Column(db.String(20), nullable=False)  # income, expense, savings
    color = db.Column(db.String(20))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    transactions = db.relationship("Transaction", backref="category", lazy=True)
    budgets = db.relationship("Budget", backref="category", lazy=True)


class Transaction(db.Model):
    __tablename__ = "transactions"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    category_id = db.Column(db.Integer, db.ForeignKey("categories.id"), nullable=True)
    amount = db.Column(db.Numeric(10, 2), nullable=False)
    description = db.Column(db.String(255), nullable=True)
    date = db.Column(db.Date, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # 🔹 Link to bank_transactions
    bank_transaction_id = db.Column(
        db.Integer, db.ForeignKey("bank_transactions.id"), nullable=True
    )



class Budget(db.Model):
    __tablename__ = "budgets"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)

    category_id = db.Column(db.Integer, db.ForeignKey("categories.id"), nullable=True)
    account_id = db.Column(db.Integer, db.ForeignKey("bank_accounts.id"), nullable=True)

    amount = db.Column(db.Numeric, nullable=False)
    period = db.Column(db.String(20), nullable=False, default="monthly")  # daily/weekly/monthly/yearly
    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date, nullable=True)

        # Alerts
    alert_threshold = db.Column(db.Float, default=0.8)  # 80% spent by default
    notify_exceeded = db.Column(db.Boolean, default=True)

    created_at = db.Column(db.DateTime, default=db.func.now())
    updated_at = db.Column(
        db.DateTime, default=db.func.now(), onupdate=db.func.now()
    )
    category = db.relationship("Category", backref="budgets")

class BudgetAlert(db.Model):
    __tablename__ = "budget_alerts"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    budget_id = db.Column(db.Integer, db.ForeignKey("budgets.id"), nullable=False)

    message = db.Column(db.String(255), nullable=False)
    severity = db.Column(db.String(50), default="info")  # info | warning | critical
    read = db.Column(db.Boolean, default=False, nullable=False)
    dismissed = db.Column(db.Boolean, default=False, nullable=False)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    budget = db.relationship("Budget", backref="alerts")
    user = db.relationship("User", backref="alerts")



class RecurringTransaction(db.Model):
    __tablename__ = "recurring_transactions"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    category_id = db.Column(db.Integer, db.ForeignKey("categories.id"), nullable=False)
    amount = db.Column(db.Numeric(10, 2), nullable=False)
    description = db.Column(db.String(255))
    start_date = db.Column(db.Date, nullable=False)
    frequency = db.Column(db.String(50), nullable=False)  # daily, weekly, monthly, yearly
    next_date = db.Column(db.Date, nullable=False)        # next transaction due
    end_date = db.Column(db.Date, nullable=True)          # optional
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class BillReminder(db.Model):
    __tablename__ = "bill_reminders"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    category_id = db.Column(db.Integer, db.ForeignKey("categories.id"), nullable=False)
    amount = db.Column(db.Numeric(10, 2), nullable=False)
    description = db.Column(db.String(255))
    due_date = db.Column(db.Date, nullable=False)
    remind_days_before = db.Column(db.Integer, default=3)  # e.g., 3 days before
    notified = db.Column(db.Boolean, default=False)        # prevent duplicate alerts
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class Investment(db.Model):
    __tablename__ = "investments"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    name = db.Column(db.String(100), nullable=False)   # e.g., AAPL
    symbol = db.Column(db.String(20), nullable=True)  # e.g., AAPL, TSLA, BTC-USD
    type = db.Column(db.String(50), nullable=False)    # stock, crypto, ETF, real estate
    units = db.Column(db.Numeric(12, 4), nullable=False)
    purchase_price = db.Column(db.Numeric(12, 2), nullable=False)
    current_price = db.Column(db.Numeric(12, 2), nullable=True)  # updated manually or later via API
    purchase_date = db.Column(db.Date, nullable=False)
    avg_buy_price = db.Column(db.Numeric(18, 6), default=0)
    average_price = db.Column(db.Float, nullable=True)  # cost per unit
    cost_basis = db.Column(db.Float, nullable=True)     # invested amount (avg_price * quant
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = db.relationship("User", backref="investments")
    history = db.relationship("InvestmentHistory", backref="investment", lazy=True)

    @property
    def invested_amount(self):
        return self.units * self.purchase_price

    @property
    def current_value(self):
        return self.units * (self.current_price or self.purchase_price)

    @property
    def profit_loss(self):
        return self.current_value - self.invested_amount

class InvestmentHistory(db.Model):
    __tablename__ = "investment_history"

    id = db.Column(db.Integer, primary_key=True)
    investment_id = db.Column(db.Integer, db.ForeignKey("investments.id"), nullable=False)
    price = db.Column(db.Numeric(12, 2), nullable=False)
    value = db.Column(db.Numeric(12, 2), nullable=False)
    recorded_at = db.Column(db.DateTime, default=datetime.utcnow)

# app/models.py

class InvestmentTransaction(db.Model):
    __tablename__ = "investment_transactions"

    id = db.Column(db.Integer, primary_key=True)
    investment_id = db.Column(db.Integer, db.ForeignKey("investments.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    type = db.Column(db.String(50), nullable=False)  # buy, sell, dividend
    units = db.Column(db.Numeric, nullable=True)
    amount = db.Column(db.Numeric, nullable=False)
    price = db.Column(db.Numeric, nullable=True)
    date = db.Column(db.Date, nullable=False)
    created_at = db.Column(db.DateTime, default=db.func.now())

    # ✅ Track when this tx was mirrored into `transactions`
    synced_at = db.Column(db.DateTime, nullable=True)




class PortfolioSnapshot(db.Model):
    __tablename__ = "portfolio_snapshots"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    date = db.Column(db.Date, nullable=False, default=datetime.utcnow().date)
    total_invested = db.Column(db.Numeric(12, 2), nullable=False)
    current_value = db.Column(db.Numeric(12, 2), nullable=False)
    profit_loss = db.Column(db.Numeric(12, 2), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class InvestmentSnapshot(db.Model):
    __tablename__ = "investment_snapshots"

    id = db.Column(db.Integer, primary_key=True)
    investment_id = db.Column(db.Integer, db.ForeignKey("investments.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)

    value = db.Column(db.Numeric(12, 2), nullable=False)  # units * current_price
    units = db.Column(db.Numeric(12, 4), nullable=False)
    price = db.Column(db.Numeric(12, 2), nullable=False)  # snapshot price
    cost_basis = db.Column(db.Numeric(18, 2), nullable=False, default=0)
    snapshot_date = db.Column(db.Date, nullable=False, default=datetime.utcnow().date)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    investment = db.relationship("Investment", backref="snapshots", lazy=True)



class Goal(db.Model):
    __tablename__ = "goals"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    name = db.Column(db.String(255), nullable=False)
    target_amount = db.Column(db.Numeric(10, 2), nullable=False)
    current_amount = db.Column(db.Numeric(10, 2), default=0)
    deadline = db.Column(db.Date, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

        # 🔹 New: link to category
    category_id = db.Column(db.Integer, db.ForeignKey("categories.id"), nullable=True)

    user = db.relationship("User", backref="goals")
    category = db.relationship("Category", backref="goals")


class BankItem(db.Model):
    __tablename__ = "bank_items"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    access_token = db.Column(db.String(255), nullable=False)
    item_id = db.Column(db.String(255), nullable=False)
    institution_name = db.Column(db.String(255), nullable=False)
    cursor = db.Column(db.String(255), nullable=True)   # 👈 NEW
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


# app/models.py
class BankTransaction(db.Model):
    __tablename__ = "bank_transactions"

    id = db.Column(db.Integer, primary_key=True)
    bank_item_id = db.Column(db.Integer, db.ForeignKey("bank_items.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)

    bank_account_id = db.Column(
        db.Integer, db.ForeignKey("bank_accounts.id"), nullable=False
    )  # ✅ NEW

    plaid_transaction_id = db.Column(db.String(255), unique=True, nullable=False)
    name = db.Column(db.String(255), nullable=False)
    currency = db.Column(db.String, default="USD")
    amount = db.Column(db.Numeric, nullable=False)
    date = db.Column(db.Date, nullable=False)
    pending = db.Column(db.Boolean, default=False)
    category = db.Column(db.String(255), nullable=True)

    created_at = db.Column(db.DateTime, default=db.func.now())
    synced_at = db.Column(db.DateTime, nullable=True)

    account = db.relationship("BankAccount", backref="transactions")  # ✅ now valid




class BankAccount(db.Model):
    __tablename__ = "bank_accounts"

    id = db.Column(db.Integer, primary_key=True)
    bank_item_id = db.Column(db.Integer, db.ForeignKey("bank_items.id"), nullable=False)
    account_id = db.Column(db.String, unique=True, nullable=False)  # Plaid account_id
    name = db.Column(db.String, nullable=False)
    type = db.Column(db.String, nullable=False)  # depository, credit, loan, etc.
    subtype = db.Column(db.String, nullable=True)
    mask = db.Column(db.String, nullable=True)  # last 4 digits
    balance_available = db.Column(db.Float, nullable=True)
    balance_current = db.Column(db.Float, nullable=True)
    currency = db.Column(db.String, nullable=True)
    last_synced = db.Column(db.DateTime, default=datetime.utcnow)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    bank_item = db.relationship("BankItem", backref="accounts", lazy=True)

class CategoryRule(db.Model):
    __tablename__ = "category_rules"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    category_id = db.Column(db.Integer, db.ForeignKey("categories.id"), nullable=False)

    # Match conditions
    match_text = db.Column(db.String(255), nullable=False)  # e.g., "Uber"
    field = db.Column(db.String(50), default="name")  # name | category | merchant
    match_type = db.Column(db.String(50), default="contains")  # exact | contains | startswith | regex

    created_at = db.Column(db.DateTime, default=db.func.now())
    updated_at = db.Column(db.DateTime, default=db.func.now(), onupdate=db.func.now())



class Report(db.Model):
    __tablename__ = "reports"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)

    name = db.Column(db.String(255), nullable=False)
    period_start = db.Column(db.Date, nullable=False)
    period_end = db.Column(db.Date, nullable=False)

    data = db.Column(JSONB, nullable=False)  # stores summary, breakdowns, etc.

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship("User", backref="reports")

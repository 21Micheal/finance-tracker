from app.models import Category, db
from datetime import datetime

INVESTMENT_CATEGORY_MAP = {
    "dividend": "Dividends",
    "interest": "Interest Income",
    "buy": "Investments - Purchase",
    "sell": "Investments - Sale",
    "capital_gains": "Capital Gains"
}

def get_or_create_category(user_id, plaid_category, default_type="expense"):
    """
    Returns a Category object. Creates one if missing.
    """
    if not plaid_category:
        return None

    # Only use first element of Plaid category hierarchy, e.g. ["Food and Drink", "Restaurants"]
    if isinstance(plaid_category, list):
        category_name = plaid_category[0]
    else:
        category_name = plaid_category

    # Map investment categories if applicable
    if isinstance(category_name, str) and category_name.lower() in INVESTMENT_CATEGORY_MAP:
        category_name = INVESTMENT_CATEGORY_MAP[category_name.lower()]
        default_type = "investment"

    existing = Category.query.filter_by(
        user_id=user_id, name=category_name
    ).first()
    if existing:
        return existing

    # Create new category
    new_cat = Category(
        user_id=user_id,
        name=category_name,
        type=default_type,
        color="#3498db",  # default blue
        created_at=datetime.utcnow()
    )
    db.session.add(new_cat)
    db.session.flush()
    return new_cat

def get_investment_category(user_id, txn_type):
    """
    Maps investment transaction types to categories.
    Creates category if missing.
    """
    category_name = INVESTMENT_CATEGORY_MAP.get(txn_type.lower(), "Investments - Other")
    return get_or_create_category(user_id, category_name, default_type="income" if txn_type in ["dividend", "interest", "capital_gains"] else "expense")

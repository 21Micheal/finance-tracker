from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import plaid_client, db
from app.models import BankItem, BankTransaction, BankAccount
from plaid.model.link_token_create_request import LinkTokenCreateRequest
from plaid.model.products import Products
from plaid.model.country_code import CountryCode
from datetime import date, datetime, timedelta
from plaid.model.transactions_get_request import TransactionsGetRequest
from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest
from plaid.model.accounts_balance_get_request import AccountsBalanceGetRequest
from datetime import datetime
from plaid.model.transactions_sync_request import TransactionsSyncRequest
from plaid.model.accounts_get_request import AccountsGetRequest 
from app.models import Transaction, Category, CategoryRule
from app.utils.categories import get_or_create_category
from app.services.bank_service import backfill_bank_transactions, sync_bank_accounts
import os
import logging
from random import uniform


bank_bp = Blueprint("bank", __name__)



# Reuse Plaid client if configured
plaid_client = None
try:
    from plaid.api import plaid_api
    from plaid.configuration import Configuration, Environment
    from plaid.api_client import ApiClient
    from plaid.exceptions import ApiException
    from plaid.model.transactions_sync_request import TransactionsSyncRequest
except ImportError:
    plaid_api = None
    TransactionsSyncRequest = None

    PLAID_CLIENT_ID = os.getenv("PLAID_CLIENT_ID")
    PLAID_SECRET = os.getenv("PLAID_SECRET")
    PLAID_ENV = os.getenv("PLAID_ENV", "sandbox")

    if PLAID_CLIENT_ID and PLAID_SECRET:
        configuration = Configuration(
            host=(
                Environment.Sandbox if PLAID_ENV == "sandbox"
                else Environment.Development if PLAID_ENV == "development"
                else Environment.Production
            ),
            api_key={
                "client_id": PLAID_CLIENT_ID,   # ✅ must be snake_case
                "secret": PLAID_SECRET
            },
        )
        api_client = ApiClient(configuration)
        plaid_client = plaid_api.PlaidApi(api_client)
except ImportError:
    plaid_client = None


@bank_bp.route("/create_link_token", methods=["POST"])
@jwt_required()
def create_link_token():
    user_id = get_jwt_identity()
    request = LinkTokenCreateRequest(
        user={"client_user_id": str(user_id)},
        client_name="Finance Tracker",
        products=[Products("transactions")],
        country_codes=[CountryCode("US")],
        language="en"
    )
    response = plaid_client.link_token_create(request)
    return jsonify(response.to_dict())

@bank_bp.route("/exchange_public_token", methods=["POST"])
@jwt_required()
def exchange_public_token():
    data = request.json
    public_token = data.get("public_token")

    req = ItemPublicTokenExchangeRequest(public_token=public_token)
    exchange_response = plaid_client.item_public_token_exchange(req)

    access_token = exchange_response.to_dict()["access_token"]
    item_id = exchange_response.to_dict()["item_id"]

    user_id = get_jwt_identity()
    item = BankItem(user_id=user_id, access_token=access_token, item_id=item_id)
    db.session.add(item)
    db.session.commit()

    return jsonify({"message": "Bank account linked successfully"})



@bank_bp.route('/transactions/sync', methods=['GET'])
@jwt_required()
def sync_transactions():
    """
    Sync transactions from Plaid or return fake-account transactions.
    Response normalizes categories to internal ones (if mapped),
    otherwise falls back to Plaid-provided categories.
    """
    user_id = get_jwt_identity()
    bank_item = BankItem.query.filter_by(user_id=user_id).first()

    if not bank_item:
        return jsonify({"error": "No bank account linked"}), 400

    # --- Query params ---
    start_date_str = request.args.get("start_date")
    end_date_str = request.args.get("end_date")
    category_id = request.args.get("category_id", type=int)
    sort_by = request.args.get("sort_by", "date")   # date | amount | name
    order = request.args.get("order", "desc")       # asc | desc
    limit = request.args.get("limit", type=int, default=50)
    offset = request.args.get("offset", type=int, default=0)

    # Parse dates
    try:
        start_date = datetime.fromisoformat(start_date_str).date() if start_date_str else None
        end_date = datetime.fromisoformat(end_date_str).date() if end_date_str else None
    except ValueError:
        return jsonify({"error": "Invalid date format. Use ISO format (YYYY-MM-DD)"}), 400

    # --- Sorting ---
    valid_sort_keys = {
        "date": BankTransaction.date,
        "amount": BankTransaction.amount,
        "name": BankTransaction.name
    }
    sort_col = valid_sort_keys.get(sort_by, BankTransaction.date)
    sort_order = sort_col.asc() if order == "asc" else sort_col.desc()

    def build_response(query):
        """Helper: build frontend-friendly paginated response"""
        total = query.count()
        transactions = query.order_by(sort_order).offset(offset).limit(limit).all()

        results = []
        for t in transactions:
            category_id = None
            category_name = None

            # Prefer internal mapped Transaction
            if t.transactions:
                internal_txn = t.transactions[0]  # use the newest one
                if internal_txn.category_id:
                    cat = Category.query.filter_by(
                        id=internal_txn.category_id, user_id=user_id
                    ).first()
                    if cat:
                        category_id = cat.id
                        category_name = cat.name

            # Fallback to Plaid raw category
            if not category_name:
                category_name = t.category
                category_id = None

            results.append({
                "id": t.id,
                "transaction_id": t.plaid_transaction_id,
                "amount": float(t.amount),
                "date": t.date.isoformat(),
                "name": t.name,
                "pending": t.pending,
                "category_id": category_id,
                "category_name": category_name,
                "merchant_name": getattr(t, 'merchant_name', None),
                "payment_channel": getattr(t, 'payment_channel', None)
            })

        return jsonify({
            "transactions": results,
            "total": total,
            "limit": limit,
            "offset": offset
        })

    # --- Fake account flow ---
    if bank_item.access_token and bank_item.access_token.startswith("fake_"):
        query = BankTransaction.query.join(BankAccount).filter(BankAccount.bank_item_id == bank_item.id)
        if start_date:
            query = query.filter(BankTransaction.date >= start_date)
        if end_date:
            query = query.filter(BankTransaction.date <= end_date)
        if category_id:
            query = query.join(Transaction).filter(Transaction.category_id == category_id)
        return build_response(query)

    # --- Plaid sync flow ---
    cursor = bank_item.cursor or ""
    
    # Backfill if needed (first sync or reset)
    if not cursor:
        backfill_bank_transactions(user_id)

    try:
        has_more = True
        added_count = 0
        modified_count = 0
        removed_count = 0
        
        while has_more and plaid_client:
            req = TransactionsSyncRequest(access_token=bank_item.access_token, cursor=cursor)
            response = plaid_client.transactions_sync(req).to_dict()

            # Process added transactions
            for txn in response["added"]:
                exists = BankTransaction.query.filter_by(plaid_transaction_id=txn["transaction_id"]).first()
                if not exists:
                    account = BankAccount.query.filter_by(account_id=txn["account_id"]).first()
                    if not account:
                        # Create account if it doesn't exist
                        account = BankAccount(
                            bank_item_id=bank_item.id,
                            account_id=txn["account_id"],
                            name=txn.get("account_name", "Unknown Account"),
                            official_name=txn.get("account_official_name", ""),
                            type=txn.get("account_type", "unknown"),
                            subtype=txn.get("account_subtype", "unknown")
                        )
                        db.session.add(account)
                        db.session.flush()

                    new_bank_txn = BankTransaction(
                        bank_account_id=account.id,
                        plaid_transaction_id=txn["transaction_id"],
                        name=txn.get("name", ""),
                        amount=txn["amount"],
                        currency=txn.get("iso_currency_code"),
                        date=datetime.fromisoformat(txn["date"]).date(),
                        pending=txn["pending"],
                        category=",".join(txn.get("category", [])) if txn.get("category") else None,
                        merchant_name=txn.get("merchant_name"),
                        payment_channel=txn.get("payment_channel")
                    )
                    db.session.add(new_bank_txn)
                    db.session.flush()

                    # Try auto-categorization via rules
                    matched_category = None
                    rule = CategoryRule.query.filter_by(user_id=user_id).filter(
                        CategoryRule.field == "name",
                        CategoryRule.match_type == "contains",
                        CategoryRule.match_text.ilike(f"%{txn.get('name', '')}%")
                    ).first()
                    
                    if rule:
                        matched_category = Category.query.get(rule.category_id)
                    
                    # If no rule, fallback to Plaid-derived category
                    if not matched_category:
                        matched_category = get_or_create_category(
                            user_id, txn.get("category", []), default_type="expense"
                        )

                    new_txn = Transaction(
                        user_id=user_id,
                        category_id=matched_category.id if matched_category else None,
                        amount=txn["amount"],
                        description=txn.get("name", ""),
                        date=datetime.fromisoformat(txn["date"]).date(),
                        bank_transaction_id=new_bank_txn.id
                    )
                    db.session.add(new_txn)
                    added_count += 1

            # Process modified transactions
            for txn in response["modified"]:
                existing_txn = BankTransaction.query.filter_by(plaid_transaction_id=txn["transaction_id"]).first()
                if existing_txn:
                    existing_txn.amount = txn["amount"]
                    existing_txn.pending = txn["pending"]
                    # Update other fields as needed
                    modified_count += 1

            # Process removed transactions
            for txn in response["removed"]:
                removed_txn = BankTransaction.query.filter_by(plaid_transaction_id=txn["transaction_id"]).first()
                if removed_txn:
                    associated_txn = Transaction.query.filter_by(bank_transaction_id=removed_txn.id).first()
                    if associated_txn:
                        db.session.delete(associated_txn)
                    db.session.delete(removed_txn)
                    removed_count += 1

            cursor = response["next_cursor"]
            has_more = response["has_more"]

        bank_item.cursor = cursor
        db.session.commit()

        # Apply filters after sync
        query = BankTransaction.query.join(BankAccount).filter(BankAccount.bank_item_id == bank_item.id)
        if start_date:
            query = query.filter(BankTransaction.date >= start_date)
        if end_date:
            query = query.filter(BankTransaction.date <= end_date)
        if category_id:
            query = query.join(Transaction).filter(Transaction.category_id == category_id)

        response = build_response(query)
        response_data = response.get_json()
        response_data["sync_stats"] = {
            "added": added_count,
            "modified": modified_count,
            "removed": removed_count
        }
        return jsonify(response_data)

    except ApiException as e:
        db.session.rollback()
        return jsonify({"error": f"Plaid API error: {e}"}), 500
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


def apply_category_rules(user_id, transaction_name, plaid_categories=None):
    """
    Apply user-defined category rules to a transaction
    Returns category_id if a rule matches, otherwise returns None
    """
    try:
        rules = CategoryRule.query.filter_by(user_id=user_id).all()

        for rule in rules:
            target_value = transaction_name.lower()
            match_value = rule.match_text.lower()

            if rule.match_type == "exact" and target_value == match_value:
                return rule.category_id
            elif rule.match_type == "contains" and match_value in target_value:
                return rule.category_id
            elif rule.match_type == "startswith" and target_value.startswith(match_value):
                return rule.category_id
            elif rule.match_type == "regex":
                import re
                if re.search(match_value, target_value):
                    return rule.category_id

        # fallback to Plaid categories or default
        if plaid_categories:
            cat = get_or_create_category(user_id, plaid_categories)
            return cat.id if cat else None

        return None
    except Exception as e:
        # Log the error but don't break the transaction processing
        logging.error(f"Error applying category rules: {e}")
        return None
    
    
@bank_bp.route('/accounts/sync', methods=['GET'])
@jwt_required()
def sync_accounts():
    user_id = int(get_jwt_identity())
    bank_item = BankItem.query.filter_by(user_id=user_id).first()

    if not bank_item:
        return jsonify({"error": "No bank account linked"}), 400

    # Query params
    account_type = request.args.get("type")
    sort_by = request.args.get("sort_by", "name")  # name | balance
    order = request.args.get("order", "asc")       # asc | desc
    limit = request.args.get("limit", type=int, default=20)
    offset = request.args.get("offset", type=int, default=0)

    # Sorting
    valid_sort_keys = {
        "name": BankAccount.name,
        "balance": BankAccount.balance_current,
    }
    sort_col = valid_sort_keys.get(sort_by, BankAccount.name)
    sort_order = sort_col.asc() if order == "asc" else sort_col.desc()

    def build_response(query):
        all_accounts = query.all()
        total = len(all_accounts)

        accounts = sorted(all_accounts, key=lambda a: getattr(a, sort_by if sort_by in valid_sort_keys else "name"))
        if order == "desc":
            accounts = list(reversed(accounts))

        accounts_page = accounts[offset:offset+limit]

        # 🔹 Portfolio summary
        summary = {}
        for a in all_accounts:
            t = a.type or "unknown"
            summary.setdefault(t, 0.0)
            summary[t] += float(a.balance_current or 0)

        grand_total = sum(summary.values())
        portfolio_summary = [
            {
                "type": t,
                "total_balance": round(v, 2),
                "percentage": round((v / grand_total * 100), 2) if grand_total > 0 else 0.0
            }
            for t, v in summary.items()
        ]

        return jsonify({
            "accounts": [{
                "id": a.id,
                "account_id": a.account_id,
                "name": a.name,
                "mask": a.mask,
                "type": a.type,
                "subtype": a.subtype,
                "balance_current": float(a.balance_current or 0),
                "balance_available": float(a.balance_available or 0),
            } for a in accounts_page],
            "portfolio_summary": portfolio_summary,
            "grand_total": round(grand_total, 2),
            "total": total,
            "limit": limit,
            "offset": offset
        })

    # 🔹 Fake accounts
    if bank_item.access_token.startswith("fake_"):
        query = BankAccount.query.filter_by(user_id=user_id)
        if account_type:
            query = query.filter(BankAccount.type == account_type)
        return build_response(query)

    # 🔹 Real Plaid sync
    try:
        request_obj = AccountsGetRequest(access_token=bank_item.access_token)
        response = plaid_client.accounts_get(request_obj).to_dict()
        plaid_accounts = response.get("accounts", [])

        for acct in plaid_accounts:
            existing = BankAccount.query.filter_by(account_id=acct["account_id"]).first()
            if existing:
                existing.name = acct["name"]
                existing.mask = acct["mask"]
                existing.type = acct["type"]
                existing.subtype = acct.get("subtype")
                existing.balance_current = acct["balances"].get("current") or 0.0
                existing.balance_available = acct["balances"].get("available") or 0.0
            else:
                new_account = BankAccount(
                    bank_item_id=bank_item.id,
                    account_id=acct["account_id"],
                    name=acct["name"],
                    mask=acct["mask"],
                    type=acct["type"],
                    subtype=acct.get("subtype"),
                    balance_current=acct["balances"].get("current") or 0.0,
                    balance_available=acct["balances"].get("available") or 0.0,
                )
                db.session.add(new_account)

        db.session.commit()

        query = BankAccount.query.filter_by(user_id=user_id)
        if account_type:
            query = query.filter(BankAccount.type == account_type)

        return build_response(query)

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500



@bank_bp.route("/accounts", methods=["GET"])
@jwt_required()
def list_accounts():
    user_id = int(get_jwt_identity())
    item = BankItem.query.filter_by(user_id=user_id).first()
    if not item:
        return jsonify({"error": "No bank account linked"}), 400

    accounts = BankAccount.query.filter_by(bank_item_id=item.id).all()
    return jsonify([
        {
            "id": acc.id,
            "name": acc.name,
            "type": acc.type,
            "subtype": acc.subtype,
            "balance_available": acc.balance_available,
            "balance_current": acc.balance_current,
            "currency": acc.currency,
            "last_synced": acc.last_synced.isoformat() if acc.last_synced else None
        }
        for acc in accounts
    ])
@bank_bp.route("/transactions", methods=["GET"])
@jwt_required()
def list_transactions():
    """
    List user's bank transactions with optional filters, pagination, and sorting.
    Query params:
      - start_date=YYYY-MM-DD
      - end_date=YYYY-MM-DD
      - category=CategoryName
      - page (default=1)
      - per_page (default=20, max=100)
      - sort=comma-separated (date,amount,name,category,bank_account)
      - order=comma-separated (asc,desc)
    """
    user_id = int(get_jwt_identity())
    item = BankItem.query.filter_by(user_id=user_id).first()
    if not item:
        return jsonify({"error": "No bank item linked"}), 400

    # Base query with joins for sorting
    query = (
        BankTransaction.query
        .join(BankItem, BankItem.id == BankTransaction.bank_item_id)
        .outerjoin(Category, Category.id == BankTransaction.category_id)
        .filter(BankItem.user_id == user_id)
    )

    # Filters
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")
    category = request.args.get("category")

    if start_date:
        query = query.filter(BankTransaction.date >= datetime.strptime(start_date, "%Y-%m-%d").date())
    if end_date:
        query = query.filter(BankTransaction.date <= datetime.strptime(end_date, "%Y-%m-%d").date())
    if category:
        query = query.filter(Category.name.ilike(f"%{category}%"))

    # Pagination
    page = int(request.args.get("page", 1))

    # Sorting
    sort_keys = request.args.get("sort")
    order_keys = request.args.get("order")

    # If no sort is provided, use default multi-sort: date desc, amount desc
    if not sort_keys:
        sort_keys = ["date", "amount"]
        order_keys = ["desc", "desc"]
    else:
        sort_keys = sort_keys.split(",")
        order_keys = order_keys.split(",")

    sort_map = {
        "date": BankTransaction.date,
        "amount": BankTransaction.amount,
        "name": BankTransaction.name,
        "category": Category.name,
        "bank_account": BankItem.institution_name,
    }

    for i, key in enumerate(sort_keys):
        key = key.strip()
        column = sort_map.get(key)
        if not column:
            continue
        order = order_keys[i] if i < len(order_keys) else "desc"
        query = query.order_by(column.asc() if order == "asc" else column.desc())
    per_page = min(int(request.args.get("per_page", 20)), 100)

    # Apply pagination
    paginated = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        "transactions": [
            {
                "id": tx.id,
                "transaction_id": tx.transaction_id,
                "name": tx.name,
                "amount": float(tx.amount),
                "date": tx.date.isoformat(),
                "category": tx.category.name if tx.category else None,
                "bank_account": tx.bank_item.institution_name if tx.bank_item else None,
            }
            for tx in paginated.items
        ],
        "pagination": {
            "page": paginated.page,
            "per_page": paginated.per_page,
            "total": paginated.total,
            "pages": paginated.pages
        }
    })

@bank_bp.route("/rules/preview", methods=["POST"])
@jwt_required()
def preview_rule():
    """
    Dry-run a category rule against the user's transactions with pagination.
    """
    user_id = get_jwt_identity()
    data = request.get_json()

    match_text = data.get("match_text")
    match_type = data.get("match_type")  # contains | exact | startswith | endswith
    field = data.get("field", "name")    # default: transaction name
    category_id = data.get("category_id")

    limit = request.args.get("limit", type=int, default=20)
    offset = request.args.get("offset", type=int, default=0)

    if not match_text or not match_type:
        return jsonify({"error": "match_text and match_type are required"}), 400

    # ✅ Ensure category exists
    category = Category.query.filter_by(id=category_id, user_id=user_id).first()
    if not category:
        return jsonify({
            "error": f"Invalid category_id: {category_id}",
            "valid_categories": [
                {"id": c.id, "name": c.name, "type": c.type}
                for c in Category.query.filter_by(user_id=user_id).all()
            ]
        }), 400

    # ✅ Load all transactions for matching
    all_txns = (
        BankTransaction.query
        .filter_by(user_id=user_id)
        .order_by(BankTransaction.date.desc())
        .all()
    )

    # ✅ Apply rule matching in Python
    matched = []
    for txn in all_txns:
        field_value = getattr(txn, field, "")
        if not field_value:
            continue

        if match_type == "contains" and match_text.lower() in field_value.lower():
            matched.append(txn)
        elif match_type == "exact" and field_value.lower() == match_text.lower():
            matched.append(txn)
        elif match_type == "startswith" and field_value.lower().startswith(match_text.lower()):
            matched.append(txn)
        elif match_type == "endswith" and field_value.lower().endswith(match_text.lower()):
            matched.append(txn)

    total = len(matched)
    paginated = matched[offset:offset + limit]

    return jsonify({
        "rule": {
            "field": field,
            "match_text": match_text,
            "match_type": match_type,
            "category": {"id": category.id, "name": category.name}
        },
        "matched_transactions": [{
            "id": t.id,
            "name": t.name,
            "amount": float(t.amount),
            "date": t.date.isoformat(),
            "pending": t.pending,
            "category": t.category
        } for t in paginated],
        "total": total,
        "limit": limit,
        "offset": offset
    })

@bank_bp.route('/transactions/stats', methods=['GET'])
@jwt_required()
def transaction_stats():
    user_id = get_jwt_identity()

    # Query params
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")

    query = Transaction.query.filter_by(user_id=user_id)

    if start_date:
        query = query.filter(Transaction.date >= start_date)
    if end_date:
        query = query.filter(Transaction.date <= end_date)

    transactions = query.all()

    income = sum(float(t.amount) for t in transactions if t.category and t.category.type == "income")
    expenses = sum(float(t.amount) for t in transactions if t.category and t.category.type == "expense")
    uncategorized = sum(float(t.amount) for t in transactions if not t.category_id)

    net = income - expenses

    # 🔹 Latest transaction date
    latest_txn_date = max([t.date for t in transactions], default=None)

    # 🔹 Category breakdown
    breakdown = {}
    for t in transactions:
        cat_name = t.category.name if t.category else "Uncategorized"
        breakdown.setdefault(cat_name, 0.0)
        breakdown[cat_name] += float(t.amount)

    category_breakdown = [
        {"category": cat, "total": round(total, 2)}
        for cat, total in breakdown.items()
    ]

    return jsonify({
        "income": round(income, 2),
        "expenses": round(expenses, 2),
        "uncategorized": round(uncategorized, 2),
        "net": round(net, 2),
        "total_transactions": len(transactions),
        "latest_transaction_date": latest_txn_date.isoformat() if latest_txn_date else None,
        "category_breakdown": category_breakdown
    })

@bank_bp.route('/transactions/category-summary', methods=['GET'])
@jwt_required()
def category_summary():
    user_id = get_jwt_identity()

    # Query params
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")

    query = Transaction.query.filter_by(user_id=user_id)

    if start_date:
        query = query.filter(Transaction.date >= start_date)
    if end_date:
        query = query.filter(Transaction.date <= end_date)

    transactions = query.all()

    expenses = {}
    income = {}
    uncategorized = {}

    total_expenses = 0.0
    total_income = 0.0

    for t in transactions:
        if t.category:
            cat_name = t.category.name
            cat_type = t.category.type
        else:
            cat_name = "Uncategorized"
            cat_type = "uncategorized"

        bucket = (
            expenses if cat_type == "expense"
            else income if cat_type == "income"
            else uncategorized
        )

        if cat_name not in bucket:
            bucket[cat_name] = {"category": cat_name, "total": 0.0, "count": 0}

        bucket[cat_name]["total"] += float(t.amount)
        bucket[cat_name]["count"] += 1

        # track totals
        if cat_type == "expense":
            total_expenses += float(t.amount)
        elif cat_type == "income":
            total_income += float(t.amount)

    net_balance = total_income - total_expenses

    return jsonify({
        "totals": {
            "total_expenses": round(total_expenses, 2),
            "total_income": round(total_income, 2),
            "net_balance": round(net_balance, 2)
        },
        "expenses": list(expenses.values()),
        "income": list(income.values()),
        "uncategorized": list(uncategorized.values())
    })

# from sqlalchemy import func

# @bank_bp.route("/transactions/timeseries", methods=["GET"])
# @jwt_required()
# def transactions_timeseries():
#     """
#     Return aggregated transactions as a time series.
#     Query params:
#       - group_by: day | month | year (default: month)
#       - type: income | expense | all (default: all)
#       - start_date: filter lower bound
#       - end_date: filter upper bound
#     """
#     user_id = get_jwt_identity()

#     group_by = request.args.get("group_by", "month")
#     tx_type = request.args.get("type", "all")
#     start_date = request.args.get("start_date")
#     end_date = request.args.get("end_date")

#     query = Transaction.query.filter(Transaction.user_id == user_id)

#     if start_date:
#         query = query.filter(Transaction.date >= start_date)
#     if end_date:
#         query = query.filter(Transaction.date <= end_date)

#     if tx_type in ["income", "expense"]:
#         query = query.join(Category).filter(Category.type == tx_type)

#     # Pick date grouping
#     if group_by == "day":
#         date_trunc = func.date_trunc("day", Transaction.date)
#     elif group_by == "year":
#         date_trunc = func.date_trunc("year", Transaction.date)
#     else:  # default = month
#         date_trunc = func.date_trunc("month", Transaction.date)

#     results = (
#         db.session.query(date_trunc.label("period"), func.sum(Transaction.amount))
#         .select_from(Transaction)
#         .filter(Transaction.user_id == user_id)
#         .group_by("period")
#         .order_by("period")
#         .all()
#     )

#     return jsonify([
#         {"period": r.period.isoformat(), "total": float(r[1]) if r[1] else 0.0}
#         for r in results
#     ])
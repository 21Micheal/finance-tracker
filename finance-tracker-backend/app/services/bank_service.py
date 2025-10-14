# app/services/bank_service.py
import os
import random
from datetime import datetime, timedelta
from plaid.api_client import ApiClient
from plaid.configuration import Configuration, Environment
from plaid.model.transactions_get_request import TransactionsGetRequest
from plaid.model.transactions_get_request_options import TransactionsGetRequestOptions
from plaid.api import plaid_api
from plaid.model.accounts_balance_get_request import AccountsBalanceGetRequest
from datetime import datetime
from app.models import BankTransaction, Transaction, Category, BankItem, BankAccount, db


plaid_client = None
try:
    PLAID_CLIENT_ID = os.getenv("PLAID_CLIENT_ID")
    PLAID_SECRET = os.getenv("PLAID_SECRET")
    PLAID_ENV = os.getenv("PLAID_ENV", "sandbox")

    if PLAID_CLIENT_ID and PLAID_SECRET:
        configuration = Configuration(
            host=Environment.Sandbox if PLAID_ENV == "sandbox" else Environment.Development,
            api_key={
                "clientId": PLAID_CLIENT_ID,
                "secret": PLAID_SECRET,
            },
        )
        api_client = ApiClient(configuration)
        plaid_client = plaid_api.PlaidApi(api_client)
except ImportError:
    plaid_client = None


def fetch_transactions(user_id, plaid_account_id, start_date, end_date):
    """
    Fetch transactions from Plaid if configured, otherwise mock data.
    Returns list of dicts {amount, name, date, category}
    """
    if plaid_client:
        item = BankItem.query.filter_by(user_id=user_id).first()
        if not item:
            return []

        req = TransactionsGetRequest(
            access_token=item.access_token,
            start_date=start_date,
            end_date=end_date,
            options=TransactionsGetRequestOptions(account_ids=[plaid_account_id])
        )

        response = plaid_client.transactions_get(req).to_dict()
        return [
            {
                "amount": tx["amount"],
                "name": tx["name"],
                "date": tx["date"],
                "category": tx.get("category", ["Uncategorized"])[0]
            }
            for tx in response["transactions"]
        ]

    # --------------------------
    # Mock data fallback (dev)
    # --------------------------
    print("⚠️ Using mock transaction data (Plaid not configured)")
    categories = ["Groceries", "Dining", "Rent", "Utilities", "Salary"]

    num_txs = random.randint(2, 5)
    mock_txs = []
    for i in range(num_txs):
        tx_date = end_date - timedelta(days=random.randint(0, 2))
        mock_txs.append({
            "amount": round(random.uniform(-200, 2000), 2),  # debit/credit
            "name": random.choice(["Supermarket", "Restaurant", "Landlord", "Employer", "Power Co"]),
            "date": tx_date.isoformat(),
            "category": random.choice(categories),
        })
    return mock_txs

def backfill_bank_transactions(user_id):
    unsynced = BankTransaction.query.filter_by(user_id=user_id, synced_at=None).all()
    if not unsynced:
        return

    for btx in unsynced:
        # ✅ Auto-create or find category
        category = Category.query.filter_by(user_id=user_id, name=btx.category).first()
        if not category:
            # Heuristic: treat negative as expense, positive as income
            ctype = "expense" if btx.amount < 0 else "income"
            category = Category(
                user_id=user_id,
                name=btx.category or "Uncategorized",
                type=ctype,
                color="#AAAAAA"
            )
            db.session.add(category)
            db.session.commit()

        txn = Transaction(
            user_id=user_id,
            category_id=category.id,
            amount=btx.amount,
            description=f"Bank Tx - {btx.name}",
            date=btx.date,
        )
        db.session.add(txn)

        # Mark synced
        btx.synced_at = datetime.utcnow()

    db.session.commit()


def sync_bank_accounts(user_id, client):
    """Sync bank accounts balances via Plaid or fallback to mock data."""

    bank_item = BankItem.query.filter_by(user_id=user_id).first()
    if not bank_item:
        return {"error": "No bank account linked"}, 404

    accounts = BankAccount.query.filter_by(bank_item_id=bank_item.id).all()

    if not accounts:
        return {"error": "No accounts found for user"}, 404

    # If Plaid is configured, fetch real balances
    if client and bank_item.access_token.startswith("access-"):
        try:
            request = AccountsBalanceGetRequest(access_token=bank_item.access_token)
            response = client.accounts_balance_get(request)
            plaid_accounts = {acc.account_id: acc for acc in response['accounts']}

            for acc in accounts:
                if acc.account_id in plaid_accounts:
                    acc.balance = plaid_accounts[acc.account_id]['balances']['current']
        except Exception as e:
            return {"error": str(e)}, 500
    else:
        # Mock balances for dev/test
        for acc in accounts:
            acc.balance = round(random.uniform(100, 5000), 2)

    db.session.commit()

    return {
        "accounts": [
            {"id": acc.id, "name": acc.name, "balance": float(acc.balance)}
            for acc in accounts
        ]
    }, 200
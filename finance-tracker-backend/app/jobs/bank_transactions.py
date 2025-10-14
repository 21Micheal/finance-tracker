# app/jobs/bank_transactions.py
from datetime import datetime, timedelta
from app import db
from app.models import BankAccount, BankTransaction
from app.services.bank_service import fetch_transactions  # real/mocked fetch

def process_bank_transactions():
    """Scheduled job to pull new transactions for all bank accounts"""
    accounts = BankAccount.query.all()
    start_date = (datetime.utcnow() - timedelta(days=1)).date()
    end_date = datetime.utcnow().date()

    for account in accounts:
        try:
            txs = fetch_transactions(
                account.user_id, 
                account.plaid_account_id, 
                start_date, 
                end_date
            )

            for tx in txs:
                # Create transaction record
                txn = BankTransaction(
                    user_id=account.user_id,
                    account_id=account.id,
                    amount=tx["amount"],
                    description=tx["name"],
                    date=tx["date"],
                    category=tx.get("category")
                )
                db.session.add(txn)

            print(f"✅ Synced {len(txs)} transactions for account {account.id}")
        except Exception as e:
            print(f"⚠️ Failed syncing account {account.id}: {e}")

    db.session.commit()

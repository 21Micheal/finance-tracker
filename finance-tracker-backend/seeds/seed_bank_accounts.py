from app import create_app, db
from app.models import BankItem, BankAccount
from datetime import datetime

app = create_app()

with app.app_context():
    # Get an existing BankItem (the Plaid connection we seeded earlier)
    bank_item = BankItem.query.first()
    if not bank_item:
        print("⚠️ No BankItem found. Please seed BankItem first.")
        exit()

    # Seed accounts
    accounts = [
        BankAccount(
            bank_item_id=bank_item.id,
            account_id="acc-checking-001",
            name="Checking Account",
            type="depository",
            subtype="checking",
            mask="1234",
            balance_available=1200.50,
            balance_current=1250.75,
            currency="USD",
            last_synced=datetime.utcnow(),
        ),
        BankAccount(
            bank_item_id=bank_item.id,
            account_id="acc-savings-001",
            name="Savings Account",
            type="depository",
            subtype="savings",
            mask="5678",
            balance_available=5000.00,
            balance_current=5000.00,
            currency="USD",
            last_synced=datetime.utcnow(),
        ),
        BankAccount(
            bank_item_id=bank_item.id,
            account_id="acc-credit-001",
            name="Credit Card",
            type="credit",
            subtype="credit card",
            mask="9876",
            balance_available=None,  # often null for credit cards
            balance_current=-250.40,
            currency="USD",
            last_synced=datetime.utcnow(),
        ),
    ]

    db.session.bulk_save_objects(accounts)
    db.session.commit()

    print("✅ Seeded test bank accounts")

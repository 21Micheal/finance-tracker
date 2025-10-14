# finance-tracker-backend/app/jobs/bills.py
from datetime import date
from app.models import BillReminder, db

def process_bills():
    """Example job to process due bills daily"""
    today = date.today()
    due_bills = BillReminder.query.filter(
        BillReminder.due_date <= today,
        BillReminder.paid == False
    ).all()


    for bill in due_bills:
        bill.paid = True
        db.session.add(bill)

    db.session.commit()
    print(f"✅ Processed {len(due_bills)} bills")

from apscheduler.schedulers.background import BackgroundScheduler
from datetime import datetime
from .extensions import db
from .models import RecurringTransaction, Transaction, Category, User
from .routes.recurring import calculate_next_date
from .models import BillReminder
from .models import Investment, PortfolioSnapshot, InvestmentSnapshot
from .services.price_service import fetch_current_price
from flask import current_app
from .services.email_service import send_email
from datetime import timedelta
from apscheduler.triggers.cron import CronTrigger
from app.services.investment_service import snapshot_investments, snapshot_investments
from apscheduler.triggers.cron import CronTrigger
from app.services.portfolio_email_service import send_portfolio_summary
from apscheduler.schedulers.background import BackgroundScheduler
from app.jobs.investment_snapshots import snapshot_job
from app.jobs.bills import process_bills
from app.jobs.bank_transactions import process_bank_transactions

#scheduler = BackgroundScheduler()



    
def process_recurring():
    today = datetime.utcnow().date()
    recs = RecurringTransaction.query.filter(RecurringTransaction.next_date <= today).all()

    for r in recs:
        # Skip if past end_date
        if r.end_date and today > r.end_date:
            continue

        # Insert transaction
        tx = Transaction(
            user_id=r.user_id,
            category_id=r.category_id,
            amount=r.amount,
            description=r.description,
            date=r.next_date
        )
        db.session.add(tx)

        # Update next date
        r.next_date = calculate_next_date(r.next_date, r.frequency)

    db.session.commit()


def process_bills():
    today = datetime.utcnow().date()
    upcoming_bills = BillReminder.query.filter(
        BillReminder.due_date >= today,
        BillReminder.due_date <= today + timedelta(days=3)
    ).all()

    print(f"📊 Found {len(upcoming_bills)} bills for reminders")

    for bill in upcoming_bills:
        # Fetch user via relationship or foreign key
        user = getattr(bill, 'user', None)
        if user is None and hasattr(bill, 'user_id'):
            from .models import User
            user = User.query.get(bill.user_id)
        if user is None:
            print(f"⚠️ No user found for bill {getattr(bill, 'title', 'Unknown Bill')}, skipping reminder.")
            continue

        print(f"📧 Sending reminder for {getattr(bill, 'title', 'Unknown Bill')} ({bill.amount}) to {user.email}")
        subject = f"Upcoming Bill Reminder: {getattr(bill, 'title', 'Unknown Bill')}"
        
        print(f"📨 Preparing email to {user.email}, subject={subject}")
        subject = f"Upcoming Bill Reminder: {bill.description}"
        send_email(
            subject,
            [user.email],
            html_template="emails/bill_reminder.html",
            user_email=user.email,
            bill_name=bill.description,   # <- use description
            bill_amount=bill.amount,
            due_date=bill.due_date.strftime("%Y-%m-%d")
        )
        send_email(
            subject,
            [user.email],
            html_template="emails/bill_reminder.html",
            user_email=user.email,
            bill_name=getattr(bill, 'title', 'Unknown Bill'),
            bill_amount=bill.amount,
            due_date=bill.due_date.strftime("%Y-%m-%d")
        )



def process_portfolio_snapshots():
    today = datetime.utcnow().date()
    users = db.session.query(Investment.user_id).distinct().all()

    for (user_id,) in users:
        investments = Investment.query.filter_by(user_id=user_id).all()
        if not investments:
            continue

        total_invested = sum([inv.invested_amount for inv in investments])
        current_value = sum([inv.current_value for inv in investments])
        profit_loss = current_value - total_invested

        # Avoid duplicate snapshot for same day
        existing = PortfolioSnapshot.query.filter_by(user_id=user_id, date=today).first()
        if not existing:
            snapshot = PortfolioSnapshot(
                user_id=user_id,
                date=today,
                total_invested=total_invested,
                current_value=current_value,
                profit_loss=profit_loss
            )
            db.session.add(snapshot)

    db.session.commit()


def process_portfolio_snapshots():
    today = datetime.utcnow().date()
    users = db.session.query(Investment.user_id).distinct().all()

    for (user_id,) in users:
        investments = Investment.query.filter_by(user_id=user_id).all()
        if not investments:
            continue

        total_invested = sum([inv.invested_amount for inv in investments])
        current_value = sum([inv.current_value for inv in investments])
        profit_loss = current_value - total_invested

        # Portfolio snapshot
        existing_portfolio = PortfolioSnapshot.query.filter_by(user_id=user_id, date=today).first()
        if not existing_portfolio:
            snapshot = PortfolioSnapshot(
                user_id=user_id,
                date=today,
                total_invested=total_invested,
                current_value=current_value,
                profit_loss=profit_loss
            )
            db.session.add(snapshot)

        # Individual investment snapshots
        for inv in investments:
            existing_investment = InvestmentSnapshot.query.filter_by(investment_id=inv.id, date=today).first()
            if not existing_investment:
                inv_snapshot = InvestmentSnapshot(
                    investment_id=inv.id,
                    user_id=user_id,
                    date=today,
                    invested_amount=inv.invested_amount,
                    current_value=inv.current_value,
                    profit_loss=inv.profit_loss
                )
                db.session.add(inv_snapshot)

    db.session.commit()


def update_investments_with_live_prices():
    investments = Investment.query.all()
    for inv in investments:
        if not inv.symbol:
            continue

        price = fetch_current_price(inv.symbol)
        if price is not None:
            # For simplicity assume invested_amount = purchase cost of 1 unit
            # Extend later with "quantity" field
            inv.current_value = price
            inv.profit_loss = inv.current_value - inv.invested_amount
    db.session.commit()
scheduler = BackgroundScheduler()

def snapshot_job():
        users = User.query.all()
        for user in users:
            snapshots = snapshot_investments(user.id)
            print(f"📊 {datetime.utcnow()} - Snapshots taken for user {user.id}: {len(snapshots)} investments")


def start_scheduler(app):
    scheduler = BackgroundScheduler()

    scheduler.add_job(with_app_context(app, process_recurring),
                      "interval", hours=24, id="process_bills", replace_existing=True)
    scheduler.add_job(with_app_context(app, process_bills),
                      "interval", hours=24)
    scheduler.add_job(with_app_context(app, process_portfolio_snapshots),
                      "interval", hours=24)
    scheduler.add_job(with_app_context(app, update_investments_with_live_prices),
                      "interval", hours=24)

    scheduler.add_job(with_app_context(app, snapshot_investments),
                      CronTrigger(hour=0, minute=0))
    scheduler.add_job(with_app_context(app, send_portfolio_summary),
                      CronTrigger(day_of_week="sun", hour=8, minute=0))
    scheduler.add_job(with_app_context(app, snapshot_job),
                      "cron", hour=0, minute=0)  # midnight UTC
    scheduler.add_job(with_app_context(app, process_bills),
                      "cron", hour=9)
    scheduler.add_job(with_app_context(app, process_bank_transactions),
                      "interval", hours=24)

    scheduler.start()

def with_app_context(app, func):
    def wrapper(*args, **kwargs):
        with app.app_context():
            return func(*args, **kwargs)
    return wrapper

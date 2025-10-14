from datetime import datetime
from app.extensions import db
from app.models import Investment, InvestmentSnapshot

def snapshot_job():
    """Daily job to capture current portfolio state."""
    print("📊 Running investment snapshot job at", datetime.utcnow())

    investments = Investment.query.all()
    for inv in investments:
        snapshot = InvestmentSnapshot(
            investment_id=inv.id,
            value=inv.units * (inv.current_price or inv.purchase_price),
            recorded_at=datetime.utcnow()
        )
        db.session.add(snapshot)

    db.session.commit()
    print(f"✅ Snapshots created for {len(investments)} investments")

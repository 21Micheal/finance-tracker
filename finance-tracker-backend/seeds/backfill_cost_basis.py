from app import create_app, db
from app.models import Investment

def backfill_cost_basis():
    app = create_app()
    with app.app_context():
        investments = Investment.query.all()
        updated = 0

        for inv in investments:
            if inv.cost_basis is None:
                # Use average_price if available, otherwise fallback to purchase_price
                price = inv.average_price or getattr(inv, "purchase_price", None)

                if price and inv.quantity:
                    inv.cost_basis = float(inv.quantity) * float(price)
                    updated += 1
                    print(f"✅ Backfilled Investment {inv.id} ({inv.symbol}) with cost_basis={inv.cost_basis}")

        db.session.commit()
        print(f"\n🎉 Backfill complete. Updated {updated} investments.")

if __name__ == "__main__":
    backfill_cost_basis()

# app/core/advisor_engine.py
import json
from app.models.transaction import AdvisorContext
from app.models.transaction import FinancialProfile
from app.core.advisor_cache_manager import calculate_change
from app.core.advisor_ai import generate_personalized_advice
from app.core.advisor_context_manager import update_advisor_context
from datetime import datetime

async def get_or_generate_advice(db, user_id):
    # Retrieve last context
    context = db.query(AdvisorContext).filter_by(user_id=user_id).first()

    # Get latest profile
    profile = (
        db.query(FinancialProfile)
        .filter(FinancialProfile.user_id == user_id)
        .order_by(FinancialProfile.month.desc())
        .first()
    )

    if not profile:
        return {"advice": "No profile data found", "source": "none"}

    current_profile = {
        "total_income": profile.total_income,
        "total_expenses": profile.total_expenses,
        "savings": profile.savings,
        "top_category": profile.top_category,
    }

    # Decide if we should regenerate
    should_regenerate = False

    if not context or not context.ai_summary:
        should_regenerate = True
    elif context.is_stale(days=7):
        should_regenerate = True
    elif context.last_profile_snapshot:
        old_profile = json.loads(context.last_profile_snapshot)
        change = calculate_change(old_profile, current_profile)
        if change > 10:
            should_regenerate = True

    # Generate or reuse
    if should_regenerate:
        print("🧠 Regenerating fresh AI advice...")
        new_advice = await generate_personalized_advice(db, user_id)
        update_advisor_context(
            db,
            user_id,
            ai_summary=new_advice,
        )
        context = db.query(AdvisorContext).filter_by(user_id=user_id).first()
        context.last_profile_snapshot = json.dumps(current_profile)
        context.last_generated_at = datetime.utcnow()
        db.commit()
        db.refresh(context)
        return {"advice": new_advice, "source": "AI (fresh)"}
    else:
        print("♻️ Using cached AI summary")
        return {"advice": context.ai_summary, "source": "cache"}

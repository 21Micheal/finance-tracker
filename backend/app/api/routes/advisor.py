from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID
from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.transaction import User
from app.core.advisor_engine import get_or_generate_advice
import logging

# Prefix must be /api/advisor to match common API patterns
router = APIRouter(prefix="/api/advisor", tags=["Advisor"])
logger = logging.getLogger(__name__)

# Matches: GET /api/advisor/{user_id}
@router.get("/{user_id}")
async def get_personal_advice(
    user_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Security Check: Ensure user is requesting their own data
    if current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Forbidden: User ID mismatch")

    result = await get_or_generate_advice(db, user_id)
    return {
        "summary": result.get("advice"),
        "cached": "cache" in result.get("source", ""),
        "source": result.get("source")
    }

# Matches: GET /api/advisor/contextual-insights/{user_id}
@router.get("/contextual-insights/{user_id}")
async def get_contextual_insights(
    user_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    # This calls your engine to force/check for new insights
    result = await get_or_generate_advice(db, user_id)
    return {
        "ai_summary": result.get("advice"),
        "generated_at": "Just now" if "fresh" in result.get("source") else "Cached"
    }

# Matches: POST /api/advisor/goals/{user_id}
@router.post("/goals/{user_id}")
async def update_goals(
    user_id: UUID,
    payload: dict, # Matches { "goals": [...] }
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    
    # Your logic to save goals to the FinancialProfile table
    return {"success": True, "goals": payload.get("goals")}
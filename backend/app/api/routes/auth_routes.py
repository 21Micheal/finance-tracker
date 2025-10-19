from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.transaction import User
from app.models.transaction import Transaction
from app.config import settings
import requests
import logging

router = APIRouter(prefix="/auth", tags=["Auth"])
logger = logging.getLogger(__name__)

SUPABASE_URL = settings.SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY = settings.SUPABASE_SERVICE_KEY


@router.get("/me")
async def get_current_user(
    authorization: str = Header(None),
    db: Session = Depends(get_db)
):
    """
    Verify Supabase token, return backend user record,
    and auto-link any matching M-Pesa data by phone number.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")

    token = authorization.split(" ")[1]

    try:
        # 1️⃣ Verify token with Supabase
        res = requests.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={"Authorization": f"Bearer {token}"}
        )

        if res.status_code != 200:
            logger.warning("❌ Invalid Supabase token: %s", res.text)
            raise HTTPException(status_code=401, detail="Invalid token")

        supabase_user = res.json()
        email = supabase_user.get("email")
        sub = supabase_user.get("id")
        metadata = supabase_user.get("user_metadata", {})
        phone = metadata.get("phone_number") or metadata.get("phone")

        if not email:
            raise HTTPException(status_code=400, detail="Invalid Supabase user payload")

        # 2️⃣ Find or create backend user
        user = db.query(User).filter(User.supabase_id == sub).first()

        if not user:
            user = User(email=email, supabase_id=sub)
            db.add(user)
            db.commit()
            db.refresh(user)
            logger.info("🆕 Created new backend user: %s", email)

        # 3️⃣ Auto-link phone number if found in M-Pesa transactions
        if not user.phone and phone:
            logger.info("🔗 Checking for M-Pesa transactions linked to %s", phone)

            # Check if another user already has this phone
            existing = db.query(User).filter(User.phone == phone).first()
            if existing and existing.id != user.id:
                logger.warning("⚠️ Phone %s already linked to another user", phone)
            else:
                # Assign phone to current user
                user.phone = phone
                db.commit()
                db.refresh(user)

                # Reassign orphaned M-Pesa transactions to this user
                updated = db.query(Transaction).filter(
                    Transaction.user_id.is_(None),
                    Transaction.account_id == phone
                ).update({Transaction.user_id: user.id})
                db.commit()

                logger.info("✅ Linked phone %s and reassigned %d transactions", phone, updated)

        # 4️⃣ Return enriched user info
        return {
            "id": user.id,
            "email": user.email,
            "phone": user.phone,
            "name": user.name,
            "created_at": user.created_at,
            "linked_mpesa": bool(user.phone),
        }

    except Exception as e:
        logger.error("🔥 Error verifying Supabase token: %s", str(e))
        raise HTTPException(status_code=500, detail="Error verifying user")

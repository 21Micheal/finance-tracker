# app/api/deps.py
from fastapi import Depends, HTTPException, Header
from sqlalchemy.orm import Session
from jose import jwt, JWTError
import logging
from datetime import datetime, timezone
from app.db.session import get_db
from app.models.transaction import User
from app.config import settings

logger = logging.getLogger(__name__)

async def get_current_user(
    authorization: str = Header(None),
    db: Session = Depends(get_db)
) -> User:
    """
    Verifies Supabase-issued JWT locally using SUPABASE_JWT_SECRET.
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header missing")
    
    token = authorization.replace("Bearer ", "").strip()
    
    # Log token for debugging (remove in production)
    logger.debug(f"🔑 Received token: {token[:20]}...")
    
    try:
        # ✅ Decode token using your Supabase JWT secret
        # NOTE: Supabase uses HS256 algorithm
        payload = jwt.decode(
            token, 
            settings.SUPABASE_JWT_SECRET, 
            algorithms=["HS256"],
            options={
                "verify_signature": True,
                "verify_exp": True,
                "verify_aud": False  # Supabase tokens might not have 'aud'
            }
        )
        
        logger.debug(f"✅ Decoded payload: {payload}")
        
        sub = payload.get("sub")
        email = payload.get("email")
        phone = payload.get("phone_number") or payload.get("phone")  # Try both keys
        exp = payload.get("exp")
        
        if not sub:
            logger.error("❌ Token payload missing 'sub' field")
            raise HTTPException(status_code=401, detail="Invalid token payload: missing user ID")
        
        # Check expiration manually (redundant but good for logging)
        if exp and datetime.fromtimestamp(exp, timezone.utc) < datetime.now(timezone.utc):
            logger.error("❌ Token expired at %s", datetime.fromtimestamp(exp, timezone.utc))
            raise HTTPException(status_code=401, detail="Token expired")
        
        # Find or create local user
        user = db.query(User).filter(User.id == sub).first()
        if not user:
            logger.info(f"👤 Creating new user: {email}")
            user = User(id=sub, email=email, phone=phone)
            db.add(user)
            db.commit()
            db.refresh(user)
        else:
            # Update phone if it changed
            if phone and user.phone != phone:
                user.phone = phone
                db.commit()
        
        return user
    
    except jwt.ExpiredSignatureError:
        logger.error("❌ Token has expired")
        raise HTTPException(status_code=401, detail="Token expired")
    
    except jwt.JWTClaimsError as e:
        logger.error("❌ JWT claims error: %s", str(e))
        raise HTTPException(status_code=401, detail=f"Invalid token claims: {str(e)}")
    
    except JWTError as e:
        logger.error("❌ JWT decode error: %s", str(e))
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")
    
    except Exception as e:
        logger.error("❌ Unexpected error verifying user: %s", str(e), exc_info=True)
        raise HTTPException(status_code=401, detail="Could not verify user")
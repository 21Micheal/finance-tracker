from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
import httpx
from app.config import settings
from app.db.session import get_db
from app.models.transaction import Transaction, User
from app.schemas.transaction_schema import TransactionResponse
from datetime import datetime
import logging
import json
from app.api.deps import get_current_user 
from app.core.supabase_client import get_supabase_admin


# Configure logging properly
logger = logging.getLogger(__name__)

# Create a router with prefix and tags
router = APIRouter(tags=["Transactions"])

@router.post("/mpesa/callback")
async def mpesa_callback(request: Request, db: Session = Depends(get_db)):
    """
    Receive and store M-Pesa payment data, linking it to the correct user if possible.
    """
    try:
        data = await request.json()
        logger.info("💰 M-Pesa Callback: %s", json.dumps(data, default=str))

        trans_id = data.get("TransID")
        amount = float(data.get("TransAmount", 0))
        trans_time = data.get("TransTime", datetime.utcnow().strftime("%Y%m%d%H%M%S"))
        phone_number = data.get("MSISDN", "").strip()
        name = data.get("FirstName", "M-Pesa User")
        trans_type = data.get("TransactionType", "Pay Bill")

        # Parse timestamp safely
        try:
            timestamp = datetime.strptime(trans_time, "%Y%m%d%H%M%S")
        except Exception:
            timestamp = datetime.utcnow()

        # Avoid duplicates
        existing = db.query(Transaction).filter(Transaction.description.like(f"%{trans_id}%")).first()
        if existing:
            logger.info("⚠️ Duplicate M-Pesa transaction ignored: %s", trans_id)
            return {"ResultCode": 0, "ResultDesc": "Duplicate ignored"}

        # Try to link with a user by phone
        user = db.query(User).filter(User.phone == phone_number).first()
        user_id = user.id if user else None

        # Create transaction
        new_txn = Transaction(
            name=name,
            amount=amount,
            date=timestamp.date(),
            category="M-Pesa",
            account_id=phone_number,
            transaction_type=trans_type,
            type="income" if amount > 0 else "expense",
            source="mpesa",
            description=f"M-Pesa {trans_type} (ID: {trans_id})",
            user_id=user_id
        )

        db.add(new_txn)
        db.commit()
        db.refresh(new_txn)

        logger.info("✅ Saved M-Pesa transaction for %s (User: %s)", phone_number, user.email if user else "None")

        return {"ResultCode": 0, "ResultDesc": "Transaction received successfully"}

    except Exception as e:
        logger.error("❌ M-Pesa callback error: %s", str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/mpesa/transactions", response_model=list[TransactionResponse])
async def get_mpesa_transactions(db: Session = Depends(get_db)):
    """
    Fetch all M-Pesa transactions.
    """
    try:
        transactions = db.query(Transaction).filter(
            Transaction.source == "mpesa"
        ).order_by(Transaction.date.desc()).all()
        
        logger.info("📱 Fetched %d M-Pesa transactions", len(transactions))
        return transactions
        
    except Exception as e:
        logger.error("🔥 Error fetching M-Pesa transactions: %s", str(e))
        raise HTTPException(
            status_code=500, 
            detail=f"Error fetching M-Pesa transactions: {str(e)}"
        )


@router.get("/mpesa/transactions/{transaction_id}", response_model=TransactionResponse)
async def get_transaction(transaction_id: int, db: Session = Depends(get_db)):
    """
    Fetch a single M-Pesa transaction by its ID.
    """
    try:
        transaction = db.query(Transaction).filter(
            Transaction.id == transaction_id,
            Transaction.source == "mpesa"
        ).first()
        
        if not transaction:
            logger.warning("⚠️ Transaction not found with ID: %d", transaction_id)
            raise HTTPException(status_code=404, detail="Transaction not found")
        
        logger.info("✅ Found transaction with ID: %d", transaction_id)
        return transaction
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("❌ Error fetching transaction %d: %s", transaction_id, str(e))
        raise HTTPException(status_code=500, detail=str(e))


# --- 🔄 NEW ENDPOINT: Sync and auto-link M-Pesa transactions to users ---
@router.post("/mpesa/sync")
async def sync_mpesa_transactions(data: list[dict], db: Session = Depends(get_db)):
    """
    Syncs incoming M-Pesa transactions and links them to users by phone number.
    """
    try:
        synced_count = 0

        for tx in data:
            phone = tx.get("phone_number") or tx.get("mpesa_phone")
            user_id = None

            if phone:
                normalized_phone = (
                    phone.replace(" ", "")
                    .replace("-", "")
                    .replace("+254", "0")
                    .strip()
                )
                user = (
                    db.query(User)
                    .filter(
                        (User.phone == phone) | (User.phone == normalized_phone)
                    )
                    .first()
                )
                if user:
                    user_id = user.id

            new_tx = Transaction(
                user_id=user_id,
                amount=float(tx.get("amount", 0)),
                type=tx.get("transaction_type", "expense").lower(),
                category=tx.get("category", "M-Pesa"),
                description=tx.get("description", ""),
                date=tx.get("date") or datetime.utcnow(),
                source="mpesa",
                phone=phone,
            )

            db.add(new_tx)
            synced_count += 1

        db.commit()
        return {"message": f"✅ Synced {synced_count} M-Pesa transactions successfully"}

    except Exception as e:
        logger.error("🔥 M-Pesa sync error: %s", str(e))
        raise HTTPException(status_code=500, detail=f"Error syncing M-Pesa transactions: {e}")

@router.post("/auth/sync_from_supabase")
async def sync_from_supabase(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Sync user data (like phone number) from Supabase metadata into local DB.
    """
    supabase = get_supabase_admin()
    try:
        user = supabase.auth.admin.get_user_by_id(current_user.id)
        metadata = user.user.get("user_metadata", {})
        phone = metadata.get("phone_number")

        if phone and not current_user.phone:
            current_user.phone = phone
            db.commit()
            db.refresh(current_user)
            logger.info("🔁 Synced phone %s from Supabase for %s", phone, current_user.email)
            return {"message": "Synced from Supabase", "phone": phone}

        return {"message": "No sync needed or already up to date."}

    except Exception as e:
        logger.error("❌ Failed to sync from Supabase: %s", str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/auth/link_phone")
async def link_phone(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Link a phone number to the user's account, update Supabase metadata,
    and automatically sync M-Pesa transactions.
    """
    phone = data.get("phone")
    if not phone:
        raise HTTPException(status_code=400, detail="Phone number required")
    
    # ✅ Ensure phone number is unique
    existing = db.query(User).filter(User.phone == phone).first()
    if existing and existing.id != current_user.id:
        raise HTTPException(status_code=400, detail="Phone number already linked to another account")
    
    # ✅ Update local user record
    current_user.phone = phone
    db.commit()
    db.refresh(current_user)
    
    # ✅ Update Supabase metadata using ADMIN client
    try:
        supabase_admin = get_supabase_admin()
        
        # Update user metadata in Supabase
        response = supabase_admin.auth.admin.update_user_by_id(
            current_user.id,
            {"user_metadata": {"phone_number": phone}}
        )
        
        logger.info(f"📱 Supabase metadata updated for user {current_user.id} (email: {current_user.email})")
        
    except Exception as e:
        logger.warning(f"⚠️ Could not update Supabase metadata: {str(e)}")
        # Don't fail the entire request if Supabase update fails
        # The phone is still linked in your local database
    
    # ✅ Reassign transactions linked only by phone
    updated = db.query(Transaction).filter(
        Transaction.user_id.is_(None),
        Transaction.account_id == phone
    ).update({"user_id": current_user.id})
    db.commit()
    
    # ✅ Sync any unassigned M-Pesa transactions from API
    added_count = 0
    try:
        logger.info(f"🔄 Syncing M-Pesa transactions for {phone}...")
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{settings.API_BASE_URL}/api/mpesa/transactions")
            
            if response.status_code == 200:
                mpesa_txns = response.json()
                
                for txn in mpesa_txns:
                    if txn.get("account_id") == phone:
                        # Check if transaction already exists
                        exists = db.query(Transaction).filter(
                            Transaction.amount == txn["amount"],
                            Transaction.date == txn["date"],
                            Transaction.account_id == phone
                        ).first()
                        
                        if not exists:
                            new_txn = Transaction(
                                name=txn.get("name", "M-Pesa User"),
                                amount=txn["amount"],
                                date=datetime.strptime(txn["date"], "%Y-%m-%d").date(),
                                category=txn.get("category", "M-Pesa"),
                                account_id=phone,
                                transaction_type=txn.get("transaction_type", "Pay Bill"),
                                type=txn.get("type", "income"),
                                source="mpesa",
                                description=txn.get("description", ""),
                                user_id=current_user.id
                            )
                            db.add(new_txn)
                            added_count += 1
                
                db.commit()
                logger.info(f"✅ Synced {added_count} new M-Pesa transactions for {phone}")
            else:
                logger.warning(f"⚠️ M-Pesa sync failed: {response.status_code} - {response.text}")
                
    except Exception as e:
        logger.error(f"❌ Error syncing M-Pesa transactions: {str(e)}")
        # Don't fail the entire request if M-Pesa sync fails
    
    return {
        "message": f"Phone linked successfully. {updated} existing transactions linked and {added_count} new transactions synced.",
        "phone": phone,
        "user_id": current_user.id
    }


@router.post("/auth/sync_on_login")
async def sync_on_login(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Called after Supabase login.
    Auto-syncs user's phone number from Supabase metadata
    and links any existing M-Pesa transactions.
    """
    try:
        phone = current_user.phone
        if not phone:
            logger.warning("⚠️ No phone number found for user %s", current_user.email)
            return {"message": "No phone number in Supabase metadata. Skipping sync."}

        logger.info("🔄 Syncing M-Pesa transactions for user %s (%s)", current_user.email, phone)

        # Reassign any M-Pesa transactions linked only by phone
        updated = db.query(Transaction).filter(
            Transaction.user_id.is_(None),
            Transaction.account_id == phone
        ).update({Transaction.user_id: current_user.id})

        db.commit()

        # Optionally, pull any remote M-Pesa transactions and add if missing
        async with httpx.AsyncClient() as client:
            response = await client.get("http://localhost:8000/api/mpesa/transactions")

            if response.status_code == 200:
                mpesa_txns = response.json()
                added_count = 0
                for txn in mpesa_txns:
                    if txn.get("account_id") == phone:
                        exists = db.query(Transaction).filter(
                            Transaction.amount == txn["amount"],
                            Transaction.date == txn["date"],
                            Transaction.account_id == phone
                        ).first()
                        if not exists:
                            new_txn = Transaction(
                                name=txn.get("name", "M-Pesa User"),
                                amount=txn["amount"],
                                date=datetime.strptime(txn["date"], "%Y-%m-%d").date(),
                                category=txn.get("category", "M-Pesa"),
                                account_id=phone,
                                transaction_type=txn.get("transaction_type", "Pay Bill"),
                                type=txn.get("type", "income"),
                                source="mpesa",
                                description=txn.get("description", "")
                            )
                            new_txn.user_id = current_user.id
                            db.add(new_txn)
                            added_count += 1

                db.commit()
                logger.info("✅ Added %d new M-Pesa transactions for %s", added_count, phone)
            else:
                logger.warning("⚠️ Failed to fetch remote M-Pesa transactions: %s", response.text)

        return {
            "message": f"✅ Sync complete: {updated} local transactions linked.",
            "phone": phone,
            "user_id": current_user.id
        }

    except Exception as e:
        logger.error("❌ Error in /auth/sync_on_login: %s", str(e))
        raise HTTPException(status_code=500, detail=str(e))






# --- OLD PLAID TRANSACTION ROUTES (COMMENTED OUT) ---

# from fastapi import APIRouter, Depends, HTTPException
# from sqlalchemy.orm import Session
# from app.services.plaid_service import get_plaid_client
# from app.services.bank_service import create_transactions
# from app.db.session import get_db
# from app.models.bank_models import BankItem, BankTransaction
# from app.schemas.transaction_schema import TransactionResponse
# from plaid.model.transactions_sync_request import TransactionsSyncRequest

# router = APIRouter(prefix="/transactions", tags=["Transactions"])

# @router.post("/sync")
# def sync_transactions(user_id: str, db: Session = Depends(get_db)):
#     """
#     Fetches latest transactions from Plaid and stores them in the DB.
#     """
#     plaid_client = get_plaid_client()

#     # Retrieve user's bank item (access_token)
#     bank_item = db.query(BankItem).filter(BankItem.user_id == user_id).first()
#     if not bank_item:
#         raise HTTPException(status_code=404, detail="No linked bank account found")

#     request = TransactionsSyncRequest(access_token=bank_item.access_token)

#     try:
#         response = plaid_client.transactions_sync(request)
#         added_transactions = response["added"]

#         if added_transactions:
#             create_transactions(db, bank_item.id, added_transactions)

#         return {"status": "success", "fetched": len(added_transactions)}

#     except Exception as e:
#         raise HTTPException(status_code=400, detail=str(e))


# @router.get("/", response_model=list[TransactionResponse])
# def get_transactions(user_id: str, db: Session = Depends(get_db)):
#     """
#     Returns transactions stored in the DB for a given user.
#     """
#     transactions = (
#         db.query(BankTransaction)
#         .join(BankItem)
#         .filter(BankItem.user_id == user_id)
#         .order_by(BankTransaction.date.desc())
#         .all()
#     )

#     if not transactions:
#         return []

#     return [
#         TransactionResponse(
#             id=t.id,
#             name=t.name,
#             amount=t.amount,
#             date=t.date,
#             category=t.category,
#             account_id=t.account_id,
#         )
#         for t in transactions
#     ]

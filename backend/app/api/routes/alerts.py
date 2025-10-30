from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.transaction import Alert
from app.utils.alerts import generate_alerts_for_user

router = APIRouter(prefix="/api/alerts", tags=["Alerts"])

@router.post("/generate/{user_id}")
def generate_alerts(user_id: str, db: Session = Depends(get_db)):
    alerts = generate_alerts_for_user(user_id, db)
    return {"message": f"{len(alerts)} alerts generated.", "alerts": alerts}

@router.get("/{user_id}")
def get_alerts(user_id: str, db: Session = Depends(get_db)):
    alerts = db.query(Alert).filter(Alert.user_id == user_id).order_by(Alert.created_at.desc()).all()
    return alerts

@router.post("/{alert_id}/mark-read")
def mark_alert_read(alert_id: int, db: Session = Depends(get_db)):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.is_read = True
    db.commit()
    return {"message": "Alert marked as read"}

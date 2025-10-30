from sqlalchemy.orm import Session
from sqlalchemy import and_
from uuid import UUID
from app.models.transaction import Goal
from app.schemas.goal_schema import GoalCreate, GoalUpdate
from typing import List, Optional
from datetime import date

def get_goals_by_user(db: Session, user_id: UUID) -> List[Goal]:
    return db.query(Goal).filter(Goal.user_id == user_id).order_by(Goal.created_at.desc()).all()

def get_goal_by_id(db: Session, goal_id: UUID, user_id: UUID) -> Optional[Goal]:
    return db.query(Goal).filter(and_(Goal.id == goal_id, Goal.user_id == user_id)).first()

def create_goal(db: Session, goal: GoalCreate, user_id: UUID) -> Goal:
    db_goal = Goal(
        user_id=user_id,
        name=goal.name,
        target_amount=goal.target_amount,
        current_amount=0.0,
        deadline=goal.deadline,
        category=goal.category,
        color=goal.color,
        icon=goal.icon,
        is_active=goal.is_active
    )
    db.add(db_goal)
    db.commit()
    db.refresh(db_goal)
    return db_goal

def update_goal(db: Session, goal_id: UUID, user_id: UUID, goal_update: GoalUpdate) -> Optional[Goal]:
    db_goal = get_goal_by_id(db, goal_id, user_id)
    if not db_goal:
        return None
    
    update_data = goal_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_goal, field, value)
    
    db.commit()
    db.refresh(db_goal)
    return db_goal

def delete_goal(db: Session, goal_id: UUID, user_id: UUID) -> bool:
    db_goal = get_goal_by_id(db, goal_id, user_id)
    if not db_goal:
        return False
    
    db.delete(db_goal)
    db.commit()
    return True

def update_goal_progress(db: Session, goal_id: UUID, user_id: UUID, amount: float) -> Optional[Goal]:
    db_goal = get_goal_by_id(db, goal_id, user_id)
    if not db_goal:
        return None
    
    # Ensure we don't exceed target amount
    new_amount = min(db_goal.current_amount + amount, db_goal.target_amount)
    db_goal.current_amount = new_amount
    
    # Auto-complete if target reached
    if new_amount >= db_goal.target_amount:
        db_goal.is_active = False
    
    db.commit()
    db.refresh(db_goal)
    return db_goal

def get_goals_summary(db: Session, user_id: UUID):
    goals = get_goals_by_user(db, user_id)
    
    total_goals = len(goals)
    active_goals = len([g for g in goals if g.is_active])
    completed_goals = len([g for g in goals if not g.is_active])
    total_target = sum(g.target_amount for g in goals)
    total_saved = sum(g.current_amount for g in goals)
    overall_progress = (total_saved / total_target * 100) if total_target > 0 else 0
    
    return {
        "total_goals": total_goals,
        "active_goals": active_goals,
        "completed_goals": completed_goals,
        "total_target": total_target,
        "total_saved": total_saved,
        "overall_progress": overall_progress
    }

def calculate_goal_progress(db: Session, goal_id: UUID, user_id: UUID):
    goal = get_goal_by_id(db, goal_id, user_id)
    if not goal:
        return None
    
    progress_percentage = (goal.current_amount / goal.target_amount * 100) if goal.target_amount > 0 else 0
    amount_remaining = goal.target_amount - goal.current_amount
    is_completed = goal.current_amount >= goal.target_amount
    
    days_remaining = None
    if goal.deadline:
        today = date.today()
        days_remaining = (goal.deadline - today).days
        days_remaining = max(0, days_remaining)  # Don't show negative days
    
    return {
        "goal_id": goal_id,
        "progress_percentage": progress_percentage,
        "amount_remaining": amount_remaining,
        "days_remaining": days_remaining,
        "is_completed": is_completed
    }
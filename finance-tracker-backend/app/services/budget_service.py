from app.models import Budget, BankTransaction, db, BudgetAlert
#from app.utils.budget_alerts import check_budget_alert  # if you keep helper separate

def get_budget_alerts_for_user(user_id):
    budgets = Budget.query.filter_by(user_id=user_id).all()
    alerts = []

    for budget in budgets:
        query = BankTransaction.query.filter_by(user_id=user_id)

        if budget.category_id:
            query = query.filter(BankTransaction.category_id == budget.category_id)

        if budget.start_date:
            query = query.filter(BankTransaction.date >= budget.start_date)
        if budget.end_date:
            query = query.filter(BankTransaction.date <= budget.end_date)

        spent = query.with_entities(db.func.sum(BankTransaction.amount)).scalar() or 0

        budget_alerts = check_budget_alert(budget, spent)
        if budget_alerts:
            alerts.extend(budget_alerts)

    return alerts


def check_budget_alert(budget, spent):
    if budget.amount == 0:
        return None

    spent_ratio = float(spent) / float(budget.amount)
    alerts = []

    if spent_ratio >= budget.alert_threshold and spent_ratio < 1:
        alerts.append({
            "budget_id": budget.id,
            "type": "warning",
            "message": f"Budget {budget.amount} nearing limit ({round(spent_ratio*100, 2)}%)"
        })

    if spent_ratio >= 1 and budget.notify_exceeded:
        alerts.append({
            "budget_id": budget.id,
            "type": "danger",
            "message": f"Budget exceeded ({round(spent_ratio*100, 2)}%)"
        })

    return alerts



def save_budget_alerts(user_id, alerts):
    for alert in alerts:
        new_alert = BudgetAlert(
            user_id=user_id,
            budget_id=alert["budget_id"],
            message=alert["message"],
            severity=alert["severity"]
        )
        db.session.add(new_alert)
    db.session.commit()

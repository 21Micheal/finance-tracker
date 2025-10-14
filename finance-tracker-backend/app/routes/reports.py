from flask import Blueprint, request, jsonify, Response
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..extensions import db
from ..models import Transaction, Category, Budget,Report, BankTransaction
from app.services.investment_service import backfill_investment_transactions
from app.services.bank_service import backfill_bank_transactions
from datetime import datetime
from sqlalchemy import func
import csv
import io
from fpdf import FPDF

report_bp = Blueprint("reports", __name__)

# Utility: parse dates safely
def parse_date(date_str, default=None):
    try:
        return datetime.strptime(date_str, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return default


# 1. Monthly Summary
@report_bp.route("/monthly", methods=["GET"])
@jwt_required()
def monthly_report():
    user_id = int(get_jwt_identity())
    backfill_investment_transactions(user_id)
    backfill_bank_transactions(user_id)
    backfill_investment_transactions(user_id)

    year = request.args.get("year", datetime.utcnow().year, type=int)
    month = request.args.get("month", datetime.utcnow().month, type=int)

    start_date = datetime(year, month, 1)
    if month == 12:
        end_date = datetime(year + 1, 1, 1)
    else:
        end_date = datetime(year, month + 1, 1)

    results = (
        db.session.query(
            Category.type,
            func.sum(Transaction.amount).label("total")
        )
        .join(Category, Transaction.category_id == Category.id)
        .filter(
            Transaction.user_id == user_id,
            Transaction.date >= start_date,
            Transaction.date < end_date
        )
        .group_by(Category.type)
        .all()
    )

    summary = { "income": 0, "expense": 0 }
    for r in results:
        summary[r.type] = float(r.total or 0)

    summary["savings"] = summary["income"] - summary["expense"]

    return jsonify({
        "year": year,
        "month": month,
        "summary": summary
    }), 200


# 2. Yearly Summary
@report_bp.route("/yearly", methods=["GET"])
@jwt_required()
def yearly_report():
    user_id = int(get_jwt_identity())

    year = request.args.get("year", datetime.utcnow().year, type=int)
    start_date = datetime(year, 1, 1)
    end_date = datetime(year + 1, 1, 1)

    results = (
        db.session.query(
            Category.type,
            func.sum(Transaction.amount).label("total")
        )
        .join(Category, Transaction.category_id == Category.id)
        .filter(
            Transaction.user_id == user_id,
            Transaction.date >= start_date,
            Transaction.date < end_date
        )
        .group_by(Category.type)
        .all()
    )

    summary = { "income": 0, "expense": 0 }
    for r in results:
        summary[r.type] = float(r.total or 0)

    summary["savings"] = summary["income"] - summary["expense"]

    return jsonify({
        "year": year,
        "summary": summary
    }), 200


# 3. Category Breakdown (Pie Chart Data)
@report_bp.route("/categories", methods=["GET"])
@jwt_required()
def category_breakdown():
    user_id = int(get_jwt_identity())

    start_date = parse_date(request.args.get("start_date"), datetime(datetime.utcnow().year, 1, 1).date())
    end_date = parse_date(request.args.get("end_date"), datetime.utcnow().date())

    results = (
        db.session.query(
            Category.name,
            Category.type,
            func.sum(Transaction.amount).label("total")
        )
        .join(Category, Transaction.category_id == Category.id)
        .filter(
            Transaction.user_id == user_id,
            Transaction.date >= start_date,
            Transaction.date <= end_date
        )
        .group_by(Category.id)
        .all()
    )

    breakdown = [
        {"category": r.name, "type": r.type, "total": float(r.total or 0)}
        for r in results
    ]

    return jsonify({
        "start_date": str(start_date),
        "end_date": str(end_date),
        "breakdown": breakdown
    }), 200

# 4. Budget vs Actual
@report_bp.route("/budget-vs-actual", methods=["GET"])
@jwt_required()
def budget_vs_actual():
    user_id = int(get_jwt_identity())

    # Optional filters: year, month
    year = request.args.get("year", datetime.utcnow().year, type=int)
    month = request.args.get("month", None, type=int)

    if month:
        start_date = datetime(year, month, 1)
        if month == 12:
            end_date = datetime(year + 1, 1, 1)
        else:
            end_date = datetime(year, month + 1, 1)
    else:
        start_date = datetime(year, 1, 1)
        end_date = datetime(year + 1, 1, 1)

    # Get all budgets for user
    budgets = Budget.query.filter_by(user_id=user_id).all()

    report = []

    for budget in budgets:
        # Calculate actual spending for category
        actual = (
            db.session.query(func.sum(Transaction.amount))
            .filter(
                Transaction.user_id == user_id,
                Transaction.category_id == budget.category_id,
                Transaction.date >= start_date,
                Transaction.date < end_date
            )
            .scalar()
        ) or 0.0

        category = Category.query.get(budget.category_id)

        progress = 0
        if budget.amount > 0:
            progress = round((actual / budget.amount) * 100, 2)

        report.append({
            "category": category.name if category else "Unknown",
            "period": budget.period,
            "budgeted": float(budget.amount),
            "actual": float(actual),
            "remaining": float(budget.amount) - float(actual),
            "status": "over" if actual > budget.amount else "within",
            "progress_percent": progress  # NEW
        })

    return jsonify({
        "year": year,
        "month": month,
        "budgets": report
    }), 200


@report_bp.route("/", methods=["GET"])
@jwt_required()
def list_reports():
    user_id = get_jwt_identity()
    reports = Report.query.filter_by(user_id=user_id).order_by(Report.created_at.desc()).all()

    return jsonify([{
        "id": r.id,
        "name": r.name,
        "period_start": r.period_start.isoformat(),
        "period_end": r.period_end.isoformat(),
        "created_at": r.created_at.isoformat()
    } for r in reports])


@report_bp.route("/", methods=["POST"])
@jwt_required()
def generate_report():
    user_id = get_jwt_identity()
    body = request.json

    period_start = datetime.fromisoformat(body.get("period_start"))
    period_end = datetime.fromisoformat(body.get("period_end"))

    txns = BankTransaction.query.filter(
        BankTransaction.user_id == user_id,
        BankTransaction.date >= period_start,
        BankTransaction.date <= period_end
    ).all()

    income = sum([float(t.amount) for t in txns if t.amount > 0])
    expense = sum([float(t.amount) for t in txns if t.amount < 0])
    net = income + expense

    data = {
        "income": round(income, 2),
        "expense": round(abs(expense), 2),
        "net": round(net, 2),
        "total_transactions": len(txns),
    }

    report = Report(
        user_id=user_id,
        name=body.get("name", f"Report {period_start:%Y-%m-%d} → {period_end:%Y-%m-%d}"),
        period_start=period_start,
        period_end=period_end,
        data=data
    )

    db.session.add(report)
    db.session.commit()

    return jsonify({
        "id": report.id,
        "name": report.name,
        "data": report.data
    })


@report_bp.route("/<int:report_id>", methods=["GET"])
@jwt_required()
def get_report(report_id):
    user_id = get_jwt_identity()
    report = Report.query.filter_by(id=report_id, user_id=user_id).first_or_404()

    return jsonify({
        "id": report.id,
        "name": report.name,
        "period_start": report.period_start.isoformat(),
        "period_end": report.period_end.isoformat(),
        "data": report.data,
        "created_at": report.created_at.isoformat()
    })


@report_bp.route("/<int:report_id>/export", methods=["GET"])
@jwt_required()
def export_report(report_id):
    user_id = get_jwt_identity()
    fmt = request.args.get("format", "csv").lower()

    report = Report.query.filter_by(id=report_id, user_id=user_id).first()
    if not report:
        return jsonify({"error": "Report not found"}), 404

    data = report.data or {}

    # ---- CSV Export ----
    if fmt == "csv":
        output = io.StringIO()
        writer = csv.writer(output)

        # Write header
        if isinstance(data, dict):
            writer.writerow(["Metric", "Value"])
            for k, v in data.items():
                writer.writerow([k, v])
        elif isinstance(data, list):
            if len(data) > 0 and isinstance(data[0], dict):
                writer.writerow(data[0].keys())  # headers
                for row in data:
                    writer.writerow(row.values())
            else:
                writer.writerow(["Values"])
                for v in data:
                    writer.writerow([v])

        output.seek(0)
        return Response(
            output.getvalue(),
            mimetype="text/csv",
            headers={"Content-Disposition": f"attachment; filename=report_{report.id}.csv"},
        )

    # ---- PDF Export ----
    elif fmt == "pdf":
        pdf = FPDF()
        pdf.add_page()
        pdf.set_font("Arial", size=12)

        pdf.cell(200, 10, txt=f"Report {report.id}", ln=True, align="C")
        pdf.ln(10)

        if isinstance(data, dict):
            for k, v in data.items():
                pdf.cell(200, 10, txt=f"{k}: {v}", ln=True)
        elif isinstance(data, list):
            for row in data:
                pdf.cell(200, 10, txt=str(row), ln=True)

        pdf_output = io.BytesIO()
        pdf.output(pdf_output)
        pdf_output.seek(0)

        return Response(
            pdf_output.read(),
            mimetype="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=report_{report.id}.pdf"},
        )

    else:
        return jsonify({"error": "Invalid format, use csv or pdf"}), 400

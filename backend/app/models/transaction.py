from sqlalchemy import Column, Integer, String, Float, Date, Text, DateTime, func, UniqueConstraint, ForeignKey
from app.db.session import Base
from sqlalchemy.orm import relationship


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(255), nullable=True)
    amount = Column(Float, nullable=False)
    date = Column(Date, nullable=False)
    category = Column(String(100), nullable=True)
    description = Column(Text, nullable=True)
    account_id = Column(String(100), nullable=True)
    account_name = Column(String(255), nullable=True)
    institution_name = Column(String(255), nullable=True)
    account_type = Column(String(50), nullable=True)
    balance = Column(Float, nullable=True)
    transaction_type = Column(String(100), nullable=True)
    reference = Column(String(100), nullable=True)
    phone_number = Column(String(20), nullable=True)
    mpesa_receipt = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())
    source = Column(String, nullable=True, default="manual")
    type = Column(String, nullable=False, default="expense")
    currency = Column(String, default="KES")
    phone = Column(String, nullable=True)  # Added for M-Pesa linkage

    # ✅ Proper foreign key relationship
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    user = relationship("User", back_populates="transactions")

    def __repr__(self):
        return f"<Transaction(id={self.id}, name='{self.name}', amount={self.amount}, date={self.date}, category='{self.category}')>"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, nullable=True)
    phone = Column(String, unique=True, nullable=True)
    name = Column(String, nullable=True)
    hashed_password = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    transactions = relationship("Transaction", back_populates="user")

    __table_args__ = (UniqueConstraint("email", "phone", name="uix_user_email_phone"),)
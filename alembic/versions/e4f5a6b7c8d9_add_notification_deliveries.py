"""add notification deliveries

Revision ID: e4f5a6b7c8d9
Revises: a3b4c5d6e7f8
Create Date: 2026-05-28 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e4f5a6b7c8d9"
down_revision: Union[str, Sequence[str], None] = "a3b4c5d6e7f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "notification_deliveries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("delivery_group_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("alert_id", sa.Integer(), nullable=True),
        sa.Column("product_id", sa.Integer(), nullable=True),
        sa.Column("event_type", sa.String(length=32), nullable=False),
        sa.Column("channel", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("reason", sa.String(length=64), nullable=True),
        sa.Column("error_message", sa.String(length=512), nullable=True),
        sa.Column("product_title", sa.String(length=255), nullable=True),
        sa.Column("store", sa.String(length=100), nullable=True),
        sa.Column("old_price", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("new_price", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("target_price", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("product_url", sa.String(length=512), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["alert_id"], ["alerts.id"]),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_notification_deliveries_alert_id",
        "notification_deliveries",
        ["alert_id"],
        unique=False,
    )
    op.create_index(
        "ix_notification_deliveries_channel",
        "notification_deliveries",
        ["channel"],
        unique=False,
    )
    op.create_index(
        "ix_notification_deliveries_created_at",
        "notification_deliveries",
        ["created_at"],
        unique=False,
    )
    op.create_index(
        "ix_notification_deliveries_delivery_group_id",
        "notification_deliveries",
        ["delivery_group_id"],
        unique=False,
    )
    op.create_index(
        "ix_notification_deliveries_event_type",
        "notification_deliveries",
        ["event_type"],
        unique=False,
    )
    op.create_index(
        "ix_notification_deliveries_product_id",
        "notification_deliveries",
        ["product_id"],
        unique=False,
    )
    op.create_index(
        "ix_notification_deliveries_status",
        "notification_deliveries",
        ["status"],
        unique=False,
    )
    op.create_index(
        "ix_notification_deliveries_user_id",
        "notification_deliveries",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_notification_deliveries_user_id", table_name="notification_deliveries")
    op.drop_index("ix_notification_deliveries_status", table_name="notification_deliveries")
    op.drop_index("ix_notification_deliveries_product_id", table_name="notification_deliveries")
    op.drop_index("ix_notification_deliveries_event_type", table_name="notification_deliveries")
    op.drop_index(
        "ix_notification_deliveries_delivery_group_id",
        table_name="notification_deliveries",
    )
    op.drop_index("ix_notification_deliveries_created_at", table_name="notification_deliveries")
    op.drop_index("ix_notification_deliveries_channel", table_name="notification_deliveries")
    op.drop_index("ix_notification_deliveries_alert_id", table_name="notification_deliveries")
    op.drop_table("notification_deliveries")

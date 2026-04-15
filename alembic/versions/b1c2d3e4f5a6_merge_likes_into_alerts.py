"""merge product_likes into alerts

Revision ID: b1c2d3e4f5a6
Revises: a9b0c1d2e3f4
Create Date: 2026-04-15 14:00:00.000000

Unifies the "liked products" and "price alerts" concepts into a single
``alerts`` table. A row with ``target_price IS NULL`` represents a "like"
(notify on any price drop); a row with ``target_price`` set represents a
threshold alert (notify when price drops below that value).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b1c2d3e4f5a6"
down_revision: Union[str, Sequence[str], None] = "a9b0c1d2e3f4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "alerts",
        "target_price",
        existing_type=sa.Numeric(10, 2),
        nullable=True,
    )

    op.execute(
        """
        INSERT INTO alerts (user_id, product_id, target_price, currency, is_active, created_at)
        SELECT pl.user_id, pl.product_id, NULL, 'PLN', TRUE, pl.created_at
        FROM product_likes pl
        WHERE NOT EXISTS (
            SELECT 1 FROM alerts a
            WHERE a.user_id = pl.user_id
              AND a.product_id = pl.product_id
              AND a.is_active = TRUE
        )
        """
    )

    op.drop_index("ix_product_likes_product_id", table_name="product_likes")
    op.drop_index("ix_product_likes_user_id", table_name="product_likes")
    op.drop_table("product_likes")


def downgrade() -> None:
    op.create_table(
        "product_likes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "product_id", name="uq_product_like_user_product"),
    )
    op.create_index("ix_product_likes_user_id", "product_likes", ["user_id"], unique=False)
    op.create_index("ix_product_likes_product_id", "product_likes", ["product_id"], unique=False)

    op.execute(
        """
        INSERT INTO product_likes (user_id, product_id, created_at)
        SELECT DISTINCT user_id, product_id, MIN(created_at)
        FROM alerts
        WHERE target_price IS NULL
        GROUP BY user_id, product_id
        """
    )

    op.execute("DELETE FROM alerts WHERE target_price IS NULL")

    op.alter_column(
        "alerts",
        "target_price",
        existing_type=sa.Numeric(10, 2),
        nullable=False,
    )

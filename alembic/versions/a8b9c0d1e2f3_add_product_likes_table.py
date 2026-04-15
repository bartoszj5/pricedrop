"""add product likes table

Revision ID: a8b9c0d1e2f3
Revises: f7a8b9c0d1e2
Create Date: 2026-04-13 19:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a8b9c0d1e2f3"
down_revision: Union[str, Sequence[str], None] = "f7a8b9c0d1e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
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
    op.create_index(op.f("ix_product_likes_user_id"), "product_likes", ["user_id"], unique=False)
    op.create_index(op.f("ix_product_likes_product_id"), "product_likes", ["product_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_product_likes_product_id"), table_name="product_likes")
    op.drop_index(op.f("ix_product_likes_user_id"), table_name="product_likes")
    op.drop_table("product_likes")

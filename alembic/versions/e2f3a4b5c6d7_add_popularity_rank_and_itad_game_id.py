"""add popularity_rank and itad_game_id to products

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
Create Date: 2026-04-11 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e2f3a4b5c6d7"
down_revision: Union[str, Sequence[str], None] = "d1e2f3a4b5c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "products",
        sa.Column("popularity_rank", sa.Integer(), nullable=True),
    )
    op.add_column(
        "products",
        sa.Column("itad_game_id", sa.String(length=64), nullable=True),
    )
    op.create_index(
        op.f("ix_products_popularity_rank"),
        "products",
        ["popularity_rank"],
        unique=False,
    )
    op.create_index(
        op.f("ix_products_itad_game_id"),
        "products",
        ["itad_game_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_products_itad_game_id"), table_name="products")
    op.drop_index(op.f("ix_products_popularity_rank"), table_name="products")
    op.drop_column("products", "itad_game_id")
    op.drop_column("products", "popularity_rank")

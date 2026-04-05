"""add manufacturer_code to products

Revision ID: d1e2f3a4b5c6
Revises: c9d8e7f6a5b4
Create Date: 2026-04-04 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d1e2f3a4b5c6"
down_revision: Union[str, Sequence[str], None] = "c9d8e7f6a5b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "products",
        sa.Column("manufacturer_code", sa.String(length=128), nullable=True),
    )
    op.create_index(
        op.f("ix_products_manufacturer_code"),
        "products",
        ["manufacturer_code"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_products_manufacturer_code"), table_name="products")
    op.drop_column("products", "manufacturer_code")

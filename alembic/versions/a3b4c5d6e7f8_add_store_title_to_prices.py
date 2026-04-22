"""add store_title to prices

Revision ID: a3b4c5d6e7f8
Revises: b1c2d3e4f5a6
Create Date: 2026-04-22 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a3b4c5d6e7f8"
down_revision: Union[str, Sequence[str], None] = "b1c2d3e4f5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "prices",
        sa.Column("store_title", sa.String(length=512), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("prices", "store_title")

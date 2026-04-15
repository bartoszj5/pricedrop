"""add discord webhook url to users

Revision ID: f7a8b9c0d1e2
Revises: e2f3a4b5c6d7
Create Date: 2026-04-13 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f7a8b9c0d1e2"
down_revision: Union[str, Sequence[str], None] = "e2f3a4b5c6d7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("discord_webhook_url", sa.String(length=1024), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "discord_webhook_url")

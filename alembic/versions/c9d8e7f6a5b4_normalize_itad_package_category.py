"""normalize itad package category

Revision ID: c9d8e7f6a5b4
Revises: a1b2c3d4e5f6
Create Date: 2026-04-04 12:15:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "c9d8e7f6a5b4"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Normalize ITAD full-game package entries to the local game category."""
    op.execute(
        """
        UPDATE products
        SET category = 'game'
        WHERE category = 'package'
        """
    )


def downgrade() -> None:
    """Irreversible data cleanup migration."""
    pass

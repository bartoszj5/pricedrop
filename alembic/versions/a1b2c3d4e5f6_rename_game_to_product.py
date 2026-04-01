"""rename game to product

Revision ID: a1b2c3d4e5f6
Revises: f401ebd3627d
Create Date: 2026-04-01 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "f401ebd3627d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Rename games -> products, game_id -> product_id, add category column."""
    # --- Rename table ---
    op.rename_table("games", "products")

    # --- Add category column ---
    op.add_column(
        "products",
        sa.Column(
            "category",
            sqlmodel.sql.sqltypes.AutoString(length=50),
            nullable=False,
            server_default="game",
        ),
    )
    op.create_index(op.f("ix_products_category"), "products", ["category"])

    # --- Rename indexes on products ---
    op.drop_index("ix_games_slug", table_name="products")
    op.create_index(op.f("ix_products_slug"), "products", ["slug"], unique=True)
    op.drop_index("ix_games_title", table_name="products")
    op.create_index(op.f("ix_products_title"), "products", ["title"])

    # --- alerts: game_id -> product_id ---
    op.drop_constraint("alerts_game_id_fkey", "alerts", type_="foreignkey")
    op.drop_index("ix_alerts_game_id", table_name="alerts")
    op.alter_column("alerts", "game_id", new_column_name="product_id")
    op.create_foreign_key(
        "alerts_product_id_fkey", "alerts", "products", ["product_id"], ["id"]
    )
    op.create_index(op.f("ix_alerts_product_id"), "alerts", ["product_id"])

    # --- prices: game_id -> product_id ---
    op.drop_constraint("uq_price_game_store", "prices", type_="unique")
    op.drop_constraint("prices_game_id_fkey", "prices", type_="foreignkey")
    op.drop_index("ix_prices_game_id", table_name="prices")
    op.alter_column("prices", "game_id", new_column_name="product_id")
    op.create_foreign_key(
        "prices_product_id_fkey", "prices", "products", ["product_id"], ["id"]
    )
    op.create_index(op.f("ix_prices_product_id"), "prices", ["product_id"])
    op.create_unique_constraint(
        "uq_price_product_store", "prices", ["product_id", "store_id"]
    )


def downgrade() -> None:
    """Revert products -> games, product_id -> game_id, drop category column."""
    # --- prices: product_id -> game_id ---
    op.drop_constraint("uq_price_product_store", "prices", type_="unique")
    op.drop_constraint("prices_product_id_fkey", "prices", type_="foreignkey")
    op.drop_index(op.f("ix_prices_product_id"), table_name="prices")
    op.alter_column("prices", "product_id", new_column_name="game_id")
    op.create_foreign_key(
        "prices_game_id_fkey", "prices", "games", ["game_id"], ["id"]
    )
    op.create_index(op.f("ix_prices_game_id"), "prices", ["game_id"])
    op.create_unique_constraint(
        "uq_price_game_store", "prices", ["game_id", "store_id"]
    )

    # --- alerts: product_id -> game_id ---
    op.drop_constraint("alerts_product_id_fkey", "alerts", type_="foreignkey")
    op.drop_index(op.f("ix_alerts_product_id"), table_name="alerts")
    op.alter_column("alerts", "product_id", new_column_name="game_id")
    op.create_foreign_key(
        "alerts_game_id_fkey", "alerts", "games", ["game_id"], ["id"]
    )
    op.create_index(op.f("ix_alerts_game_id"), "alerts", ["game_id"])

    # --- Rename indexes on products back to games ---
    op.drop_index(op.f("ix_products_title"), table_name="products")
    op.create_index("ix_games_title", "products", ["title"])
    op.drop_index(op.f("ix_products_slug"), table_name="products")
    op.create_index("ix_games_slug", "products", ["slug"], unique=True)

    # --- Drop category column ---
    op.drop_index(op.f("ix_products_category"), table_name="products")
    op.drop_column("products", "category")

    # --- Rename table back ---
    op.rename_table("products", "games")

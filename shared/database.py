import os

from sqlmodel import Session, create_engine

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://pricedrop:pricedrop@postgres:5432/pricedrop",
)

engine = create_engine(DATABASE_URL, echo=False)


def get_engine():
    return engine


def get_session():
    with Session(engine) as session:
        yield session

import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlmodel import Session, select

from cache import get_client
from shared.database import get_session
from shared.models import User

logger = logging.getLogger(__name__)

_secret = os.getenv("SECRET_KEY")
if not _secret:
    if os.getenv("ENVIRONMENT") == "production":
        raise RuntimeError("SECRET_KEY environment variable must be set in production")
    _secret = "dev-secret-change-in-production"
SECRET_KEY = _secret


def _read_bool_env(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))
AUTH_COOKIE_NAME = "access_token"
REFRESH_COOKIE_NAME = "refresh_token"
COOKIE_SECURE = _read_bool_env(
    "COOKIE_SECURE",
    os.getenv("ENVIRONMENT") == "production",
)

REVOKED_REFRESH_KEY_PREFIX = "auth:refresh:revoked:"

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode(), hashed_password.encode())


def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(data: dict) -> tuple[str, str]:
    """Return (token, jti). jti identifies the token for revocation."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    jti = uuid.uuid4().hex
    to_encode.update({"exp": expire, "type": "refresh", "jti": jti})
    token = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return token, jti


def decode_refresh_token(token: str) -> dict | None:
    """Return payload dict if the token is a valid, non-revoked refresh token."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.InvalidTokenError:
        return None
    if payload.get("type") != "refresh":
        return None
    jti = payload.get("jti")
    if jti and _is_refresh_revoked(jti):
        return None
    return payload


def _is_refresh_revoked(jti: str) -> bool:
    client = get_client()
    if client is None:
        return False
    try:
        return bool(client.exists(f"{REVOKED_REFRESH_KEY_PREFIX}{jti}"))
    except Exception as exc:
        logger.warning("redis EXISTS failed for refresh jti: %s", exc)
        return False


def revoke_refresh_token(jti: str, exp: int | None) -> None:
    """Add refresh jti to blacklist with TTL matching the token's remaining lifetime."""
    client = get_client()
    if client is None:
        return
    ttl = 1
    if exp is not None:
        remaining = int(exp - datetime.now(timezone.utc).timestamp())
        ttl = max(remaining, 1)
    try:
        client.setex(f"{REVOKED_REFRESH_KEY_PREFIX}{jti}", ttl, "1")
    except Exception as exc:
        logger.warning("redis SETEX failed for refresh jti: %s", exc)


def authenticate_user(session: Session, username: str, password: str) -> User | None:
    user = session.exec(select(User).where(User.username == username)).first()
    if not user:
        bcrypt.hashpw(b"dummy", bcrypt.gensalt())  # constant-time to prevent timing attacks
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user


async def get_current_user(
    request: Request,
    token: Annotated[str | None, Depends(oauth2_scheme)],
    session: Annotated[Session, Depends(get_session)],
) -> User:
    if not token:
        token = request.cookies.get(AUTH_COOKIE_NAME)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str | None = payload.get("sub")
        if username is None:
            raise credentials_exception
    except jwt.InvalidTokenError:
        raise credentials_exception

    user = session.exec(select(User).where(User.username == username)).first()
    if user is None:
        raise credentials_exception
    return user


async def get_current_active_user(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user

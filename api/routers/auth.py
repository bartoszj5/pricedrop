from datetime import timedelta
from typing import Annotated
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
import re

from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlmodel import Session, select

from dependencies.auth import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    AUTH_COOKIE_NAME,
    COOKIE_SECURE,
    REFRESH_COOKIE_NAME,
    REFRESH_TOKEN_EXPIRE_DAYS,
    authenticate_user,
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    get_current_active_user,
    get_password_hash,
)
from shared.database import get_session
from shared.models import User

router = APIRouter(prefix="/auth", tags=["auth"])

SessionDep = Annotated[Session, Depends(get_session)]
CurrentUser = Annotated[User, Depends(get_current_active_user)]


class Token(BaseModel):
    access_token: str
    token_type: str


class UserRegister(BaseModel):
    username: str = Field(min_length=3, max_length=100)
    email: EmailStr
    password: str

    @field_validator("username")
    @classmethod
    def username_valid_chars(cls, v: str) -> str:
        if not re.fullmatch(r"[a-zA-Z0-9_-]+", v):
            raise ValueError(
                "Username may only contain letters, digits, hyphens, and underscores"
            )
        return v

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


NOTIFICATION_CHANNELS = {"email", "discord", "both"}


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    discord_webhook_url: str | None = None
    notification_channel: str = "both"
    is_active: bool


class UserSettingsUpdate(BaseModel):
    discord_webhook_url: str | None = Field(default=None, max_length=1024)
    notification_channel: str | None = Field(default=None, max_length=16)

    @field_validator("discord_webhook_url")
    @classmethod
    def validate_discord_webhook_url(cls, value: str | None) -> str | None:
        if value is None:
            return None

        normalized = value.strip()
        if not normalized:
            return None

        parsed = urlparse(normalized)
        if parsed.scheme != "https" or not parsed.netloc:
            raise ValueError("discord_webhook_url must be an HTTPS URL")

        allowed_prefixes = (
            "https://discord.com/api/webhooks/",
            "https://discordapp.com/api/webhooks/",
        )
        if not any(normalized.startswith(prefix) for prefix in allowed_prefixes):
            raise ValueError("discord_webhook_url must be a Discord webhook URL")

        return normalized

    @field_validator("notification_channel")
    @classmethod
    def validate_notification_channel(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if value not in NOTIFICATION_CHANNELS:
            raise ValueError(
                f"notification_channel must be one of: {sorted(NOTIFICATION_CHANNELS)}"
            )
        return value


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(data: UserRegister, session: SessionDep):
    existing = session.exec(
        select(User).where((User.username == data.username) | (User.email == data.email))
    ).first()
    if existing:
        field = "username" if existing.username == data.username else "email"
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"User with this {field} already exists",
        )

    user = User(
        username=data.username,
        email=data.email,
        hashed_password=get_password_hash(data.password),
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _set_auth_cookies(response: Response, username: str) -> str:
    access_token = create_access_token(
        data={"sub": username},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    refresh_token = create_refresh_token(data={"sub": username})
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=access_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        path="/",
    )
    return access_token


@router.post("/login", response_model=Token)
def login(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    session: SessionDep,
    response: Response,
):
    user = authenticate_user(session, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = _set_auth_cookies(response, user.username)
    return Token(access_token=access_token, token_type="bearer")


@router.post("/refresh", response_model=Token)
def refresh(request: Request, session: SessionDep, response: Response):
    token = request.cookies.get(REFRESH_COOKIE_NAME)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No refresh token",
        )
    username = decode_refresh_token(token)
    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )
    user = session.exec(select(User).where(User.username == username)).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )
    access_token = _set_auth_cookies(response, user.username)
    return Token(access_token=access_token, token_type="bearer")


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(key=AUTH_COOKIE_NAME, path="/")
    response.delete_cookie(key=REFRESH_COOKIE_NAME, path="/")
    return {"detail": "Logged out"}


@router.get("/me", response_model=UserResponse)
def get_me(current_user: CurrentUser):
    return current_user


@router.patch("/me/settings", response_model=UserResponse)
def update_me_settings(
    data: UserSettingsUpdate,
    current_user: CurrentUser,
    session: SessionDep,
):
    payload = data.model_dump(exclude_unset=True)
    if "discord_webhook_url" in payload:
        current_user.discord_webhook_url = payload["discord_webhook_url"]
    if "notification_channel" in payload and payload["notification_channel"] is not None:
        current_user.notification_channel = payload["notification_channel"]

    channel = current_user.notification_channel
    if channel in {"discord", "both"} and not current_user.discord_webhook_url:
        if channel == "discord":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot select discord channel without a Discord webhook URL",
            )

    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    return current_user

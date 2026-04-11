import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from itad_scheduler import itad_sync_loop
from routers import alerts, auth, dedup, itad, prices, products, stores

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    stop_event = asyncio.Event()
    task = asyncio.create_task(itad_sync_loop(stop_event))
    try:
        yield
    finally:
        stop_event.set()
        try:
            await asyncio.wait_for(task, timeout=5)
        except asyncio.TimeoutError:
            task.cancel()


app = FastAPI(title="PriceDrop API", lifespan=lifespan)

CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    ).split(",")
    if origin.strip()
]

if not CORS_ORIGINS:
    CORS_ORIGINS = ["http://localhost:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(dedup.router)
app.include_router(products.router)
app.include_router(stores.router)
app.include_router(prices.router)
app.include_router(itad.router)
app.include_router(alerts.router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "api"}

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import alerts, auth, dedup, itad, prices, products, stores

app = FastAPI(title="PriceDrop API")

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

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import prices, products, stores

app = FastAPI(title="PriceDrop API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(products.router)
app.include_router(stores.router)
app.include_router(prices.router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "api"}

from fastapi import FastAPI

app = FastAPI(title="PriceDrop Notifications")


@app.get("/health")
def health():
    return {"status": "ok", "service": "notifications"}

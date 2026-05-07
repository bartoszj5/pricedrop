import logging
import os
from contextlib import asynccontextmanager

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from sentence_transformers import SentenceTransformer

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("embeddings")

MODEL_NAME = os.getenv(
    "EMBEDDINGS_MODEL",
    "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
)
MAX_CANDIDATES = int(os.getenv("EMBEDDINGS_MAX_CANDIDATES", "100"))
MAX_TEXT_LEN = int(os.getenv("EMBEDDINGS_MAX_TEXT_LEN", "512"))

STATE: dict = {"model": None}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    logger.info("Loading sentence-transformer model %s", MODEL_NAME)
    STATE["model"] = SentenceTransformer(MODEL_NAME)
    logger.info("Model loaded")
    try:
        yield
    finally:
        STATE["model"] = None


app = FastAPI(title="PriceDrop Embeddings", lifespan=lifespan)


class SimilarityRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=MAX_TEXT_LEN * 4)
    candidates: list[str] = Field(default_factory=list)


class SimilarityResponse(BaseModel):
    scores: list[float]


class EmbedRequest(BaseModel):
    texts: list[str] = Field(default_factory=list)


class EmbedResponse(BaseModel):
    dim: int
    embeddings: list[list[float]]


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": "embeddings",
        "model": MODEL_NAME,
        "model_loaded": STATE["model"] is not None,
    }


def _truncate(text: str) -> str:
    if len(text) <= MAX_TEXT_LEN:
        return text
    return text[:MAX_TEXT_LEN]


@app.post("/similarity", response_model=SimilarityResponse)
def similarity(req: SimilarityRequest) -> SimilarityResponse:
    model = STATE["model"]
    if model is None:
        raise HTTPException(status_code=503, detail="model not loaded")
    if not req.candidates:
        return SimilarityResponse(scores=[])
    if len(req.candidates) > MAX_CANDIDATES:
        raise HTTPException(
            status_code=413,
            detail=f"too many candidates (max {MAX_CANDIDATES})",
        )

    query = _truncate(req.query)
    candidates = [_truncate(c) for c in req.candidates]

    embeddings = model.encode(
        [query, *candidates],
        normalize_embeddings=True,
        convert_to_numpy=True,
        show_progress_bar=False,
    )
    q_vec = embeddings[0]
    cand = embeddings[1:]
    scores = np.clip(cand @ q_vec, 0.0, 1.0).astype(float)
    return SimilarityResponse(scores=scores.tolist())


@app.post("/embed", response_model=EmbedResponse)
def embed(req: EmbedRequest) -> EmbedResponse:
    model = STATE["model"]
    if model is None:
        raise HTTPException(status_code=503, detail="model not loaded")
    if not req.texts:
        return EmbedResponse(dim=0, embeddings=[])
    if len(req.texts) > MAX_CANDIDATES:
        raise HTTPException(
            status_code=413,
            detail=f"too many texts (max {MAX_CANDIDATES})",
        )

    texts = [_truncate(t) for t in req.texts]
    vectors = model.encode(
        texts,
        normalize_embeddings=True,
        convert_to_numpy=True,
        show_progress_bar=False,
    )
    return EmbedResponse(dim=int(vectors.shape[1]), embeddings=vectors.tolist())

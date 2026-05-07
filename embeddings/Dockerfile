FROM python:3.11-slim

WORKDIR /app

ENV HF_HOME=/models \
    TRANSFORMERS_OFFLINE=0 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY embeddings/requirements.txt .

RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch==2.5.1 \
    && pip install --no-cache-dir -r requirements.txt

ARG EMBEDDINGS_MODEL=sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
ENV EMBEDDINGS_MODEL=${EMBEDDINGS_MODEL}

RUN mkdir -p /models \
    && python -c "import os; from sentence_transformers import SentenceTransformer; SentenceTransformer(os.environ['EMBEDDINGS_MODEL'])"

COPY embeddings/main.py .

EXPOSE 8003

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8003"]

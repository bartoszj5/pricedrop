FROM golang:1.26-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN go build -o scraper .

FROM alpine:3.23

RUN apk add --no-cache curl

WORKDIR /app
COPY --from=builder /app/scraper .

EXPOSE 8001

CMD ["./scraper"]

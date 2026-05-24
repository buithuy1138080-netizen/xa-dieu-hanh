#!/bin/bash
set -e

echo "=== Deploy XA DIEU HANH ==="

# Pull latest code
git pull origin main

# Build and restart containers
docker compose -f docker-compose.prod.yml --env-file .env.production pull db
docker compose -f docker-compose.prod.yml --env-file .env.production up --build -d

# Wait for backend to be ready
echo "Waiting for backend..."
sleep 10

# Run DB migrations
docker compose -f docker-compose.prod.yml exec backend alembic upgrade head

echo "=== Deploy xong! ==="
docker compose -f docker-compose.prod.yml ps

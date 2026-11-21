#!/usr/bin/env bash
# Wispr Flow Server One-Command Deployment Script
# Supports Ubuntu 22.04/24.04, Debian 12, and Oracle Cloud Ampere A1 (ARM64)

set -e

echo "=== Wispr Flow Private Cloud Server Deployment ==="

# Check for Docker and Docker Compose
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm -f get-docker.sh
    systemctl enable --now docker
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "Installing Docker Compose plugin..."
    apt-get update && apt-get install -y docker-compose-plugin
fi

echo "Building and starting Wispr Flow container..."
docker compose up -d --build

echo ""
echo "=== Deployment Complete! ==="
echo "Wispr Flow server is running on port 8000"
echo "Health check endpoint: http://localhost:8000/health"
echo "Transcription endpoint: http://localhost:8000/v1/audio/transcriptions"
echo "WebSocket endpoint: ws://localhost:8000/api/v1/meetings/transcribe"

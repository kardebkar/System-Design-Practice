#!/bin/bash

echo "🚀 MiniGram Stage 3 - Load Balancer Setup"
echo "========================================"

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop and try again."
    exit 1
fi

# Check if Docker Compose is available
if ! docker-compose --version >/dev/null 2>&1; then
    echo "❌ Docker Compose is not available. Please install Docker Compose."
    exit 1
fi

echo "✅ Docker is running"
echo "✅ Docker Compose is available"
echo ""

# Install npm dependencies
echo "📦 Installing dependencies..."
npm install

echo ""
echo "🏗️  Building and starting Stage 3 services..."
echo "This may take a few minutes on first run..."

# Stop any existing containers
docker-compose down 2>/dev/null

# Build and start all services
docker-compose up -d --build

echo ""
echo "⏳ Waiting for services to start..."
sleep 10

# Check service status
echo ""
echo "📊 Service Status:"
docker-compose ps

echo ""
echo "🧪 Running quick health check..."

# Test main application
if curl -s http://localhost/health >/dev/null; then
    echo "✅ Main application is healthy"
else
    echo "⚠️  Main application not responding yet"
fi

# Test load balancer status
if curl -s http://localhost:8080/nginx_status >/dev/null; then
    echo "✅ NGINX load balancer is running"
else
    echo "⚠️  NGINX status not available yet"
fi

echo ""
echo "🎉 Stage 3 Setup Complete!"
echo ""
echo "📊 Access Points:"
echo "  • Main Application:  http://localhost"
echo "  • Grafana Dashboard: http://localhost:3001 (admin/admin123)"
echo "  • Prometheus:        http://localhost:9090"
echo "  • NGINX Status:      http://localhost:8080/nginx_status"
echo ""
echo "🧪 Test Commands:"
echo "  • npm run test:load      - Test load balancing"
echo "  • npm run test:scaling   - Test horizontal scaling"
echo "  • npm run health         - Quick health check"
echo "  • npm run metrics        - View instance metrics"
echo ""
echo "🔧 Management Commands:"
echo "  • npm run scale          - Scale to 5 instances"
echo "  • npm run logs           - View service logs"
echo "  • npm run stop           - Stop all services"
echo ""
echo "Happy load testing! 🚀"
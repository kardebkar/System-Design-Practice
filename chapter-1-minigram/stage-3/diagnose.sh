#!/bin/bash

echo "🔍 MiniGram Stage 3 - Diagnostic Tool"
echo "===================================="

echo ""
echo "📊 Container Status:"
docker-compose ps

echo ""
echo "🔍 Port Status:"
echo "Port 80 (NGINX):"
netstat -an | grep ":80 " || echo "  Port 80 not listening"

echo "Port 3001 (Grafana):"
netstat -an | grep ":3001 " || echo "  Port 3001 not listening"

echo "Port 5432 (PostgreSQL):"
netstat -an | grep ":5432 " || echo "  Port 5432 not listening"

echo ""
echo "🐳 Docker Container Health:"
for container in $(docker-compose ps -q); do
    if [ ! -z "$container" ]; then
        name=$(docker inspect --format='{{.Name}}' $container | sed 's/\///')
        status=$(docker inspect --format='{{.State.Status}}' $container)
        health=$(docker inspect --format='{{.State.Health.Status}}' $container 2>/dev/null || echo "no-healthcheck")
        echo "  $name: $status ($health)"
    fi
done

echo ""
echo "🔄 Recent Container Logs (last 10 lines each):"

echo ""
echo "--- NGINX Logs ---"
docker-compose logs --tail=10 nginx 2>/dev/null || echo "NGINX container not found"

echo ""
echo "--- App1 Logs ---"
docker-compose logs --tail=10 app1 2>/dev/null || echo "App1 container not found"

echo ""
echo "--- PostgreSQL Master Logs ---"
docker-compose logs --tail=10 postgres-master 2>/dev/null || echo "PostgreSQL master container not found"

echo ""
echo "--- Redis Logs ---"
docker-compose logs --tail=10 redis 2>/dev/null || echo "Redis container not found"

echo ""
echo "🧪 Quick Connection Tests:"

echo "Testing localhost:80 (NGINX):"
timeout 3 bash -c "</dev/tcp/localhost/80" 2>/dev/null && echo "  ✅ Port 80 accessible" || echo "  ❌ Port 80 not accessible"

echo "Testing localhost:5432 (PostgreSQL):"
timeout 3 bash -c "</dev/tcp/localhost/5432" 2>/dev/null && echo "  ✅ Port 5432 accessible" || echo "  ❌ Port 5432 not accessible"

echo "Testing localhost:6379 (Redis):"
timeout 3 bash -c "</dev/tcp/localhost/6379" 2>/dev/null && echo "  ✅ Port 6379 accessible" || echo "  ❌ Port 6379 not accessible"

echo ""
echo "💡 Troubleshooting Suggestions:"

# Check if any containers are failing
failed_containers=$(docker-compose ps | grep -E "(Exit|Restarting)" | wc -l)
if [ $failed_containers -gt 0 ]; then
    echo "  🚨 Some containers are failing. Check logs above for errors."
    echo "  🔧 Try: docker-compose down && docker-compose up -d --build"
fi

# Check if NGINX is running but apps aren't
nginx_running=$(docker-compose ps nginx | grep -c "Up")
app_running=$(docker-compose ps app1 | grep -c "Up")

if [ $nginx_running -gt 0 ] && [ $app_running -eq 0 ]; then
    echo "  🚨 NGINX is running but application servers are not."
    echo "  🔧 Check app container logs for startup errors."
fi

# Check if database is ready
postgres_running=$(docker-compose ps postgres-master | grep -c "Up")
if [ $postgres_running -eq 0 ]; then
    echo "  🚨 PostgreSQL is not running. Apps depend on database."
    echo "  🔧 Try: docker-compose up -d postgres-master"
fi

echo ""
echo "🔧 Quick Fix Commands:"
echo "  docker-compose down                    # Stop all services"
echo "  docker-compose up -d --build          # Rebuild and restart"
echo "  docker-compose logs -f                # Follow all logs"
echo "  docker-compose logs app1              # Check specific app logs"
echo "  docker system prune -f                # Clean up Docker cache"

echo ""
echo "✅ Diagnostic complete!"
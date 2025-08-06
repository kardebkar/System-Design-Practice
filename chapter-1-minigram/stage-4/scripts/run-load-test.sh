#!/bin/bash

# MiniGram Stage 4 - Cache Load Test Runner
# Usage: ./run-load-test.sh [options]

set -e

# Default configuration
DEFAULT_URL="http://localhost"
DEFAULT_PORT="80"
DEFAULT_CONCURRENCY="20"
DEFAULT_REQUESTS="1000"
DEFAULT_DURATION="60"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 MiniGram Stage 4 - Cache Performance Load Test${NC}"
echo -e "${BLUE}=================================================${NC}"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -u|--url)
            TEST_URL="$2"
            shift 2
            ;;
        -p|--port)
            TEST_PORT="$2"
            shift 2
            ;;
        -c|--concurrency)
            CONCURRENCY="$2"
            shift 2
            ;;
        -r|--requests)
            TOTAL_REQUESTS="$2"
            shift 2
            ;;
        -d|--duration)
            TEST_DURATION="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  -u, --url URL          Base URL to test (default: http://localhost)"
            echo "  -p, --port PORT        Port to test (default: 80)"
            echo "  -c, --concurrency NUM  Number of concurrent requests (default: 20)"
            echo "  -r, --requests NUM     Total number of requests (default: 1000)"
            echo "  -d, --duration SEC     Test duration in seconds (default: 60)"
            echo "  -h, --help            Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                                    # Run with defaults"
            echo "  $0 -c 50 -r 2000                    # High concurrency test"
            echo "  $0 -u http://production.com -p 8080  # Test production server"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Set defaults if not provided
export TEST_URL=${TEST_URL:-$DEFAULT_URL}
export TEST_PORT=${TEST_PORT:-$DEFAULT_PORT}
export CONCURRENCY=${CONCURRENCY:-$DEFAULT_CONCURRENCY}
export TOTAL_REQUESTS=${TOTAL_REQUESTS:-$DEFAULT_REQUESTS}
export TEST_DURATION=${TEST_DURATION:-$DEFAULT_DURATION}

echo -e "${YELLOW}Configuration:${NC}"
echo -e "  Target: ${TEST_URL}:${TEST_PORT}"
echo -e "  Concurrency: ${CONCURRENCY}"
echo -e "  Total Requests: ${TOTAL_REQUESTS}"
echo -e "  Test Duration: ${TEST_DURATION}s"
echo ""

# Check if target is reachable
echo -e "${YELLOW}🔍 Checking if target is reachable...${NC}"
if curl -f -s --max-time 10 "${TEST_URL}:${TEST_PORT}/health" > /dev/null; then
    echo -e "${GREEN}✅ Target is reachable${NC}"
else
    echo -e "${RED}❌ Target is not reachable at ${TEST_URL}:${TEST_PORT}${NC}"
    echo -e "${YELLOW}💡 Make sure your MiniGram Stage 4 is running:${NC}"
    echo -e "   docker-compose up -d"
    exit 1
fi

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    echo -e "${YELLOW}Please install Node.js to run the load test${NC}"
    exit 1
fi

# Create reports directory if it doesn't exist
mkdir -p "$(dirname "$0")/../reports"

# Run the load test
echo -e "${YELLOW}🧪 Starting load test...${NC}"
echo ""

node "$(dirname "$0")/cache-load-test.js"

TEST_EXIT_CODE=$?

if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ Load test completed successfully!${NC}"
    echo ""
    echo -e "${BLUE}📊 Next steps:${NC}"
    echo -e "  1. Check the detailed report in the reports/ directory"
    echo -e "  2. View real-time metrics in Grafana: http://localhost:3001"
    echo -e "  3. Check Prometheus metrics: http://localhost:9090"
    echo -e "  4. Monitor Redis cache: http://localhost:8001"
    echo ""
    echo -e "${YELLOW}💡 Tips:${NC}"
    echo -e "  - Run multiple tests to see cache warming effects"
    echo -e "  - Compare with Stage 3 results to see cache improvements"
    echo -e "  - Monitor cache hit ratios in the dashboard"
else
    echo ""
    echo -e "${RED}❌ Load test failed with exit code: $TEST_EXIT_CODE${NC}"
    exit $TEST_EXIT_CODE
fi
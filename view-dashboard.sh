#!/bin/bash

# Script to view the MiniGram Performance Dashboard

echo "🚀 MiniGram Performance Dashboard"
echo "================================="
echo ""

# Check if the dashboard exists
if [ ! -f "performance-dashboard.html" ]; then
    echo "❌ Dashboard file not found!"
    echo "Make sure you're in the project root directory."
    exit 1
fi

echo "📊 Opening Performance Dashboard..."
echo ""

# Try to open in browser (works on macOS, Linux, and Windows)
if command -v open &> /dev/null; then
    # macOS
    open performance-dashboard.html
    echo "✅ Dashboard opened in your default browser (macOS)"
elif command -v xdg-open &> /dev/null; then
    # Linux
    xdg-open performance-dashboard.html
    echo "✅ Dashboard opened in your default browser (Linux)"
elif command -v start &> /dev/null; then
    # Windows
    start performance-dashboard.html
    echo "✅ Dashboard opened in your default browser (Windows)"
else
    echo "⚠️  Could not automatically open browser."
    echo "Please manually open: $(pwd)/performance-dashboard.html"
fi

echo ""
echo "🎯 Dashboard Features:"
echo "├─ Real-time performance metrics"
echo "├─ Interactive charts and visualizations"
echo "├─ Interview gold insights and talking points"
echo "├─ Direct links to GitHub Actions"
echo "└─ Technical deep-dives for system design discussions"
echo ""

echo "📋 Quick Access URLs:"
echo "├─ Local Dashboard: file://$(pwd)/performance-dashboard.html"
echo "├─ GitHub Actions: https://github.com/kardebkar/System-Design-Practice/actions"
echo "├─ Stage 1 Code: ./chapter-1-minigram/stage-1/"
echo "└─ Stage 2 Code: ./chapter-1-minigram/stage-2/"
echo ""

echo "🎓 Interview Preparation:"
echo "├─ Performance comparison data ready"
echo "├─ Technical architecture decisions documented"
echo "├─ Real-world impact metrics available"
echo "└─ Next steps and scaling strategy outlined"
echo ""

echo "💡 Pro Tip: Use Ctrl+Shift+I (or Cmd+Option+I on Mac) to inspect"
echo "   the dashboard's responsive design and performance optimizations!"

# Optionally start a simple HTTP server for better viewing
read -p "🌐 Start local HTTP server for better experience? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Starting HTTP server on port 8080..."
    if command -v python3 &> /dev/null; then
        echo "🌍 Dashboard available at: http://localhost:8080/performance-dashboard.html"
        echo "Press Ctrl+C to stop the server"
        python3 -m http.server 8080
    elif command -v python &> /dev/null; then
        echo "🌍 Dashboard available at: http://localhost:8080/performance-dashboard.html"
        echo "Press Ctrl+C to stop the server"
        python -m SimpleHTTPServer 8080
    else
        echo "⚠️  Python not found. Cannot start HTTP server."
        echo "You can still view the dashboard by opening the HTML file directly."
    fi
fi
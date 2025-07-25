# Chapter 1: Scale from Zero to Millions - Stage 1

## 🎯 Stage 1: Single Server Architecture

Everything runs on ONE server:
- Web Server (Express.js)
- Database (SQLite)
- File Storage (Local filesystem)
- No caching
- No load balancing

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Seed some test data
npm run seed

# Start the server
npm run dev

# In another terminal, run load test
npm run test:load
```

## 📊 Metrics Dashboard

Visit: http://localhost:3000/metrics.html

## 🔥 Load Testing

```bash
# Simple load test (built-in)
npm run test:load

# Artillery load test
npm run test:artillery
```

## 📈 What to Observe

1. **Response Times**: Watch them degrade as load increases
2. **Error Rates**: SQLite write locks cause errors
3. **Memory Usage**: Everything in one process
4. **CPU Usage**: Spikes during image processing

## 🎓 Interview Insights

After this stage, you can discuss:
- Single point of failure
- Resource contention
- No horizontal scaling
- Database as bottleneck
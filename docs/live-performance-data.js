window.livePerformanceData = {
  lastUpdated: "2025-08-05T04:15:00Z",
  buildNumber: "30",
  commit: "stage4-cache-cdn-implementation",
  branch: "main",
  ciStatus: {
    stage1: "success",
    stage2: "success",
    stage3: "success",
    stage4: "success"
  },
  metrics: {
    stage1: {
      name: "SQLite",
      successRate: 45,
      metrics: {
        "10": { "response": 145, "ux": 100, "errors": 0 },
        "50": { "response": 652, "ux": 100, "errors": 5 },
        "100": { "response": 1361, "ux": 73.9, "errors": 26 },
        "200": { "response": 2774, "ux": 40.5, "errors": 45 }
      }
    },
    stage2: {
      name: "PostgreSQL", 
      successRate: 85,
      metrics: {
        "10": { "response": 139, "ux": 100, "errors": 0 },
        "50": { "response": 400, "ux": 100, "errors": 1 },
        "100": { "response": 764, "ux": 90.4, "errors": 3 },
        "200": { "response": 1489, "ux": 79.8, "errors": 8 }
      }
    },
    stage3: {
      name: "Load Balancer", 
      successRate: 90,
      metrics: {
        "10": { "response": 12, "ux": 100, "errors": 0 },
        "50": { "response": 15, "ux": 100, "errors": 0 },
        "100": { "response": 18, "ux": 100, "errors": 0 },
        "500": { "response": 28, "ux": 98.5, "errors": 0 },
        "1000": { "response": 45, "ux": 95.2, "errors": 2 },
        "2000": { "response": 85, "ux": 91.8, "errors": 5 }
      },
      throughput: "10000+ RPS",
      instances: 3,
      loadBalancer: "NGINX"
    },
    stage4: {
      name: "Cache + CDN",
      successRate: 98,
      metrics: {
        "10": { "response": 8, "ux": 100, "errors": 0 },
        "50": { "response": 9, "ux": 100, "errors": 0 },
        "100": { "response": 11, "ux": 100, "errors": 0 },
        "500": { "response": 14, "ux": 100, "errors": 0 },
        "1000": { "response": 18, "ux": 99.8, "errors": 0 },
        "2000": { "response": 22, "ux": 99.5, "errors": 1 },
        "5000": { "response": 35, "ux": 98.2, "errors": 3 }
      },
      throughput: "25000+ RPS",
      instances: 3,
      loadBalancer: "NGINX",
      caching: {
        redis: "256MB LRU Cache",
        hitRatio: "85%",
        avgCachedResponse: "8ms",
        avgUncachedResponse: "45ms"
      },
      cdn: {
        enabled: true,
        staticAssets: "99% hit rate",
        avgCdnResponse: "2ms"
      },
      verified: {
        successRate: "98.2%",
        throughput: "25,000+ RPS",
        responseTime: "8-35ms",
        cacheHitRatio: "85%",
        cdnHitRate: "99%"
      }
    }
  },
  improvement: "1000x from Stage 1, 62x from Stage 2, 2.5x from Stage 3",
  breakingPoint: 5000,
  runUrl: "https://github.com/kardebkar/System-Design-Practice/actions/runs/16739140249"
};

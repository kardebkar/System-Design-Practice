window.livePerformanceData = {
  lastUpdated: "2025-08-09T23:26:29Z",
  buildNumber: "49",
  commit: "272f2fd2ceff1426ffa165d9d4ac8e40ea747503",
  branch: "main",
  ciStatus: {
    stage1: "",
    stage2: "",
    stage3: "",
    stage4: "",
    stage5: "",
    stage6: "",
    stage7: "",
    stage8: ""
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
      successRate: 85,
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
    },
    stage5: {
      name: "Stateless Web", 
      successRate: 90,
      metrics: {
        "10": { "response": 5, "ux": 100, "errors": 0 },
        "50": { "response": 6, "ux": 100, "errors": 0 },
        "100": { "response": 6, "ux": 100, "errors": 0 },
        "1000": { "response": 8, "ux": 100, "errors": 0 },
        "10000": { "response": 22, "ux": 100, "errors": 0 }
      },
      throughput: "10000+ RPS",
      features: {
        sessionStorage: "External Redis",
        authentication: "JWT stateless",
        scaling: "Auto-scaling capable"
      }
    },
    stage6: {
      name: "Multi Data Center", 
      successRate: 90,
      metrics: {
        "10": { "response": 3, "ux": 100, "errors": 0 },
        "100": { "response": 4, "ux": 100, "errors": 0 },
        "1000": { "response": 3, "ux": 100, "errors": 0 },
        "10000": { "response": 4, "ux": 100, "errors": 0 },
        "15000": { "response": 12, "ux": 97, "errors": 3 }
      },
      throughput: "15000+ RPS",
      features: {
        regions: "US West, US East, Europe",
        geodns: "Global routing < 50ms",
        replication: "Cross-region failover"
      }
    },
    stage7: {
      name: "Message Queue", 
      successRate: 90,
      metrics: {
        "10": { "response": 3, "ux": 100, "errors": 0 },
        "100": { "response": 3, "ux": 100, "errors": 0 },
        "1000": { "response": 3, "ux": 100, "errors": 0 },
        "10000": { "response": 3, "ux": 100, "errors": 0 },
        "25000": { "response": 7, "ux": 97, "errors": 3 }
      },
      throughput: "25000+ RPS",
      features: {
        queues: "Redis/RabbitMQ",
        processing: "Async background",
        architecture: "Decoupled microservices"
      }
    },
    stage8: {
      name: "Database Sharding", 
      successRate: 90,
      metrics: {
        "10": { "response": 2, "ux": 100, "errors": 0 },
        "100": { "response": 2, "ux": 100, "errors": 0 },
        "1000": { "response": 2, "ux": 100, "errors": 0 },
        "10000": { "response": 3, "ux": 100, "errors": 0 },
        "100000": { "response": 8, "ux": 100, "errors": 0 }
      },
      throughput: "100000+ RPS",
      features: {
        sharding: "Consistent hashing",
        scaling: "Linear horizontal",
        capacity: "Petabyte+ storage"
      },
      verified: {
        successRate: "100%",
        throughput: "100,000+ RPS", 
        responseTime: "2-8ms",
        userCapacity: "100K+",
        improvement: "98% vs Stage 1"
      }
    }
  },
  improvement: "Complete 8-Stage Evolution: 98% improvement, 1000x user capacity",
  breakingPoint: 100000,
  runUrl: "https://github.com/kardebkar/System-Design-Practice/actions/runs/16854776673"
};

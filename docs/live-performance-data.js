window.livePerformanceData = {
  lastUpdated: "2025-08-05T00:46:14Z",
  buildNumber: "22",
  commit: "742e2aa28b11bf2bb5d8b31d8ee22b06440fdd0f",
  branch: "main",
  ciStatus: {
    stage1: "success",
    stage2: "success",
    stage3: "success"
  },
  metrics: {
    stage1: {
      name: "SQLite",
      successRate: 95,
      maxUsers: 50,
      metrics: {
        "10": { "response": 89, "ux": 95.2, "errors": 0 },
        "50": { "response": 2847, "ux": 40.5, "errors": 35 },
        "100": { "response": 8234, "ux": 12.3, "errors": 87 },
        "200": { "response": 15678, "ux": 5.1, "errors": 95 }
      }
    },
    stage2: {
      name: "PostgreSQL", 
      successRate: 98,
      maxUsers: 200,
      metrics: {
        "10": { "response": 45, "ux": 98.7, "errors": 0 },
        "50": { "response": 652, "ux": 79.8, "errors": 1 },
        "100": { "response": 1205, "ux": 74.2, "errors": 3 },
        "200": { "response": 1534, "ux": 68.9, "errors": 8 }
      }
    },
    stage3: {
      name: "Load Balancer",
      successRate: 100,
      maxUsers: 2000,
      architecture: "NGINX + 3 App Instances + PostgreSQL Cluster + Redis",
      throughput: "10,000+ RPS",
      instances: 3,
      loadBalancer: "NGINX",
      metrics: {
        "10": { "response": 12, "ux": 100, "errors": 0 },
        "50": { "response": 15, "ux": 100, "errors": 0 },
        "100": { "response": 18, "ux": 100, "errors": 0 },
        "500": { "response": 28, "ux": 98.5, "errors": 0 },
        "1000": { "response": 45, "ux": 95.2, "errors": 2 },
        "2000": { "response": 85, "ux": 91.8, "errors": 5 }
      },
      verified: {
        date: "2025-08-04",
        successRate: "100%",
        throughput: "10,247 RPS",
        responseTime: "12-20ms",
        loadVariance: "14%",
        healthyInstances: "3/3"
      }
    }
  },
  improvement: "400x faster than Stage 1, 10x faster than Stage 2",
  breakingPoint: 2000,
  runUrl: "https://github.com/kardebkar/System-Design-Practice/actions/runs/16737591208",
  stages: {
    current: 3,
    total: 3
  },
  businessImpact: {
    userCapacity: "40x more users than Stage 1",
    reliability: "100% success rate under extreme load",
    scalability: "Enterprise-ready horizontal scaling"
  }
};

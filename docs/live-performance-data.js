window.livePerformanceData = {
  lastUpdated: "2025-08-06T03:54:24Z",
  buildNumber: "28",
  commit: "47dd68be38d21a6555c2117feb765d1394a049ef",
  branch: "main",
  ciStatus: {
    stage1: "",
    stage2: "",
    stage3: ""
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
    }
  },
  improvement: "400x from Stage 1, 10x from Stage 2",
  breakingPoint: 2000,
  runUrl: "https://github.com/kardebkar/System-Design-Practice/actions/runs/16767068322"
};

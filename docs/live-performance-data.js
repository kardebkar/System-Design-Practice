window.livePerformanceData = {
  lastUpdated: "2025-08-03T20:28:13Z",
  buildNumber: "12",
  commit: "1a28703b6f84a9d4764b88823ed9dbbf8ca5554d",
  branch: "main",
  ciStatus: {
    stage1: "",
    stage2: ""
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
    }
  },
  improvement: "46%",
  breakingPoint: 100,
  runUrl: "https://github.com/kardebkar/System-Design-Practice/actions/runs/16709109792"
};

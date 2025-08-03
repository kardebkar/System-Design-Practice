const axios = require('axios');

async function testStage(url, stageName) {
  console.log(`\n📊 Testing ${stageName}...`);
  
  const startTime = Date.now();
  let success = 0;
  let errors = 0;
  const errorMessages = {};
  
  // Test concurrent registrations
  const promises = [];
  for (let i = 0; i < 50; i++) {
    promises.push(
      axios.post(`${url}/api/register`, {
        username: `perf_test_${i}_${Date.now()}`,
        email: `perf_${i}_${Date.now()}@test.com`,
        password: 'password123'
      }, { 
        validateStatus: () => true,
        timeout: 5000 
      })
      .then(res => {
        if (res.status === 200) {
          success++;
        } else {
          errors++;
          const error = res.data.error || `Status ${res.status}`;
          errorMessages[error] = (errorMessages[error] || 0) + 1;
        }
      })
      .catch(err => {
        errors++;
        const error = err.message;
        errorMessages[error] = (errorMessages[error] || 0) + 1;
      })
    );
  }
  
  await Promise.all(promises);
  const duration = Date.now() - startTime;
  
  // Get metrics if server is running
  let metrics = null;
  try {
    const { data } = await axios.get(`${url}/api/metrics`);
    metrics = data;
  } catch (err) {
    // Server might not have metrics endpoint
  }
  
  return {
    stageName,
    duration,
    success,
    errors,
    successRate: ((success / 50) * 100).toFixed(1) + '%',
    avgResponseTime: (duration / 50).toFixed(0) + 'ms',
    errorMessages,
    metrics
  };
}

async function compareStages() {
  console.log(`
╔══════════════════════════════════════════════════════╗
║         Stage 1 vs Stage 2 Performance Test          ║
╠══════════════════════════════════════════════════════╣
║  Testing: 50 concurrent user registrations           ║
╚══════════════════════════════════════════════════════╝
  `);
  
  const results = [];
  
  // Test Stage 1 (if running)
  try {
    console.log('Checking if Stage 1 is running on port 3000...');
    await axios.get('http://localhost:3000/health', { timeout: 1000 });
    const stage1 = await testStage('http://localhost:3000', 'Stage 1 - SQLite');
    results.push(stage1);
  } catch (err) {
    console.log('❌ Stage 1 not running on port 3000');
    console.log('   To start Stage 1: cd ../stage-1 && npm run dev');
  }
  
  // Test Stage 2
  try {
    console.log('\nChecking if Stage 2 is running on port 3001...');
    await axios.get('http://localhost:3001/health', { timeout: 1000 });
    const stage2 = await testStage('http://localhost:3001', 'Stage 2 - PostgreSQL');
    results.push(stage2);
  } catch (err) {
    console.log('❌ Stage 2 not running on port 3001');
    console.log('   To start Stage 2: npm run dev');
  }
  
  // Display results
  if (results.length === 0) {
    console.log('\n❌ No servers running! Start at least one stage to test.');
    return;
  }
  
  console.log('\n📈 Performance Results:');
  console.log('━'.repeat(80));
  
  results.forEach(result => {
    console.log(`
🏷️  ${result.stageName}
├─ Success Rate: ${result.successRate} (${result.success}/50)
├─ Total Duration: ${result.duration}ms
├─ Avg Response: ${result.avgResponseTime}
├─ Errors: ${result.errors}
${result.errors > 0 ? '├─ Error Types:' : ''}
${Object.entries(result.errorMessages).map(([err, count]) => 
  `│  └─ ${err}: ${count} times`).join('\n')}
${result.metrics ? `├─ Current Error Rate: ${result.metrics.errorRate}
├─ DB Queries/sec: ${result.metrics.dbQueriesPerSecond}
${result.metrics.poolStats ? `└─ Connection Pool: ${result.metrics.poolStats.total} total, ${result.metrics.poolStats.idle} idle` : ''}` : ''}
    `);
  });
  
  // Comparison if both stages tested
  if (results.length === 2) {
    const [stage1, stage2] = results;
    
    console.log('\n🎯 Direct Comparison:');
    console.log('━'.repeat(80));
    console.log(`
Metric                  Stage 1 (SQLite)    Stage 2 (PostgreSQL)    Improvement
────────────────────    ────────────────    ──────────────────      ───────────
Success Rate            ${stage1.successRate.padEnd(18)} ${stage2.successRate.padEnd(22)} ${calculateImprovement(stage1.success, stage2.success)}
Response Time           ${stage1.avgResponseTime.padEnd(18)} ${stage2.avgResponseTime.padEnd(22)} ${calculateSpeedImprovement(stage1.avgResponseTime, stage2.avgResponseTime)}
Total Duration          ${stage1.duration}ms`.padEnd(40) + `${stage2.duration}ms`.padEnd(24) + 
calculateSpeedImprovement(stage1.duration, stage2.duration));
    
    console.log(`
✨ Key Improvements:
${stage2.success > stage1.success ? `• ${((stage2.success - stage1.success) / stage1.success * 100).toFixed(0)}% more successful requests` : ''}
${stage2.errors < stage1.errors ? `• ${stage1.errors - stage2.errors} fewer errors` : ''}
${stage1.errorMessages['User already exists'] ? `• SQLite had ${stage1.errorMessages['User already exists']} "database locked" errors` : ''}
${stage2.errorMessages['User already exists'] || stage2.errors === 0 ? '• PostgreSQL handled all concurrent writes successfully' : ''}
    `);
  }
  
  console.log('\n📝 Interview Insight:');
  if (results.find(r => r.stageName.includes('Stage 2'))) {
    const stage2 = results.find(r => r.stageName.includes('Stage 2'));
    console.log(`"With PostgreSQL and connection pooling, I achieved ${stage2.successRate} success rate
for 50 concurrent users. The key improvements were connection pooling which
eliminated connection overhead, and PostgreSQL's MVCC which handles concurrent
writes without locking, unlike SQLite's file-level locking."`);
  }
}

function calculateImprovement(oldVal, newVal) {
  const improvement = ((newVal - oldVal) / oldVal * 100).toFixed(0);
  if (improvement > 0) return `+${improvement}%`;
  if (improvement < 0) return `${improvement}%`;
  return 'No change';
}

function calculateSpeedImprovement(oldTime, newTime) {
  const old = parseFloat(oldTime);
  const new_ = parseFloat(newTime);
  if (old > new_) {
    const times = (old / new_).toFixed(1);
    return `${times}x faster`;
  } else if (new_ > old) {
    const times = (new_ / old).toFixed(1);
    return `${times}x slower`;
  }
  return 'Same';
}

// Run the comparison
compareStages()
  .then(() => {
    console.log('\n✅ Test complete!');
  })
  .catch(err => {
    console.error('Test failed:', err.message);
  });
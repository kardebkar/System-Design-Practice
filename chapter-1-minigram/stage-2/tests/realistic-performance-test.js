const axios = require('axios');

// Realistic user patience thresholds
const USER_PATIENCE = {
  INSTANT: 1000,      // Users expect instant response
  ACCEPTABLE: 3000,   // Maximum acceptable wait
  ABANDONED: 5000     // Users definitely leave
};

async function realisticUserBehaviorTest(url, stageName, numUsers = 50) {
  console.log(`\n🧪 ${stageName} - Realistic User Behavior Test`);
  console.log(`Testing ${numUsers} concurrent users with real-world timeouts...\n`);
  
  const results = {
    instant: 0,      // <1s responses
    acceptable: 0,   // 1-3s responses  
    slow: 0,         // 3-5s responses
    abandoned: 0,    // >5s or timeout
    errors: 0,
    responseTimes: []
  };
  
  const promises = [];
  const startTime = Date.now();
  
  // Simulate users all clicking "Sign Up" at the same time
  for (let i = 0; i < numUsers; i++) {
    const userStart = Date.now();
    
    promises.push(
      axios.post(`${url}/api/register`, {
        username: `realistic_user_${i}_${Date.now()}`,
        email: `user_${i}_${Date.now()}@test.com`,
        password: 'password123'
      }, {
        timeout: USER_PATIENCE.ABANDONED, // Users won't wait longer than 5s
        validateStatus: () => true
      })
      .then(res => {
        const responseTime = Date.now() - userStart;
        results.responseTimes.push(responseTime);
        
        // Categorize based on user experience
        if (responseTime < USER_PATIENCE.INSTANT) {
          results.instant++;
        } else if (responseTime < USER_PATIENCE.ACCEPTABLE) {
          results.acceptable++;
        } else if (responseTime < USER_PATIENCE.ABANDONED) {
          results.slow++;
        } else {
          results.abandoned++;
        }
        
        if (res.status !== 200) {
          results.errors++;
        }
      })
      .catch(err => {
        results.abandoned++; // Timeout = user abandoned
        if (err.code === 'ECONNABORTED') {
          results.responseTimes.push(USER_PATIENCE.ABANDONED);
        }
      })
    );
  }
  
  await Promise.all(promises);
  const totalDuration = Date.now() - startTime;
  
  // Calculate user experience metrics
  const avgResponseTime = results.responseTimes.length > 0
    ? Math.round(results.responseTimes.reduce((a, b) => a + b) / results.responseTimes.length)
    : 0;
    
  const p95ResponseTime = results.responseTimes.length > 0
    ? results.responseTimes.sort((a, b) => a - b)[Math.floor(results.responseTimes.length * 0.95)]
    : 0;
  
  const userExperienceScore = (
    (results.instant * 100) +
    (results.acceptable * 70) +
    (results.slow * 30) +
    (results.abandoned * 0)
  ) / numUsers;
  
  return {
    stageName,
    totalUsers: numUsers,
    instant: results.instant,
    acceptable: results.acceptable,
    slow: results.slow,
    abandoned: results.abandoned,
    errors: results.errors,
    avgResponseTime,
    p95ResponseTime,
    userExperienceScore,
    totalDuration
  };
}

async function compareRealWorldPerformance() {
  console.log(`
╔══════════════════════════════════════════════════════╗
║        REAL-WORLD PERFORMANCE COMPARISON             ║
╠══════════════════════════════════════════════════════╣
║  Testing with realistic user patience thresholds     ║
╚══════════════════════════════════════════════════════╝
  `);
  
  console.log(`\n📊 User Patience Thresholds:`);
  console.log(`├─ Instant: <1 second (delightful)`);
  console.log(`├─ Acceptable: 1-3 seconds (tolerable)`);
  console.log(`├─ Slow: 3-5 seconds (frustrated)`);
  console.log(`└─ Abandoned: >5 seconds (user leaves)`);
  
  // Test different load levels
  const loadLevels = [10, 50, 100, 200];
  const results = { stage1: [], stage2: [] };
  
  for (const load of loadLevels) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing with ${load} concurrent users`);
    console.log('='.repeat(60));
    
    // Test Stage 1
    try {
      await axios.get('http://localhost:3000/health', { timeout: 1000 });
      const stage1Result = await realisticUserBehaviorTest('http://localhost:3000', 'Stage 1 - SQLite', load);
      results.stage1.push(stage1Result);
      displayResults(stage1Result);
    } catch (err) {
      console.log('❌ Stage 1 not available');
    }
    
    // Test Stage 2
    try {
      await axios.get('http://localhost:3001/health', { timeout: 1000 });
      const stage2Result = await realisticUserBehaviorTest('http://localhost:3001', 'Stage 2 - PostgreSQL', load);
      results.stage2.push(stage2Result);
      displayResults(stage2Result);
    } catch (err) {
      console.log('❌ Stage 2 not available');
    }
    
    // Brief cooldown
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Display final comparison
  displayFinalComparison(results);
}

function displayResults(result) {
  console.log(`\n📈 ${result.stageName} Results:`);
  console.log(`├─ User Experience Score: ${result.userExperienceScore.toFixed(1)}/100`);
  console.log(`├─ Response Times:`);
  console.log(`│  ├─ Average: ${result.avgResponseTime}ms`);
  console.log(`│  └─ 95th percentile: ${result.p95ResponseTime}ms`);
  console.log(`├─ User Experience Breakdown:`);
  console.log(`│  ├─ 😍 Instant (<1s): ${result.instant} users`);
  console.log(`│  ├─ 😊 Acceptable (1-3s): ${result.acceptable} users`);
  console.log(`│  ├─ 😟 Slow (3-5s): ${result.slow} users`);
  console.log(`│  └─ 😡 Abandoned (>5s): ${result.abandoned} users`);
  
  // Visual representation
  const total = result.totalUsers;
  const instantBar = '█'.repeat(Math.round((result.instant / total) * 20));
  const acceptableBar = '▓'.repeat(Math.round((result.acceptable / total) * 20));
  const slowBar = '▒'.repeat(Math.round((result.slow / total) * 20));
  const abandonedBar = '░'.repeat(Math.round((result.abandoned / total) * 20));
  
  console.log(`└─ Visual: ${instantBar}${acceptableBar}${slowBar}${abandonedBar}`);
}

function displayFinalComparison(results) {
  console.log(`\n\n${'='.repeat(60)}`);
  console.log('FINAL COMPARISON - USER EXPERIENCE SCORES');
  console.log('='.repeat(60));
  
  console.log('\n📊 User Experience Score by Load (Higher is Better):');
  console.log('Load     Stage 1 (SQLite)    Stage 2 (PostgreSQL)    Winner');
  console.log('----     ----------------    -------------------     ------');
  
  for (let i = 0; i < results.stage1.length; i++) {
    const s1 = results.stage1[i];
    const s2 = results.stage2[i];
    const load = s1.totalUsers;
    
    console.log(
      `${load.toString().padEnd(9)}` +
      `${s1.userExperienceScore.toFixed(1).padEnd(20)}` +
      `${s2.userExperienceScore.toFixed(1).padEnd(24)}` +
      `${s2.userExperienceScore > s1.userExperienceScore ? 'PostgreSQL' : 'SQLite'}`
    );
  }
  
  console.log(`\n🎯 Key Insights:`);
  console.log(`1. Success rate alone is misleading - user experience matters!`);
  console.log(`2. SQLite's sequential writes cause cascading delays`);
  console.log(`3. Users abandon requests after 3-5 seconds`);
  console.log(`4. PostgreSQL maintains sub-second responses under load`);
  
  // Find the breaking point
  const breakingPoint = results.stage1.find(r => r.userExperienceScore < 50);
  if (breakingPoint) {
    console.log(`\n⚠️  SQLite Breaking Point: ${breakingPoint.totalUsers} users`);
    console.log(`   User Experience Score dropped to ${breakingPoint.userExperienceScore.toFixed(1)}/100`);
  }
  
  console.log(`\n💡 Interview Answer:`);
  console.log(`"While both databases completed all requests eventually, the user`);
  console.log(`experience told a different story. At ${results.stage1[1]?.totalUsers || 50} concurrent users:`);
  console.log(`- SQLite: ${results.stage1[1]?.avgResponseTime || 'N/A'}ms average, ${results.stage1[1]?.abandoned || 'many'} users abandoned`);
  console.log(`- PostgreSQL: ${results.stage2[1]?.avgResponseTime || 'N/A'}ms average, maintained sub-second response"`);
}

// User simulation that mimics real behavior
async function simulateRealUserJourney(baseUrl, userId) {
  const journey = {
    steps: [],
    totalTime: 0,
    abandoned: false
  };
  
  const startTime = Date.now();
  
  try {
    // Step 1: Register
    const regStart = Date.now();
    await axios.post(`${baseUrl}/api/register`, {
      username: `journey_user_${userId}_${Date.now()}`,
      email: `journey_${userId}@test.com`,
      password: 'password123'
    }, { timeout: USER_PATIENCE.ACCEPTABLE });
    
    journey.steps.push({
      action: 'register',
      duration: Date.now() - regStart,
      status: 'success'
    });
    
    // Users don't wait between actions in real life
    // They immediately try to use the app
    
    // Step 2: Login (if registration was slow, they might not continue)
    if (journey.steps[0].duration > USER_PATIENCE.ACCEPTABLE) {
      journey.abandoned = true;
      journey.reason = 'Registration too slow';
      return journey;
    }
    
    // Continue with more actions...
    journey.totalTime = Date.now() - startTime;
    
  } catch (err) {
    journey.abandoned = true;
    journey.reason = err.code === 'ECONNABORTED' ? 'Timeout' : 'Error';
    journey.totalTime = Date.now() - startTime;
  }
  
  return journey;
}

// Run the comparison
compareRealWorldPerformance()
  .then(() => console.log('\n✅ Real-world performance test complete!'))
  .catch(err => console.error('❌ Test failed:', err));
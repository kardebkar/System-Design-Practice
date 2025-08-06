#!/usr/bin/env node

/**
 * MiniGram Stage Performance Comparison
 * 
 * This script compares performance metrics across different stages
 * of the MiniGram system implementation to demonstrate improvements
 * achieved with each architectural enhancement.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { performance } = require('perf_hooks');

class StageComparison {
    constructor() {
        this.stages = {
            'Stage 1': {
                name: 'SQLite Basic',
                description: 'Basic SQLite implementation',
                features: ['SQLite database', 'Single instance'],
                url: 'http://localhost:3000',
                expectedRPS: 100
            },
            'Stage 2': {
                name: 'PostgreSQL + Connection Pooling',
                description: 'PostgreSQL with connection pooling',
                features: ['PostgreSQL', 'Connection pooling', 'Single instance'],
                url: 'http://localhost:3000',
                expectedRPS: 500
            },
            'Stage 3': {
                name: 'Load Balancer',
                description: 'NGINX load balancer with 3 app instances',
                features: ['PostgreSQL', 'NGINX load balancer', '3 app instances', 'Session management'],
                url: 'http://localhost:80',
                expectedRPS: 2000
            },
            'Stage 4': {
                name: 'Cache + CDN',
                description: 'Redis cache layer and CDN simulation',
                features: ['PostgreSQL', 'NGINX load balancer', '3 app instances', 'Redis cache', 'CDN simulation', 'Cache warming'],
                url: 'http://localhost:80',
                expectedRPS: 5000
            }
        };

        this.testResults = {};
    }

    async runComparison() {
        console.log('🔍 MiniGram Architecture Stage Comparison');
        console.log('==========================================');
        console.log('Comparing performance across different stages\n');

        // Test current stage (Stage 4)
        await this.testStage('Stage 4', this.stages['Stage 4']);

        // Generate comparison report
        this.generateComparisonReport();
        await this.saveComparisonResults();
    }

    async testStage(stageName, stageConfig) {
        console.log(`🧪 Testing ${stageName}: ${stageConfig.description}`);
        
        try {
            // Check if stage is available
            const healthCheck = await this.checkHealth(stageConfig.url);
            if (!healthCheck.healthy) {
                console.log(`❌ ${stageName} is not available`);
                this.testResults[stageName] = {
                    available: false,
                    error: healthCheck.error
                };
                return;
            }

            // Run performance tests
            const results = await this.runPerformanceTest(stageConfig.url);
            
            this.testResults[stageName] = {
                available: true,
                config: stageConfig,
                performance: results,
                timestamp: new Date().toISOString()
            };

            console.log(`✅ ${stageName} test completed`);
            console.log(`   Average Response Time: ${results.avgResponseTime.toFixed(2)}ms`);
            console.log(`   Requests Per Second: ${results.rps.toFixed(0)}`);
            console.log(`   Success Rate: ${results.successRate.toFixed(1)}%`);
            if (results.cacheHitRatio !== undefined) {
                console.log(`   Cache Hit Ratio: ${results.cacheHitRatio.toFixed(1)}%`);
            }
            console.log('');

        } catch (error) {
            console.log(`❌ ${stageName} test failed: ${error.message}`);
            this.testResults[stageName] = {
                available: false,
                error: error.message
            };
        }
    }

    async checkHealth(baseUrl) {
        try {
            const result = await this.makeRequest(`${baseUrl}/health`);
            return {
                healthy: result.statusCode === 200,
                data: result.data
            };
        } catch (error) {
            return {
                healthy: false,
                error: error.message
            };
        }
    }

    async runPerformanceTest(baseUrl) {
        const testConfig = {
            totalRequests: 200,
            concurrency: 10,
            duration: 30 // seconds
        };

        const endpoints = [
            '/api/posts?page=1&limit=10',
            '/health',
            '/api/instance'
        ];

        console.log(`   Running ${testConfig.totalRequests} requests with ${testConfig.concurrency} concurrent connections...`);

        const results = {
            requests: 0,
            errors: 0,
            totalTime: 0,
            responseTimes: [],
            cacheHits: 0,
            cacheMisses: 0
        };

        const startTime = performance.now();
        const promises = [];
        
        // Create batches to manage concurrency
        for (let i = 0; i < testConfig.totalRequests; i += testConfig.concurrency) {
            const batch = [];
            
            for (let j = 0; j < testConfig.concurrency && (i + j) < testConfig.totalRequests; j++) {
                const endpoint = endpoints[(i + j) % endpoints.length];
                batch.push(this.makeTimedRequest(`${baseUrl}${endpoint}`));
            }
            
            const batchResults = await Promise.allSettled(batch);
            
            batchResults.forEach(result => {
                if (result.status === 'fulfilled') {
                    const data = result.value;
                    results.requests++;
                    results.responseTimes.push(data.duration);
                    results.totalTime += data.duration;
                    
                    // Check for cache information
                    if (data.cached === true || data.cacheHit === true) {
                        results.cacheHits++;
                    } else if (data.cached === false || data.cacheHit === false) {
                        results.cacheMisses++;
                    }
                } else {
                    results.errors++;
                }
            });

            // Small delay between batches
            await this.sleep(100);
        }

        const endTime = performance.now();
        const totalDuration = (endTime - startTime) / 1000; // Convert to seconds

        // Calculate statistics
        const sortedTimes = results.responseTimes.sort((a, b) => a - b);
        const len = sortedTimes.length;

        return {
            totalRequests: results.requests + results.errors,
            successfulRequests: results.requests,
            errors: results.errors,
            successRate: (results.requests / (results.requests + results.errors)) * 100,
            avgResponseTime: results.requests > 0 ? results.totalTime / results.requests : 0,
            minResponseTime: len > 0 ? sortedTimes[0] : 0,
            maxResponseTime: len > 0 ? sortedTimes[len - 1] : 0,
            p50ResponseTime: len > 0 ? sortedTimes[Math.floor(len * 0.5)] : 0,
            p95ResponseTime: len > 0 ? sortedTimes[Math.floor(len * 0.95)] : 0,
            p99ResponseTime: len > 0 ? sortedTimes[Math.floor(len * 0.99)] : 0,
            rps: results.requests / totalDuration,
            testDuration: totalDuration,
            cacheHitRatio: (results.cacheHits + results.cacheMisses) > 0 
                ? (results.cacheHits / (results.cacheHits + results.cacheMisses)) * 100 
                : undefined,
            cacheHits: results.cacheHits,
            cacheMisses: results.cacheMisses
        };
    }

    async makeTimedRequest(url) {
        const startTime = performance.now();
        
        try {
            const result = await this.makeRequest(url);
            const endTime = performance.now();
            
            return {
                duration: endTime - startTime,
                status: result.statusCode,
                cached: result.data?.cached,
                cacheHit: result.data?.cache_hit,
                size: result.size
            };
        } catch (error) {
            const endTime = performance.now();
            throw {
                duration: endTime - startTime,
                error: error.message
            };
        }
    }

    makeRequest(url) {
        return new Promise((resolve, reject) => {
            const parsedUrl = new URL(url);
            
            const options = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || 80,
                path: parsedUrl.pathname + parsedUrl.search,
                method: 'GET',
                headers: {
                    'User-Agent': 'MiniGram-StageComparison/1.0'
                }
            };

            const req = http.request(options, (res) => {
                let data = '';
                let size = 0;

                res.on('data', (chunk) => {
                    data += chunk;
                    size += chunk.length;
                });

                res.on('end', () => {
                    try {
                        let parsed = {};
                        if (res.headers['content-type']?.includes('application/json')) {
                            parsed = JSON.parse(data);
                        }

                        resolve({
                            statusCode: res.statusCode,
                            headers: res.headers,
                            data: parsed,
                            size
                        });
                    } catch (error) {
                        resolve({
                            statusCode: res.statusCode,
                            headers: res.headers,
                            data: data,
                            size
                        });
                    }
                });
            });

            req.on('error', reject);
            req.setTimeout(10000, () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });
            
            req.end();
        });
    }

    generateComparisonReport() {
        console.log('\n📊 STAGE COMPARISON REPORT');
        console.log('===========================');

        // Current stage analysis
        const stage4Results = this.testResults['Stage 4'];
        if (stage4Results && stage4Results.available) {
            console.log('\n🚀 STAGE 4 CURRENT PERFORMANCE:');
            const perf = stage4Results.performance;
            console.log(`   Average Response Time: ${perf.avgResponseTime.toFixed(2)}ms`);
            console.log(`   Requests Per Second: ${perf.rps.toFixed(0)}`);
            console.log(`   95th Percentile: ${perf.p95ResponseTime.toFixed(2)}ms`);
            console.log(`   Success Rate: ${perf.successRate.toFixed(1)}%`);
            if (perf.cacheHitRatio !== undefined) {
                console.log(`   Cache Hit Ratio: ${perf.cacheHitRatio.toFixed(1)}%`);
            }
        }

        // Theoretical comparison based on architectural improvements
        console.log('\n📈 THEORETICAL PERFORMANCE PROGRESSION:');
        Object.keys(this.stages).forEach(stageName => {
            const stage = this.stages[stageName];
            const status = this.testResults[stageName]?.available ? '✅' : '⚪';
            console.log(`\n${status} ${stageName}: ${stage.name}`);
            console.log(`   Description: ${stage.description}`);
            console.log(`   Expected RPS: ~${stage.expectedRPS}`);
            console.log(`   Key Features:`);
            stage.features.forEach(feature => {
                console.log(`     • ${feature}`);
            });
        });

        // Improvement analysis
        console.log('\n🎯 ARCHITECTURAL IMPROVEMENTS:');
        console.log('\nStage 1 → 2: Database Upgrade');
        console.log('   • SQLite → PostgreSQL: Better concurrency & performance');
        console.log('   • Connection pooling: Reduced connection overhead');
        console.log('   • Expected improvement: 5x RPS');

        console.log('\nStage 2 → 3: Horizontal Scaling');
        console.log('   • Load balancer: Distribute traffic across instances');
        console.log('   • 3x app instances: Parallel request processing');
        console.log('   • Session management: Stateless application design');
        console.log('   • Expected improvement: 4x RPS');

        console.log('\nStage 3 → 4: Caching & CDN');
        console.log('   • Redis cache: Reduce database load');
        console.log('   • CDN simulation: Faster static asset delivery');
        console.log('   • Cache warming: Proactive cache population');
        console.log('   • Multi-layer caching: NGINX + Redis');
        console.log('   • Expected improvement: 2.5x RPS');

        // Overall progression
        console.log('\n📊 OVERALL PROGRESSION:');
        console.log('   Stage 1: ~100 RPS (baseline)');
        console.log('   Stage 2: ~500 RPS (5x improvement)');
        console.log('   Stage 3: ~2,000 RPS (4x improvement)');
        console.log('   Stage 4: ~5,000 RPS (2.5x improvement)');
        console.log('   Total: 50x improvement from Stage 1 to Stage 4');
    }

    async saveComparisonResults() {
        const reportData = {
            timestamp: new Date().toISOString(),
            stages: this.stages,
            testResults: this.testResults,
            summary: {
                totalStagesTested: Object.keys(this.testResults).length,
                availableStages: Object.values(this.testResults).filter(r => r.available).length
            }
        };

        const reportsDir = path.join(__dirname, '../reports');
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
        }

        const filename = `stage-comparison-${new Date().toISOString().replace(/:/g, '-')}.json`;
        const filepath = path.join(reportsDir, filename);
        
        fs.writeFileSync(filepath, JSON.stringify(reportData, null, 2));
        console.log(`\n💾 Comparison results saved to: ${filepath}`);
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// CLI execution
if (require.main === module) {
    const comparison = new StageComparison();
    comparison.runComparison().catch(error => {
        console.error('Stage comparison failed:', error);
        process.exit(1);
    });
}

module.exports = StageComparison;
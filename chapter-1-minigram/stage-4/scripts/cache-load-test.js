#!/usr/bin/env node

/**
 * MiniGram Stage 4 - Cache Performance Load Testing
 * 
 * This script performs load testing to demonstrate the performance
 * improvements achieved with Redis caching and CDN in Stage 4.
 * 
 * Features:
 * - Tests cached vs non-cached performance
 * - Measures response times and throughput
 * - Generates detailed performance reports
 * - Compares Stage 4 with previous stages
 */

const http = require('http');
const https = require('https');
const { performance } = require('perf_hooks');
const fs = require('fs');
const path = require('path');

class CacheLoadTester {
    constructor(config = {}) {
        this.config = {
            baseUrl: config.baseUrl || 'http://localhost',
            port: config.port || 80,
            concurrency: config.concurrency || 10,
            totalRequests: config.totalRequests || 1000,
            warmupRequests: config.warmupRequests || 100,
            testDuration: config.testDuration || 60, // seconds
            ...config
        };

        this.results = {
            cached: {
                requests: 0,
                totalTime: 0,
                errors: 0,
                responseTimes: [],
                cacheHits: 0,
                cacheMisses: 0
            },
            uncached: {
                requests: 0,
                totalTime: 0,
                errors: 0,
                responseTimes: [],
                cacheHits: 0,
                cacheMisses: 0
            },
            static: {
                requests: 0,
                totalTime: 0,
                errors: 0,
                responseTimes: []
            }
        };

        this.testEndpoints = [
            { path: '/api/posts?page=1&limit=10', type: 'api', cacheable: true },
            { path: '/api/posts?page=2&limit=10', type: 'api', cacheable: true },
            { path: '/api/users/1', type: 'api', cacheable: true },
            { path: '/health', type: 'api', cacheable: false },
            { path: '/api/instance', type: 'api', cacheable: true },
            { path: '/static/styles.css', type: 'static', cacheable: true },
            { path: '/static/app.js', type: 'static', cacheable: true }
        ];
    }

    async runLoadTest() {
        console.log('🚀 Starting MiniGram Stage 4 Cache Load Test');
        console.log('================================================');
        console.log(`Base URL: ${this.config.baseUrl}:${this.config.port}`);
        console.log(`Concurrency: ${this.config.concurrency}`);
        console.log(`Total Requests: ${this.config.totalRequests}`);
        console.log(`Test Duration: ${this.config.testDuration}s\n`);

        try {
            // Step 1: Warm up the cache
            await this.warmupCache();

            // Step 2: Test with fresh cache (cache misses)
            console.log('🧪 Testing uncached performance (fresh cache)...');
            await this.invalidateCache();
            await this.runTestPhase('uncached');

            // Step 3: Test with warmed cache (cache hits)
            console.log('\n🔥 Warming cache and testing cached performance...');
            await this.warmCache();
            await this.sleep(2000); // Allow cache warming to complete
            await this.runTestPhase('cached');

            // Step 4: Test static assets (CDN performance)
            console.log('\n📦 Testing static asset delivery (CDN)...');
            await this.runStaticAssetTest();

            // Step 5: Generate and display results
            this.generateReport();
            await this.saveResults();

        } catch (error) {
            console.error('Load test failed:', error);
            process.exit(1);
        }
    }

    async warmupCache() {
        console.log('🔄 Warming up cache...');
        const warmupPromises = [];
        
        for (let i = 0; i < this.config.warmupRequests; i++) {
            const endpoint = this.testEndpoints[i % this.testEndpoints.length];
            warmupPromises.push(this.makeRequest(endpoint.path));
        }

        await Promise.all(warmupPromises);
        console.log(`✅ Completed ${this.config.warmupRequests} warmup requests\n`);
    }

    async runTestPhase(phase) {
        const startTime = Date.now();
        const endTime = startTime + (this.config.testDuration * 1000);
        const activeRequests = new Set();
        
        let requestCount = 0;
        const maxConcurrency = this.config.concurrency;

        while (Date.now() < endTime && requestCount < this.config.totalRequests) {
            // Maintain concurrency level
            while (activeRequests.size < maxConcurrency && Date.now() < endTime && requestCount < this.config.totalRequests) {
                const endpoint = this.testEndpoints[requestCount % this.testEndpoints.length];
                
                const requestPromise = this.makeTimedRequest(endpoint.path, phase)
                    .then(result => {
                        this.recordResult(result, phase);
                        activeRequests.delete(requestPromise);
                    })
                    .catch(error => {
                        this.results[phase].errors++;
                        activeRequests.delete(requestPromise);
                        console.error(`Request error in ${phase}:`, error.message);
                    });

                activeRequests.add(requestPromise);
                requestCount++;

                // Small delay to prevent overwhelming
                if (requestCount % 10 === 0) {
                    await this.sleep(10);
                }
            }

            // Wait for some requests to complete
            if (activeRequests.size >= maxConcurrency) {
                await Promise.race(Array.from(activeRequests));
            }
        }

        // Wait for all remaining requests
        await Promise.all(Array.from(activeRequests));
        
        const duration = (Date.now() - startTime) / 1000;
        console.log(`✅ ${phase} phase completed: ${this.results[phase].requests} requests in ${duration.toFixed(2)}s`);
    }

    async runStaticAssetTest() {
        const staticEndpoints = this.testEndpoints.filter(e => e.type === 'static');
        const promises = [];

        for (let i = 0; i < 100; i++) {
            const endpoint = staticEndpoints[i % staticEndpoints.length];
            promises.push(this.makeTimedRequest(endpoint.path, 'static'));
        }

        const results = await Promise.all(promises);
        results.forEach(result => this.recordResult(result, 'static'));
    }

    async makeTimedRequest(path, phase = 'test') {
        const startTime = performance.now();
        
        try {
            const result = await this.makeRequest(path);
            const endTime = performance.now();
            
            return {
                path,
                duration: endTime - startTime,
                status: result.statusCode,
                cached: result.cached,
                cacheHit: result.cacheHit,
                cacheStatus: result.cacheStatus,
                size: result.size,
                phase
            };
        } catch (error) {
            const endTime = performance.now();
            return {
                path,
                duration: endTime - startTime,
                status: 0,
                error: error.message,
                phase
            };
        }
    }

    makeRequest(path) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: this.config.baseUrl.replace(/https?:\/\//, ''),
                port: this.config.port,
                path: path,
                method: 'GET',
                headers: {
                    'User-Agent': 'MiniGram-LoadTester/1.0',
                    'Accept': '*/*',
                    'Connection': 'keep-alive'
                }
            };

            const client = this.config.baseUrl.startsWith('https') ? https : http;
            
            const req = client.request(options, (res) => {
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
                            size,
                            cached: parsed.cached || false,
                            cacheHit: parsed.cache_hit || false,
                            cacheStatus: res.headers['x-cache-status'] || 'UNKNOWN'
                        });
                    } catch (error) {
                        resolve({
                            statusCode: res.statusCode,
                            headers: res.headers,
                            data: data,
                            size,
                            cached: false,
                            cacheHit: false,
                            cacheStatus: res.headers['x-cache-status'] || 'UNKNOWN'
                        });
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.setTimeout(10000, () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            req.end();
        });
    }

    recordResult(result, phase) {
        if (result.status === 0) {
            this.results[phase].errors++;
            return;
        }

        this.results[phase].requests++;
        this.results[phase].totalTime += result.duration;
        this.results[phase].responseTimes.push(result.duration);

        if (result.cacheHit) {
            this.results[phase].cacheHits++;
        } else {
            this.results[phase].cacheMisses++;
        }
    }

    async warmCache() {
        try {
            await this.makeRequest('/api/cache/warm');
            console.log('🔥 Cache warmed successfully');
        } catch (error) {
            console.warn('Cache warming failed:', error.message);
        }
    }

    async invalidateCache() {
        try {
            const result = await this.makeRequest('/api/cache/invalidate');
            console.log('🗑️ Cache invalidated successfully');
        } catch (error) {
            console.warn('Cache invalidation failed:', error.message);
        }
    }

    calculateStats(responseTimes) {
        if (responseTimes.length === 0) return {};

        const sorted = responseTimes.sort((a, b) => a - b);
        const len = sorted.length;

        return {
            min: sorted[0],
            max: sorted[len - 1],
            avg: responseTimes.reduce((a, b) => a + b, 0) / len,
            p50: sorted[Math.floor(len * 0.5)],
            p95: sorted[Math.floor(len * 0.95)],
            p99: sorted[Math.floor(len * 0.99)]
        };
    }

    generateReport() {
        console.log('\n📊 LOAD TEST RESULTS');
        console.log('=====================================');

        Object.keys(this.results).forEach(phase => {
            const result = this.results[phase];
            const stats = this.calculateStats(result.responseTimes);
            
            console.log(`\n🔍 ${phase.toUpperCase()} PHASE:`);
            console.log(`   Requests: ${result.requests}`);
            console.log(`   Errors: ${result.errors}`);
            console.log(`   Success Rate: ${((result.requests / (result.requests + result.errors)) * 100).toFixed(2)}%`);
            
            if (result.requests > 0) {
                console.log(`   Avg Response Time: ${stats.avg?.toFixed(2)}ms`);
                console.log(`   Min Response Time: ${stats.min?.toFixed(2)}ms`);
                console.log(`   Max Response Time: ${stats.max?.toFixed(2)}ms`);
                console.log(`   95th Percentile: ${stats.p95?.toFixed(2)}ms`);
                console.log(`   99th Percentile: ${stats.p99?.toFixed(2)}ms`);
                
                if (result.cacheHits > 0 || result.cacheMisses > 0) {
                    const hitRatio = (result.cacheHits / (result.cacheHits + result.cacheMisses) * 100);
                    console.log(`   Cache Hit Ratio: ${hitRatio.toFixed(1)}%`);
                    console.log(`   Cache Hits: ${result.cacheHits}`);
                    console.log(`   Cache Misses: ${result.cacheMisses}`);
                }
            }
        });

        // Performance comparison
        if (this.results.cached.requests > 0 && this.results.uncached.requests > 0) {
            const cachedStats = this.calculateStats(this.results.cached.responseTimes);
            const uncachedStats = this.calculateStats(this.results.uncached.responseTimes);
            
            const improvement = ((uncachedStats.avg - cachedStats.avg) / uncachedStats.avg * 100);
            
            console.log('\n🚀 PERFORMANCE IMPROVEMENT:');
            console.log(`   Cached avg: ${cachedStats.avg?.toFixed(2)}ms`);
            console.log(`   Uncached avg: ${uncachedStats.avg?.toFixed(2)}ms`);
            console.log(`   Speed improvement: ${improvement.toFixed(1)}%`);
            console.log(`   Performance ratio: ${(uncachedStats.avg / cachedStats.avg).toFixed(2)}x faster`);
        }
    }

    async saveResults() {
        const reportData = {
            timestamp: new Date().toISOString(),
            config: this.config,
            results: this.results,
            summary: {
                totalRequests: Object.values(this.results).reduce((sum, r) => sum + r.requests, 0),
                totalErrors: Object.values(this.results).reduce((sum, r) => sum + r.errors, 0),
                averageResponseTimes: Object.keys(this.results).reduce((acc, phase) => {
                    const stats = this.calculateStats(this.results[phase].responseTimes);
                    acc[phase] = stats.avg;
                    return acc;
                }, {})
            }
        };

        const reportsDir = path.join(__dirname, '../reports');
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
        }

        const filename = `cache-load-test-${new Date().toISOString().replace(/:/g, '-')}.json`;
        const filepath = path.join(reportsDir, filename);
        
        fs.writeFileSync(filepath, JSON.stringify(reportData, null, 2));
        console.log(`\n💾 Results saved to: ${filepath}`);
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// CLI execution
if (require.main === module) {
    const config = {
        baseUrl: process.env.TEST_URL || 'http://localhost',
        port: parseInt(process.env.TEST_PORT) || 80,
        concurrency: parseInt(process.env.CONCURRENCY) || 10,
        totalRequests: parseInt(process.env.TOTAL_REQUESTS) || 500,
        testDuration: parseInt(process.env.TEST_DURATION) || 30
    };

    const tester = new CacheLoadTester(config);
    tester.runLoadTest().catch(error => {
        console.error('Load test failed:', error);
        process.exit(1);
    });
}

module.exports = CacheLoadTester;
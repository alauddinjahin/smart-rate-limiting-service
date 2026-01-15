const { testScenarios } = require('./testScenarios');
const { MockRedis } = require('./mockRedis');
const RateLimiter = require('./../src/core/rateLimiter');

const logger = require('../src/utils/logger');
const { MockCacheRepository } = require('./mocks/mockCache');
const { MockMetricsService } = require('./mocks/mockMetrics');

// Suppress logs during testing
logger.level = 'error';

class RateLimiterTestRunner {
  constructor() {
    this.results = [];
    this.passedTests = 0;
    this.failedTests = 0;
  }

  async runScenario(scenario, mockRedis, rateLimiter) {
    console.log(`\n - Running: ${scenario.name}`);
    console.log(`    ${scenario.description}`);

    const startTime = Date.now();
    let passed = 0;
    let failed = 0;
    const errors = [];

    try {
      let lastTimeOffset = 0;

      for (let i = 0; i < scenario.requests.length; i++) {
        const request = scenario.requests[i];

        // Handle time advancement for deterministic testing
        if (request.timeOffset !== undefined) {
          const timeDelta = request.timeOffset - lastTimeOffset;
          if (timeDelta > 0 && mockRedis.deterministic) {
            mockRedis.advanceTime(timeDelta);
          } else if (timeDelta > 0) {
            await this._simulateDelay(timeDelta);
          }
          lastTimeOffset = request.timeOffset;
        }

        // Handle configuration changes
        if (request.configChange) {
          rateLimiter.updateConfig(request.tier, request.endpoint, request.configChange);
        }

        // Simulate Redis failure
        if (request.simulateRedisFailure) {
          mockRedis.failures.eval = 1.0; // 100% failure rate
          mockRedis.emit('error', new Error('Simulated Redis failure'));
          // Give circuit breaker time to open
          await this._simulateDelay(100);
        }

        // Make rate limit check
        const result = await rateLimiter.checkLimit(
          request.userId,
          request.endpoint,
          request.tier,
          request.countryCode,
          {
            tier: request.tier,
            countryCode: request.countryCode,
            userCreatedAt: request.userCreatedAt,
            cost: request.cost
          }
        );

        // Verify expectations
        if (request.expectedAllowed !== undefined) {
          if (result.allowed === request.expectedAllowed) {
            passed++;
          } else {
            failed++;
            errors.push({
              requestIndex: i,
              type: 'allowed',
              expected: request.expectedAllowed,
              actual: result.allowed,
              result
            });
          }
        }

        if (request.expectedFallback !== undefined) {
          if (result.fallback === request.expectedFallback) {
            passed++;
          } else {
            failed++;
            errors.push({
              requestIndex: i,
              type: 'fallback',
              expected: request.expectedFallback,
              actual: result.fallback
            });
          }
        }
      }

      const duration = Date.now() - startTime;
      const totalChecks = passed + failed;
      const success = failed === 0;

      const scenarioResult = {
        name: scenario.name,
        success,
        passed,
        failed,
        total: totalChecks,
        duration: `${duration}ms`,
        errors: errors.slice(0, 5)
      };

      this.results.push(scenarioResult);

      if (success) {
        this.passedTests++;
        console.log(`✅ PASSED (${passed}/${totalChecks} checks) - ${duration}ms`);
      } else {
        this.failedTests++;
        console.log(`❌ FAILED (${passed}/${totalChecks} checks) - ${duration}ms`);
        if (errors.length > 0) {
          console.log(`   First errors:`, errors.slice(0, 3));
        }
      }
    } catch (error) {
      this.failedTests++;
      console.log(`❌ ERROR: ${error.message}`);
      this.results.push({
        name: scenario.name,
        success: false,
        error: error.message,
        stack: error.stack
      });
    }
  }

  async _simulateDelay(ms) {
    if (ms > 0 && ms < 100) {
      await new Promise(resolve => setTimeout(resolve, ms));
    }
  }

  async runConcurrentTest(scenario, rateLimiter) {
    console.log(`\n - Running: ${scenario.name} (Concurrent)`);

    const startTime = Date.now();
    const promises = scenario.requests.map(request =>
      rateLimiter.checkLimit(
        request.userId,
        request.endpoint,
        request.tier,
        request.countryCode,
        { tier: request.tier, countryCode: request.countryCode }
      )
    );

    try {
      const results = await Promise.all(promises);
      const allowed = results.filter(r => r.allowed).length;
      const blocked = results.filter(r => !r.allowed).length;

      const duration = Date.now() - startTime;

      console.log(`✅ COMPLETED - ${allowed} allowed, ${blocked} blocked - ${duration}ms`);
      console.log(`   Concurrency test: ${results.length} simultaneous requests`);

      this.passedTests++;
      this.results.push({
        name: scenario.name,
        success: true,
        allowed,
        blocked,
        total: results.length,
        duration: `${duration}ms`
      });
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}`);
      this.failedTests++;
      this.results.push({
        name: scenario.name,
        success: false,
        error: error.message
      });
    }
  }

  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Scenarios: ${this.passedTests + this.failedTests}`);
    console.log(`✅ Passed: ${this.passedTests}`);
    console.log(`❌ Failed: ${this.failedTests}`);
    console.log(
      `Success Rate: ${((this.passedTests / (this.passedTests + this.failedTests)) * 100).toFixed(1)}%`
    );
    console.log('='.repeat(60));

    if (this.failedTests > 0) {
      console.log('\nFailed Tests:');
      this.results.filter(r => !r.success).forEach(result => {
        console.log(`   - ${result.name}`);
        if (result.errors && result.errors.length > 0) {
          console.log(`     Errors: ${result.errors.length}`);
        }
      });
    }
  }

  getResults() {
    return {
      passed: this.passedTests,
      failed: this.failedTests,
      total: this.passedTests + this.failedTests,
      details: this.results
    };
  }
}

async function performanceTest(rateLimiter) {
  console.log('\n------------- PERFORMANCE TEST -------------');
  console.log('='.repeat(60));

  const iterations = 10000;
  const startTime = Date.now();

  for (let i = 0; i < iterations; i++) {
    await rateLimiter.checkLimit(
      `user${i % 100}`,
      '/api/search',
      'free',
      'US',
      { tier: 'free', countryCode: 'US' }
    );
  }

  const duration = Date.now() - startTime;
  const rps = Math.floor(iterations / (duration / 1000));

  console.log(`Processed ${iterations} requests in ${duration}ms`);
  console.log(`Throughput: ${rps} requests/second`);
  console.log(`Average latency: ${(duration / iterations).toFixed(2)}ms per request`);

  const callCount = rateLimiter.redisRepository?.redis?.getCallCount?.() ?? 'N/A';
  console.log(`Redis calls: ${callCount}`);
  if (callCount !== 'N/A') {
    console.log(`Efficiency: ${(iterations / callCount).toFixed(2)} requests per Redis call`);
  }
}

async function runAllTests() {
  console.log('\n Starting Rate Limiter Tests\n');

  const runner = new RateLimiterTestRunner();

  // Run each scenario with fresh instances
  for (const scenario of testScenarios) {
    // Create fresh instances for each test
    const mockRedis = new MockRedis({
      failures: {},
      latency: { min: 0, max: 2 },
      deterministic: true
    });

    const mockCache = new MockCacheRepository();
    const mockMetrics = new MockMetricsService();

    const rateLimiter = new RateLimiter(
      mockRedis,
      mockCache,
      mockMetrics,
      {
        slowStart: {
          enabled: true,
          duration: 7 * 24 * 3600,
          startMultiplier: 0.3
        },
        circuitBreakerThreshold: 3,
        circuitBreakerTimeout: 5000
      }
    );

    if (scenario.requests.some(r => r.concurrent)) {
      await runner.runConcurrentTest(scenario, rateLimiter);
    } else {
      await runner.runScenario(scenario, mockRedis, rateLimiter);
    }

    // Cleanup
    await rateLimiter.shutdown();
  }

  // Performance test with non-deterministic Redis
  const perfRedis = new MockRedis({
    failures: {},
    latency: { min: 0, max: 0 },
    deterministic: false
  });

  const perfCache = new MockCacheRepository();
  const perfMetrics = new MockMetricsService();

  const perfLimiter = new RateLimiter(
    perfRedis,
    perfCache,
    perfMetrics
  );

  await performanceTest(perfLimiter);

  // Analytics test
  console.log('\n-------------- ANALYTICS TEST ----------------');
  console.log('='.repeat(60));
  const metrics = perfMetrics.getMetrics();
  console.log('Metrics:', JSON.stringify(metrics, null, 2));

  await perfLimiter.shutdown();

  // Print summary
  runner.printSummary();

  return runner.getResults();
}

if (require.main === module) {
  runAllTests()
    .then(results => process.exit(results.failed > 0 ? 1 : 0))
    .catch(error => {
      console.error('Test runner failed:', error);
      process.exit(1);
    });
}

module.exports = {
  runAllTests,
  RateLimiterTestRunner,
  performanceTest
};
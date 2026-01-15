class MockMetricsService {
  constructor() {
    this.data = {
      totalChecks: 0,
      allowed: 0,
      blocked: 0,
      errors: 0,
      fallback: 0
    };
  }

  recordRateLimitCheck({ allowed, fallback = false }) {
    this.data.totalChecks++;

    if (allowed) this.data.allowed++;
    else this.data.blocked++;

    if (fallback) this.data.fallback++;
  }

  recordError() {
    this.data.errors++;
  }

  getMetrics() {
    return this.data;
  }

  reset() {
    this.data = {
      totalChecks: 0,
      allowed: 0,
      blocked: 0,
      errors: 0,
      fallback: 0
    };
  }
}

module.exports = { MockMetricsService };

class MockRedis {
  constructor(options = {}) {
    this.data = new Map();
    this.callCount = 0;
    this.failures = options.failures || {};
    this.latency = options.latency || { min: 0, max: 2 };
    this.connected = true;
    this.eventHandlers = {};
    this.deterministic = options.deterministic || false;
    this._fixedNow = Date.now();
    this.status = 'ready';
    this._failureCount = 0;
  }

  on(event, handler) {
    if (!this.eventHandlers[event]) this.eventHandlers[event] = [];
    this.eventHandlers[event].push(handler);
  }

  emit(event, ...args) {
    (this.eventHandlers[event] || []).forEach(h => h(...args));
  }

  async _delay() {
    if (!this.deterministic) {
      const delay = Math.random() * (this.latency.max - this.latency.min) + this.latency.min;
      await new Promise(r => setTimeout(r, delay));
    }
  }

  async eval(script, numKeys, ...args) {
    this.callCount++;

    if (this.failures.eval && Math.random() < this.failures.eval) {
      this._failureCount++;
      this.status = 'error';
      this.emit('error', new Error('Redis connection failed'));
      throw new Error('Redis EVAL failed');
    }

    await this._delay();

    const keys = args.slice(0, numKeys);
    const argv = args.slice(numKeys);

    const [slidingKey, tokenKey, burstKey] = keys;
    const [now, windowStart, maxRequests, burstLimit, windowSeconds, cost, refillRate] = argv.map(Number);

    const currentNow = this.deterministic ? this._fixedNow : now;

    // Initialize storage
    if (!this.data.has(slidingKey)) this.data.set(slidingKey, new Set());
    if (!this.data.has(tokenKey)) {
      this.data.set(tokenKey, { 
        tokens: maxRequests, 
        last_refill: currentNow 
      });
    }
    if (!this.data.has(burstKey)) this.data.set(burstKey, 0);

    const slidingSet = this.data.get(slidingKey);
    
    // Remove expired entries from sliding window
    const filtered = new Set([...slidingSet].filter(ts => ts > windowStart));
    this.data.set(slidingKey, filtered);

    const tokenData = this.data.get(tokenKey);
    
    // Calculate token refill
    const timePassed = (currentNow - tokenData.last_refill) / 1000;
    let tokens = Math.min(maxRequests, tokenData.tokens + timePassed * refillRate);

    let burstUsed = this.data.get(burstKey);

    let allowed = 0;
    let remaining = 0;
    let retryAfter = 0;

    // CRITICAL FIX: Burst is NOT additional capacity beyond max
    // Instead, burst allows temporary exceeding of steady rate, but total is still capped
    // Total sliding window count should never exceed (maxRequests + burstLimit)
    const currentCount = filtered.size;
    const totalCapacity = maxRequests + burstLimit;

    if (tokens >= cost) {
      // Normal path: use tokens
      tokens -= cost;
      allowed = 1;
      remaining = Math.floor(tokens);
      slidingSet.add(currentNow);
    } else if (currentCount + cost <= totalCapacity) {
      // Burst path: we've run out of tokens but haven't hit total capacity yet
      // This means we're borrowing from future capacity (burst)
      const burstNeeded = cost - tokens;
      burstUsed += burstNeeded;
      this.data.set(burstKey, burstUsed);
      
      // Consume remaining tokens
      tokens = 0;
      
      allowed = 1;
      remaining = 0;
      slidingSet.add(currentNow);
    } else {
      // Rate limited: hit total capacity
      allowed = 0;
      remaining = 0;
      retryAfter = Math.ceil((cost - tokens) / refillRate);
    }

    // Update token bucket state
    this.data.set(tokenKey, { 
      tokens, 
      last_refill: currentNow 
    });

    this._failureCount = 0;
    this.status = 'ready';

    return [allowed, remaining, retryAfter, filtered.size];
  }

  async checkRateLimit(userId, endpoint, config, cost = 1) {
    const now = this.deterministic ? this._fixedNow : Date.now();
    const slidingKey = `sliding:${userId}:${endpoint}`;
    const tokenKey = `tokens:${userId}:${endpoint}`;
    const burstKey = `burst:${userId}:${endpoint}`;
    const windowStart = now - config.window * 1000;

    const [allowed, remaining, retryAfter] = await this.eval(
      'script', 3, slidingKey, tokenKey, burstKey,
      now, windowStart, config.max, config.burst, config.window, cost, config.refillRate
    );

    return {
      allowed: Boolean(allowed),
      remaining,
      retryAfter,
      fallback: false
    };
  }

  async del(...keys) {
    keys.forEach(k => this.data.delete(k));
    return keys.length;
  }

  async reset(userId, endpoint) {
    const keys = [
      `sliding:${userId}:${endpoint}`, 
      `tokens:${userId}:${endpoint}`, 
      `burst:${userId}:${endpoint}`
    ];
    keys.forEach(k => this.data.delete(k));
  }

  async quit() {
    this.data.clear();
    this.connected = false;
    this.status = 'end';
    this.emit('end');
  }

  async disconnect() {
    this.data.clear();
    this.connected = false;
    this.status = 'end';
  }

  resetAll() {
    this.data.clear();
    this.callCount = 0;
    this._failureCount = 0;
    this.status = 'ready';
  }

  getCallCount() {
    return this.callCount;
  }

  advanceTime(ms) {
    if (this.deterministic) {
      this._fixedNow += ms;
    }
  }
}

module.exports = { MockRedis };
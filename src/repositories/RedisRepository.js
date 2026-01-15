const logger = require('../utils/logger');

/**
 * Redis Repository
 * 
 * Design Pattern: Repository pattern
 * Purpose: Encapsulate all Redis operations
 * Benefits: Easy to test, swap implementations
 * 
 * @class RedisRepository
 */
class RedisRepository {
  /**
   * @param {Object} redisClient - IORedis client instance
   */
  constructor(redisClient) {
    this.redis = redisClient;
    this.connected = false;
    
    this._setupEventListeners();
  }

  /**
   * Setup Redis event listeners
   * @private
   */
  _setupEventListeners() {
    this.redis.on('connect', () => {
      this.connected = true;
      logger.info('Redis connected');
    });

    this.redis.on('error', (error) => {
      this.connected = false;
      logger.error('Redis error', { error: error.message });
    });

    this.redis.on('close', () => {
      this.connected = false;
      logger.warn('Redis connection closed');
    });
  }

  /**
   * Check rate limit using atomic Lua script
   * 
   * Task 1: Token bucket + Sliding window
   * Task 2: Race condition handling (atomic operation)
   * Task 4: Single Redis call optimization
   * 
   * @param {string} userId - User identifier
   * @param {string} endpoint - API endpoint
   * @param {Object} config - Rate limit configuration
   * @param {number} cost - Request cost
   * @returns {Promise<Object>} Rate limit result
   */
  async checkRateLimit(userId, endpoint, config, cost = 1) {
    const now = Date.now();
    const windowStart = now - (config.window * 1000);
    
    // Redis key design (best practice: hierarchical, namespaced)
    const keys = [
      `ratelimit:sliding:${userId}:${endpoint}`,   // Sliding window
      `ratelimit:token:${userId}:${endpoint}`,     // Token bucket state
      `ratelimit:burst:${userId}:${endpoint}`      // Burst tracking
    ];

    /**
     * Lua script for atomic rate limiting
     * 
     * Why Lua?
     * 1. Atomic execution (no race conditions)
     * 2. Single network round-trip (performance)
     * 3. Guaranteed consistency
     * 
     * Trade-off: Complex script vs. correctness
     * Decision: Correctness wins at scale
     */
    const luaScript = `
      local sliding_key = KEYS[1]
      local token_key = KEYS[2]
      local burst_key = KEYS[3]
      
      local now = tonumber(ARGV[1])
      local window_start = tonumber(ARGV[2])
      local max_requests = tonumber(ARGV[3])
      local burst_limit = tonumber(ARGV[4])
      local window_seconds = tonumber(ARGV[5])
      local cost = tonumber(ARGV[6])
      local refill_rate = tonumber(ARGV[7])
      
      -- Clean old entries from sliding window
      redis.call('ZREMRANGEBYSCORE', sliding_key, '-inf', window_start)
      local current_count = redis.call('ZCARD', sliding_key)
      
      -- Get token bucket state
      local token_data = redis.call('HMGET', token_key, 'tokens', 'last_refill')
      local tokens = tonumber(token_data[1]) or max_requests
      local last_refill = tonumber(token_data[2]) or now
      
      -- Refill tokens based on time passed
      local time_passed = (now - last_refill) / 1000
      local tokens_to_add = time_passed * refill_rate
      tokens = math.min(max_requests, tokens + tokens_to_add)
      
      -- Get burst usage
      local burst_used = tonumber(redis.call('GET', burst_key)) or 0
      local burst_available = burst_limit - burst_used
      
      -- Decision logic
      local allowed = 0
      local remaining = 0
      local retry_after = 0
      
      if tokens >= cost then
        -- Normal rate limiting (enough tokens)
        tokens = tokens - cost
        allowed = 1
        remaining = math.floor(tokens)
        
        -- Record in sliding window
        redis.call('ZADD', sliding_key, now, now .. ':' .. math.random(1000000))
        redis.call('EXPIRE', sliding_key, window_seconds)
        
      elseif burst_available >= cost then
        -- Use burst capacity
        burst_used = burst_used + cost
        redis.call('SET', burst_key, burst_used, 'EX', window_seconds)
        allowed = 1
        remaining = 0
        
        -- Record in sliding window
        redis.call('ZADD', sliding_key, now, now .. ':' .. math.random(1000000))
        redis.call('EXPIRE', sliding_key, window_seconds)
        
      else
        -- Rate limited
        allowed = 0
        remaining = 0
        retry_after = math.ceil((cost - tokens) / refill_rate)
      end
      
      -- Update token bucket state
      redis.call('HMSET', token_key, 'tokens', tokens, 'last_refill', now)
      redis.call('EXPIRE', token_key, window_seconds)
      
      return {allowed, remaining, retry_after, current_count}
    `;

    try {
      // Execute Lua script atomically
      const result = await this.redis.eval(
        luaScript,
        3, // Number of keys
        ...keys,
        now,
        windowStart,
        config.max,
        config.burst,
        config.window,
        cost,
        config.refillRate
      );

      const [allowed, remaining, retryAfter, currentCount] = result;

      return {
        allowed: allowed === 1,
        remaining,
        retryAfter,
        currentCount,
        source: 'redis'
      };

    } catch (error) {
      logger.error('Redis rate limit check failed', {
        error: error.message,
        userId,
        endpoint
      });
      throw error;
    }
  }

  /**
   * Reset rate limit for a user
   * 
   * @param {string} userId - User ID
   * @param {string} endpoint - Endpoint
   */
  async reset(userId, endpoint) {
    const keys = [
      `ratelimit:sliding:${userId}:${endpoint}`,
      `ratelimit:token:${userId}:${endpoint}`,
      `ratelimit:burst:${userId}:${endpoint}`
    ];

    await this.redis.del(...keys);
    logger.info('Rate limit reset', { userId, endpoint });
  }

  /**
   * Get current rate limit state (for debugging)
   * 
   * @param {string} userId - User ID
   * @param {string} endpoint - Endpoint
   * @returns {Promise<Object>} Current state
   */
  async getState(userId, endpoint) {
    const tokenKey = `ratelimit:token:${userId}:${endpoint}`;
    const slidingKey = `ratelimit:sliding:${userId}:${endpoint}`;
    const burstKey = `ratelimit:burst:${userId}:${endpoint}`;

    const [tokenData, slidingCount, burstUsed] = await Promise.all([
      this.redis.hgetall(tokenKey),
      this.redis.zcard(slidingKey),
      this.redis.get(burstKey)
    ]);

    return {
      tokens: parseFloat(tokenData.tokens) || 0,
      lastRefill: parseInt(tokenData.last_refill) || 0,
      slidingCount,
      burstUsed: parseInt(burstUsed) || 0
    };
  }

  /**
   * Check if Redis is connected
   * @returns {boolean}
   */
  isConnected() {
    return this.connected && this.redis.status === 'ready';
  }

  /**
   * Disconnect from Redis
   */
  async disconnect() {
    await this.redis.quit();
    logger.info('Redis disconnected');
  }
}

module.exports = RedisRepository;


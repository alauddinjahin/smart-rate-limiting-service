const CircuitState = {
  CLOSED: 'CLOSED',     // Normal operation
  OPEN: 'OPEN',         // Failing, reject requests
  HALF_OPEN: 'HALF_OPEN' // Testing if service recovered
};

/**
 * Circuit Breaker Pattern
 * 
 * Purpose: Prevent cascade failures when Redis is down
 * 
 * States:
 * - CLOSED: Normal operation, pass all requests
 * - OPEN: Too many failures, reject all requests
 * - HALF_OPEN: Testing recovery, allow limited requests
 * 
 * @class CircuitBreaker
 */
class CircuitBreaker {
  /**
   * @param {Object} config - Configuration
   * @param {number} config.failureThreshold - Failures before opening
   * @param {number} config.resetTimeout - Time before trying again (ms)
   * @param {number} config.monitoringPeriod - Period to track failures (ms)
   */
  constructor(config = {}) {
    this.failureThreshold = config.failureThreshold || 5;
    this.resetTimeout = config.resetTimeout || 60000; // 1 minute
    this.monitoringPeriod = config.monitoringPeriod || 10000; // 10 seconds
    
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
  }

  /**
   * Execute function with circuit breaker protection
   * 
   * @param {Function} fn - Async function to execute
   * @returns {Promise<any>} Function result
   * @throws {Error} If circuit is open
   */
  async execute(fn) {
    // Check if circuit should transition to HALF_OPEN
    if (this.state === CircuitState.OPEN) {
      if (Date.now() >= this.nextAttemptTime) {
        this.state = CircuitState.HALF_OPEN;
        this.failures = 0;
      } else {
        throw new Error('Circuit breaker is OPEN - service unavailable');
      }
    }

    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (error) {
      this._onFailure();
      throw error;
    }
  }

  /**
   * Handle successful execution
   * @private
   */
  _onSuccess() {
    this.successes++;

    if (this.state === CircuitState.HALF_OPEN) {
      // Service recovered, close circuit
      this.state = CircuitState.CLOSED;
      this.failures = 0;
      this.lastFailureTime = null;
    }
  }

  /**
   * Handle failed execution
   * @private
   */
  _onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();

    // Check if failures exceed threshold
    if (this.failures >= this.failureThreshold) {
      this._trip();
    }
  }

  /**
   * Trip (open) the circuit breaker
   * @private
   */
  _trip() {
    this.state = CircuitState.OPEN;
    this.nextAttemptTime = Date.now() + this.resetTimeout;
  }

  /**
   * Get current state
   * @returns {Object} Circuit breaker state
   */
  getState() {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      failureThreshold: this.failureThreshold,
      nextAttemptTime: this.nextAttemptTime
    };
  }

  /**
   * Manually reset circuit breaker
   */
  reset() {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
  }

  /**
   * Check if circuit is open
   * @returns {boolean}
   */
  isOpen() {
    return this.state === CircuitState.OPEN;
  }
}

module.exports = { CircuitBreaker, CircuitState };


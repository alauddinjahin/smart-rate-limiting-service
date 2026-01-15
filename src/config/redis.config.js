// ============================================
// Redis connection configuration
// ============================================

module.exports = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB, 10) || 0,
  
  // Connection pool
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  enableOfflineQueue: false,
  
  // Retry strategy with exponential backoff
  retryStrategy: (times) => {
    if (times > 10) {
      // Stop retrying after 10 attempts
      return null;
    }
    // Exponential backoff: 50ms, 100ms, 200ms, 400ms...
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  
  // Connection timeout
  connectTimeout: 10000,
  
  // Keep alive
  keepAlive: 30000,
  
  // Lazy connect (manual connection)
  lazyConnect: true,
  
  // Cluster mode (if using Redis Cluster)
  cluster: {
    enabled: process.env.REDIS_CLUSTER_ENABLED === 'true',
    nodes: process.env.REDIS_CLUSTER_NODES?.split(',').map(node => {
      const [host, port] = node.split(':');
      return { host, port: parseInt(port, 10) };
    }) || []
  }
};


/**
 * Geographic multipliers for rate limits
 * 
 * Business Logic:
 * - High-income countries: Standard limits (1.0x)
 * - Developing countries: Higher limits for market expansion (2.0x)
 * - High-fraud regions: Stricter limits (0.5x)
 * 
 * Best Practice: Balance business growth with fraud prevention
 * Compliance: Consider GDPR, data residency requirements
 */

const GEO_MULTIPLIERS = {
  // North America
  'US': { 
    multiplier: 1.0, 
    region: 'North America',
    notes: 'Standard limits'
  },
  'CA': { 
    multiplier: 1.0, 
    region: 'North America',
    notes: 'Standard limits'
  },
  
  // Europe
  'GB': { 
    multiplier: 1.0, 
    region: 'Europe',
    notes: 'Standard limits, GDPR compliant'
  },
  'DE': { 
    multiplier: 1.0, 
    region: 'Europe',
    notes: 'Standard limits, GDPR compliant'
  },
  'FR': { 
    multiplier: 1.0, 
    region: 'Europe',
    notes: 'Standard limits, GDPR compliant'
  },
  'EU': { 
    multiplier: 1.0, 
    region: 'Europe',
    notes: 'Generic EU, GDPR compliant'
  },
  
  // Asia Pacific
  'CN': { 
    multiplier: 0.5, 
    region: 'Asia Pacific',
    notes: 'Stricter limits due to fraud patterns'
  },
  'IN': { 
    multiplier: 2.0, 
    region: 'Asia Pacific',
    notes: 'Higher limits for market expansion'
  },
  'JP': { 
    multiplier: 1.0, 
    region: 'Asia Pacific',
    notes: 'Standard limits'
  },
  'SG': { 
    multiplier: 1.0, 
    region: 'Asia Pacific',
    notes: 'Standard limits'
  },
  'AU': { 
    multiplier: 1.0, 
    region: 'Asia Pacific',
    notes: 'Standard limits'
  },
  
  // Default fallback
  'DEFAULT': { 
    multiplier: 1.0, 
    region: 'Unknown',
    notes: 'Default multiplier for unknown countries'
  }
};

/**
 * Region-specific configurations
 */
const REGION_CONFIG = {
  'North America': {
    timezone: 'America/New_York',
    currency: 'USD',
    fraudRisk: 'low'
  },
  'Europe': {
    timezone: 'Europe/London',
    currency: 'EUR',
    fraudRisk: 'low',
    gdprCompliant: true
  },
  'Asia Pacific': {
    timezone: 'Asia/Singapore',
    currency: 'USD',
    fraudRisk: 'medium'
  }
};

/**
 * Get multiplier for a country code
 * @param {string} countryCode - ISO 3166-1 alpha-2 country code
 * @returns {number} Multiplier value
 */
function getGeoMultiplier(countryCode) {
  const config = GEO_MULTIPLIERS[countryCode?.toUpperCase()] || GEO_MULTIPLIERS.DEFAULT;
  return config.multiplier;
}

/**
 * Get region info for a country code
 * @param {string} countryCode - ISO 3166-1 alpha-2 country code
 * @returns {object} Region configuration
 */
function getRegionConfig(countryCode) {
  const geoConfig = GEO_MULTIPLIERS[countryCode?.toUpperCase()] || GEO_MULTIPLIERS.DEFAULT;
  return REGION_CONFIG[geoConfig.region] || {};
}

module.exports = {
  GEO_MULTIPLIERS,
  REGION_CONFIG,
  getGeoMultiplier,
  getRegionConfig
};

const Methods = require('../lib/methods');

/**
 * Dynamic bounds calculation system
 * Calculates intelligent price bounds based on market conditions
 */
class DynamicBounds {
  constructor(config = {}) {
    this.methods = new Methods();
    this.config = {
      defaultMargin: config.defaultMargin || 0.15, // 15% default margin
      volatilityWeight: config.volatilityWeight || 0.3,
      liquidityWeight: config.liquidityWeight || 0.2,
      trendWeight: config.trendWeight || 0.25,
      qualityMultipliers: config.qualityMultipliers || {
        5: 1.5, // Unusual
        14: 2.0, // Collectors
        11: 1.2, // Strange
        1: 0.8, // Genuine
        3: 0.9, // Vintage
      },
      ...config,
    };
  }

  /**
   * Calculate volatility adjustment using robust statistics
   * @param {Array} priceHistory - Historical price data
   * @param {number} windowPeriod - Period for volatility calculation
   * @returns {number} - Volatility multiplier
   */
  calculateVolatilityAdjustment(priceHistory, windowPeriod = 24) {
    if (priceHistory.length < windowPeriod) {
      return 1.0; // Default if insufficient data
    }

    const recentPrices = priceHistory.slice(-windowPeriod).map((p) => p.value);

    // Use robust statistical methods for better outlier resistance
    const robustEstimators = require('./robustEstimators');
    const estimator = new robustEstimators();

    const robustMean = estimator.calculateRobustMean(recentPrices);
    const mad = estimator.calculateMAD(recentPrices);

    // Convert MAD to approximately standard deviation equivalent
    const robustStdDev = mad * 1.4826;

    // Calculate coefficient of variation (CV) using robust measures
    const cv = robustMean.value > 0 ? robustStdDev / robustMean.value : 0;

    // Convert CV to multiplier (higher volatility = wider bounds)
    // CV of 0.1 (10%) = 1.0x, CV of 0.3 (30%) = 1.5x, CV of 0.5+ = 2.0x
    return Math.min(2.0, 1.0 + cv * 2);
  }

  /**
   * Calculate liquidity-based bounds adjustment
   * Lower liquidity = wider bounds to account for price discovery
   * @param {number} buyCount - Number of buy listings
   * @param {number} sellCount - Number of sell listings
   * @param {number} avgVolume - Average trading volume
   * @returns {number} - Liquidity multiplier
   */
  calculateLiquidityAdjustment(buyCount, sellCount, avgVolume = 1) {
    const totalListings = buyCount + sellCount;
    const minListings = Math.min(buyCount, sellCount);

    // Base liquidity score (0-1)
    let liquidityScore = 0;

    // Factor 1: Total listings
    liquidityScore += Math.min(1, totalListings / 10) * 0.4;

    // Factor 2: Balance between buy/sell
    const balance = totalListings > 0 ? minListings / totalListings : 0;
    liquidityScore += balance * 0.3;

    // Factor 3: Volume consideration
    const volumeScore = Math.min(1, avgVolume / 5);
    liquidityScore += volumeScore * 0.3;

    // Convert to multiplier (lower liquidity = wider bounds)
    return 1.0 + (1.0 - liquidityScore) * 0.8; // Max 1.8x for very illiquid items
  }

  /**
   * Calculate trend-based bounds adjustment
   * Strong trends may require asymmetric bounds
   * @param {Array} priceHistory - Historical prices
   * @returns {object} - Trend adjustment factors
   */
  calculateTrendAdjustment(priceHistory) {
    if (priceHistory.length < 10) {
      return { buyMultiplier: 1.0, sellMultiplier: 1.0, strength: 0 };
    }

    // Linear regression for trend detection
    const data = priceHistory.slice(-20).map((p, i) => ({ x: i, y: p.value }));
    const n = data.length;

    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    data.forEach((point) => {
      sumX += point.x;
      sumY += point.y;
      sumXY += point.x * point.y;
      sumX2 += point.x * point.x;
    });

    const denominator = n * sumX2 - sumX * sumX;
    if (denominator === 0) {
      return { buyMultiplier: 1.0, sellMultiplier: 1.0, strength: 0 };
    }

    const slope = (n * sumXY - sumX * sumY) / denominator;
    const meanY = sumY / n;

    // Calculate R-squared for trend strength
    let ssRes = 0;
    let ssTot = 0;
    const intercept = (sumY - slope * sumX) / n;

    data.forEach((point) => {
      const predicted = slope * point.x + intercept;
      ssRes += Math.pow(point.y - predicted, 2);
      ssTot += Math.pow(point.y - meanY, 2);
    });

    const rSquared = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
    const trendStrength = Math.abs(slope) * rSquared;

    // Normalize slope relative to price level
    const normalizedSlope = meanY > 0 ? slope / meanY : 0;

    let buyMultiplier = 1.0;
    let sellMultiplier = 1.0;

    if (trendStrength > 0.1) {
      // Significant trend detected
      if (normalizedSlope > 0.01) {
        // Upward trend - tighten sell bounds, widen buy bounds
        sellMultiplier = Math.max(0.7, 1.0 - trendStrength * 0.3);
        buyMultiplier = Math.min(1.3, 1.0 + trendStrength * 0.3);
      } else if (normalizedSlope < -0.01) {
        // Downward trend - tighten buy bounds, widen sell bounds
        buyMultiplier = Math.max(0.7, 1.0 - trendStrength * 0.3);
        sellMultiplier = Math.min(1.3, 1.0 + trendStrength * 0.3);
      }
    }

    return {
      buyMultiplier,
      sellMultiplier,
      strength: trendStrength,
      direction: normalizedSlope > 0.01 ? 'up' : normalizedSlope < -0.01 ? 'down' : 'sideways',
    };
  }

  /**
   * Get quality-based multiplier
   * @param {string} sku - Item SKU
   * @returns {number} - Quality multiplier
   */
  getQualityMultiplier(sku) {
    if (!sku || typeof sku !== 'string') {
      return 1.0; // Default multiplier if SKU is invalid
    }

    const skuParts = sku.split(';');
    if (skuParts.length < 2) {
      return 1.0; // Default multiplier if SKU format is invalid
    }

    const quality = skuParts[1];
    return this.config.qualityMultipliers[quality] || 1.0;
  }

  /**
   * Calculate time-of-day adjustment
   * Account for market activity patterns
   * @param {Date} currentTime - Current time
   * @returns {number} - Time adjustment multiplier
   */
  calculateTimeAdjustment(currentTime = new Date()) {
    const hour = currentTime.getUTCHours();

    // Peak trading hours: 14:00-22:00 UTC (US afternoon/evening)
    // Off-peak hours: 02:00-10:00 UTC (US early morning)
    let timeMultiplier = 1.0;

    if (hour >= 2 && hour <= 10) {
      // Off-peak: wider bounds due to lower liquidity
      timeMultiplier = 1.15;
    } else if (hour >= 14 && hour <= 22) {
      // Peak: tighter bounds due to higher activity
      timeMultiplier = 0.9;
    }

    return timeMultiplier;
  }

  /**
   * Calculate seasonal adjustment
   * Account for seasonal trading patterns
   * @param {Date} currentTime - Current time
   * @returns {number} - Seasonal multiplier
   */
  calculateSeasonalAdjustment(currentTime = new Date()) {
    const month = currentTime.getMonth(); // 0-11
    const dayOfWeek = currentTime.getDay(); // 0-6

    let seasonalMultiplier = 1.0;

    // Summer months (June-August): potentially lower activity
    if (month >= 5 && month <= 7) {
      seasonalMultiplier *= 1.05;
    }

    // Holiday season (December): potentially higher activity
    if (month === 11) {
      seasonalMultiplier *= 0.95;
    }

    // Weekend effect: potentially lower institutional activity
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      seasonalMultiplier *= 1.1;
    }

    return seasonalMultiplier;
  }

  /**
   * Calculate comprehensive dynamic bounds
   * @param {object} params - Calculation parameters
   * @returns {object} - Dynamic bounds configuration
   */
  calculateDynamicBounds(params) {
    const {
      sku,
      priceHistory = [],
      buyCount = 0,
      sellCount = 0,
      avgVolume = 1,
      basePrice,
      currentTime = new Date(),
    } = params;

    // Base margin
    let margin = this.config.defaultMargin;

    // Calculate adjustment factors
    const volatilityAdj = this.calculateVolatilityAdjustment(priceHistory);
    const liquidityAdj = this.calculateLiquidityAdjustment(buyCount, sellCount, avgVolume);
    const trendAdj = this.calculateTrendAdjustment(priceHistory);
    const qualityAdj = this.getQualityMultiplier(sku);
    const timeAdj = this.calculateTimeAdjustment(currentTime);
    const seasonalAdj = this.calculateSeasonalAdjustment(currentTime);

    // Combine adjustments with weights
    const combinedBuyMultiplier =
      volatilityAdj * this.config.volatilityWeight +
      liquidityAdj * this.config.liquidityWeight +
      trendAdj.buyMultiplier * this.config.trendWeight +
      qualityAdj * 0.1 +
      timeAdj * 0.05 +
      seasonalAdj * 0.05 +
      (1.0 -
        this.config.volatilityWeight -
        this.config.liquidityWeight -
        this.config.trendWeight -
        0.2);

    const combinedSellMultiplier =
      volatilityAdj * this.config.volatilityWeight +
      liquidityAdj * this.config.liquidityWeight +
      trendAdj.sellMultiplier * this.config.trendWeight +
      qualityAdj * 0.1 +
      timeAdj * 0.05 +
      seasonalAdj * 0.05 +
      (1.0 -
        this.config.volatilityWeight -
        this.config.liquidityWeight -
        this.config.trendWeight -
        0.2);

    // Calculate final bounds
    const buyMargin = margin * combinedBuyMultiplier;
    const sellMargin = margin * combinedSellMultiplier;

    const bounds = {
      buy: {
        min: basePrice * (1 - buyMargin),
        max: basePrice * (1 + buyMargin * 0.5), // Asymmetric for buy side
        margin: buyMargin,
      },
      sell: {
        min: basePrice * (1 - sellMargin * 0.5), // Asymmetric for sell side
        max: basePrice * (1 + sellMargin),
        margin: sellMargin,
      },
      confidence: this.calculateBoundsConfidence(params),
      factors: {
        volatility: volatilityAdj,
        liquidity: liquidityAdj,
        trend: trendAdj,
        quality: qualityAdj,
        time: timeAdj,
        seasonal: seasonalAdj,
      },
      metadata: {
        sku,
        calculatedAt: currentTime.toISOString(),
        dataQuality: this.assessDataQuality(params),
      },
    };

    return bounds;
  }

  /**
   * Calculate confidence in bounds calculation
   * @param {object} params - Input parameters
   * @returns {number} - Confidence score (0-1)
   */
  calculateBoundsConfidence(params) {
    const { priceHistory = [], buyCount = 0, sellCount = 0 } = params;

    let confidence = 0;

    // Factor 1: Historical data availability
    if (priceHistory.length >= 50) {
      confidence += 0.3;
    } else if (priceHistory.length >= 20) {
      confidence += 0.2;
    } else if (priceHistory.length >= 10) {
      confidence += 0.1;
    }

    // Factor 2: Market depth
    const totalListings = buyCount + sellCount;
    if (totalListings >= 20) {
      confidence += 0.3;
    } else if (totalListings >= 10) {
      confidence += 0.2;
    } else if (totalListings >= 5) {
      confidence += 0.1;
    }

    // Factor 3: Market balance
    const minListings = Math.min(buyCount, sellCount);
    const balance = totalListings > 0 ? minListings / totalListings : 0;
    confidence += balance * 0.2;

    // Factor 4: Data recency
    if (priceHistory.length > 0) {
      const latestPrice = priceHistory[priceHistory.length - 1];
      const ageHours = (Date.now() / 1000 - latestPrice.timestamp) / 3600;
      if (ageHours <= 2) {
        confidence += 0.2;
      } else if (ageHours <= 12) {
        confidence += 0.1;
      }
    }

    return Math.min(1.0, confidence);
  }

  /**
   * Assess overall data quality
   * @param {object} params - Input parameters
   * @returns {string} - Quality assessment
   */
  assessDataQuality(params) {
    const { priceHistory = [], buyCount = 0, sellCount = 0 } = params;

    const historyScore = Math.min(1, priceHistory.length / 30);
    const liquidityScore = Math.min(1, (buyCount + sellCount) / 15);
    const balanceScore =
      buyCount + sellCount > 0 ? Math.min(buyCount, sellCount) / (buyCount + sellCount) : 0;

    const overallScore = (historyScore + liquidityScore + balanceScore) / 3;

    if (overallScore >= 0.8) {
      return 'excellent';
    }
    if (overallScore >= 0.6) {
      return 'good';
    }
    if (overallScore >= 0.4) {
      return 'fair';
    }
    if (overallScore >= 0.2) {
      return 'poor';
    }
    return 'very_poor';
  }

  /**
   * Generate bounds recommendations
   * @param {object} bounds - Calculated bounds
   * @returns {Array} - Array of recommendations
   */
  generateRecommendations(bounds) {
    const recommendations = [];

    // Confidence-based recommendations
    if (bounds.confidence < 0.3) {
      recommendations.push({
        type: 'warning',
        message: 'Low confidence in bounds calculation. Consider manual review.',
        priority: 'high',
      });
    } else if (bounds.confidence < 0.6) {
      recommendations.push({
        type: 'caution',
        message: 'Moderate confidence in bounds. Monitor price movements closely.',
        priority: 'medium',
      });
    }

    // Factor-specific recommendations
    if (bounds.factors.volatility > 1.5) {
      recommendations.push({
        type: 'info',
        message: 'High volatility detected. Bounds automatically widened.',
        priority: 'low',
      });
    }

    if (bounds.factors.liquidity > 1.4) {
      recommendations.push({
        type: 'warning',
        message: 'Low liquidity detected. Price discovery may be challenging.',
        priority: 'medium',
      });
    }

    if (bounds.factors.trend.strength > 0.5) {
      recommendations.push({
        type: 'info',
        message: `Strong ${bounds.factors.trend.direction} trend detected. Bounds adjusted asymmetrically.`,
        priority: 'low',
      });
    }

    // Data quality recommendations
    if (bounds.metadata.dataQuality === 'poor' || bounds.metadata.dataQuality === 'very_poor') {
      recommendations.push({
        type: 'warning',
        message: 'Poor data quality. Consider increasing safety margins.',
        priority: 'high',
      });
    }

    return recommendations;
  }
}

module.exports = DynamicBounds;

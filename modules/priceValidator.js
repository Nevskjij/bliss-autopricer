const Methods = require('../lib/methods');

/**
 * Price validation and recommendation system
 * Provides intelligent price validation and trading recommendations
 */
class PriceValidator {
  constructor(config = {}) {
    this.methods = new Methods();
    this.config = {
      maxSpreadRatio: config.maxSpreadRatio || 0.3, // 30% max spread
      minProfitMargin: config.minProfitMargin || 0.05, // 5% min profit
      maxVolatilityThreshold: config.maxVolatilityThreshold || 0.5,
      confidenceThresholds: {
        excellent: 0.9,
        good: 0.7,
        fair: 0.5,
        poor: 0.3,
      },
      ...config,
    };
  }

  /**
   * Validate price integrity and market logic
   * @param {object} priceData - Price data to validate
   * @returns {object} - Validation results
   */
  validatePriceIntegrity(priceData) {
    const { buyPrice, sellPrice, sku, confidence, marketData } = priceData;
    const issues = [];
    const warnings = [];
    const recommendations = [];

    // Basic price sanity checks
    if (buyPrice <= 0 || sellPrice <= 0) {
      issues.push({
        type: 'invalid_price',
        message: 'Buy or sell price is zero or negative',
        severity: 'critical',
      });
    }

    if (buyPrice >= sellPrice) {
      issues.push({
        type: 'inverted_spread',
        message: 'Buy price is greater than or equal to sell price',
        severity: 'critical',
      });
    }

    // Spread analysis
    const spread = sellPrice - buyPrice;
    const spreadRatio = spread / sellPrice;
    const midPrice = (buyPrice + sellPrice) / 2;

    if (spreadRatio > this.config.maxSpreadRatio) {
      warnings.push({
        type: 'wide_spread',
        message: `Spread is ${(spreadRatio * 100).toFixed(1)}% which exceeds threshold of ${(this.config.maxSpreadRatio * 100).toFixed(1)}%`,
        severity: 'medium',
        data: { spreadRatio, threshold: this.config.maxSpreadRatio },
      });
    }

    if (spreadRatio < 0.02) {
      // Spread less than 2%
      warnings.push({
        type: 'tight_spread',
        message: `Very tight spread of ${(spreadRatio * 100).toFixed(1)}% may indicate low profit margins`,
        severity: 'low',
        data: { spreadRatio },
      });
    }

    // Confidence-based recommendations
    if (confidence < this.config.confidenceThresholds.fair) {
      recommendations.push({
        type: 'low_confidence',
        message: 'Low confidence pricing detected. Consider manual review or wider margins.',
        action: 'review_manually',
        priority: 'high',
      });
    }

    // Market data analysis
    if (marketData) {
      // Volume analysis
      if (marketData.totalListings && marketData.totalListings < 5) {
        warnings.push({
          type: 'low_liquidity',
          message: `Only ${marketData.totalListings} total listings found`,
          severity: 'medium',
          data: { totalListings: marketData.totalListings },
        });

        recommendations.push({
          type: 'liquidity_adjustment',
          message: 'Consider widening price bounds due to low liquidity',
          action: 'increase_margins',
          priority: 'medium',
        });
      }

      // Volatility analysis
      if (marketData.volatility > this.config.maxVolatilityThreshold) {
        warnings.push({
          type: 'high_volatility',
          message: `High price volatility detected (${(marketData.volatility * 100).toFixed(1)}%)`,
          severity: 'medium',
          data: { volatility: marketData.volatility },
        });

        recommendations.push({
          type: 'volatility_adjustment',
          message: 'Consider more frequent price updates due to high volatility',
          action: 'increase_update_frequency',
          priority: 'medium',
        });
      }

      // Age analysis
      if (marketData.avgDataAge && marketData.avgDataAge > 24 * 3600) {
        // Data older than 24 hours
        warnings.push({
          type: 'stale_data',
          message: `Price data is ${Math.round(marketData.avgDataAge / 3600)} hours old`,
          severity: 'medium',
          data: { ageHours: marketData.avgDataAge / 3600 },
        });
      }
    }

    // Quality-based recommendations
    const quality = sku.split(';')[1];
    if (['5', '14'].includes(quality)) {
      // Unusual or Collector's items
      recommendations.push({
        type: 'rare_item',
        message: 'Rare quality item - consider conservative pricing and manual oversight',
        action: 'manual_oversight',
        priority: 'medium',
      });
    }

    return {
      isValid: issues.length === 0,
      confidence: this.calculateValidationConfidence(issues, warnings, confidence),
      issues,
      warnings,
      recommendations,
      summary: this.generateValidationSummary(issues, warnings, recommendations),
      metrics: {
        spread,
        spreadRatio,
        midPrice,
        profitMargin: spread / buyPrice,
      },
    };
  }

  /**
   * Calculate overall validation confidence
   * @param {Array} issues - Critical issues
   * @param {Array} warnings - Warnings
   * @param {number} originalConfidence - Original price confidence
   * @returns {number} - Adjusted confidence score
   */
  calculateValidationConfidence(issues, warnings, originalConfidence = 0.5) {
    let confidence = originalConfidence;

    // Reduce confidence for each issue
    issues.forEach((issue) => {
      switch (issue.severity) {
        case 'critical':
          confidence *= 0.1; // Major reduction
          break;
        case 'high':
          confidence *= 0.5;
          break;
        case 'medium':
          confidence *= 0.7;
          break;
        default:
          confidence *= 0.9;
      }
    });

    // Reduce confidence for warnings
    warnings.forEach((warning) => {
      switch (warning.severity) {
        case 'high':
          confidence *= 0.8;
          break;
        case 'medium':
          confidence *= 0.9;
          break;
        default:
          confidence *= 0.95;
      }
    });

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Generate human-readable validation summary
   * @param {Array} issues - Issues found
   * @param {Array} warnings - Warnings found
   * @param {Array} recommendations - Recommendations
   * @returns {string} - Summary text
   */
  generateValidationSummary(issues, warnings, recommendations) {
    if (issues.length > 0) {
      return `${issues.length} critical issue(s) found. Price validation failed.`;
    }

    if (warnings.length > 0) {
      return `${warnings.length} warning(s) detected. Review recommended.`;
    }

    if (recommendations.length > 0) {
      return `Price validation passed with ${recommendations.length} optimization suggestion(s).`;
    }

    return 'Price validation passed successfully.';
  }

  /**
   * Analyze price trends and generate trading signals
   * @param {Array} priceHistory - Historical price data
   * @param {object} currentPrice - Current price data
   * @returns {object} - Trend analysis and signals
   */
  analyzeTrends(priceHistory, currentPrice) {
    if (priceHistory.length < 5) {
      return {
        trend: 'insufficient_data',
        strength: 0,
        signals: [],
      };
    }

    // Calculate moving averages
    const shortMA = this.calculateMA(priceHistory.slice(-5), 5);
    const longMA = this.calculateMA(priceHistory.slice(-10), 10);

    // Determine trend direction
    let trend = 'sideways';
    let strength = 0;

    if (shortMA > longMA * 1.05) {
      trend = 'upward';
      strength = (shortMA - longMA) / longMA;
    } else if (shortMA < longMA * 0.95) {
      trend = 'downward';
      strength = (longMA - shortMA) / longMA;
    }

    // Generate trading signals
    const signals = [];

    if (trend === 'upward' && strength > 0.1) {
      signals.push({
        type: 'bullish',
        message: 'Strong upward trend detected. Consider raising sell prices.',
        confidence: Math.min(0.9, strength * 5),
      });
    } else if (trend === 'downward' && strength > 0.1) {
      signals.push({
        type: 'bearish',
        message: 'Strong downward trend detected. Consider lowering buy prices.',
        confidence: Math.min(0.9, strength * 5),
      });
    }

    // Support/resistance analysis
    const levels = this.findKeyLevels(priceHistory);
    if (levels.support.length > 0 || levels.resistance.length > 0) {
      signals.push({
        type: 'technical',
        message: `Key levels identified: Support at ${levels.support[0]?.toFixed(2) || 'N/A'}, Resistance at ${levels.resistance[0]?.toFixed(2) || 'N/A'}`,
        confidence: 0.6,
        data: levels,
      });
    }

    return {
      trend,
      strength,
      signals,
      movingAverages: {
        short: shortMA,
        long: longMA,
      },
      keyLevels: levels,
    };
  }

  /**
   * Calculate robust moving average
   * @param {Array} data - Price data
   * @param {number} period - Period for MA
   * @returns {number} - Moving average
   */
  calculateMA(data, period) {
    if (data.length < period) {
      return null;
    }

    // Use robust estimation for moving averages
    const robustEstimators = require('./robustEstimators');
    const estimator = new robustEstimators();

    const prices = data.slice(-period).map((d) => d.value || d);
    const robustResult = estimator.calculateAdaptiveRobustMean(prices);

    return robustResult.value;
  }

  /**
   * Find key support and resistance levels
   * @param {Array} priceHistory - Historical prices
   * @returns {object} - Support and resistance levels
   */
  findKeyLevels(priceHistory) {
    const prices = priceHistory.map((p) => p.value || p);
    const support = [];
    const resistance = [];

    // Simple pivot point detection
    for (let i = 2; i < prices.length - 2; i++) {
      const current = prices[i];
      const isSupport =
        prices[i - 1] > current &&
        prices[i + 1] > current &&
        prices[i - 2] > current &&
        prices[i + 2] > current;
      const isResistance =
        prices[i - 1] < current &&
        prices[i + 1] < current &&
        prices[i - 2] < current &&
        prices[i + 2] < current;

      if (isSupport) {
        support.push(current);
      }
      if (isResistance) {
        resistance.push(current);
      }
    }

    return {
      support: support.sort((a, b) => b - a).slice(0, 3), // Top 3 support levels
      resistance: resistance.sort((a, b) => a - b).slice(0, 3), // Top 3 resistance levels
    };
  }

  /**
   * Generate comprehensive pricing report
   * @param {object} priceData - Complete price data
   * @returns {object} - Detailed pricing report
   */
  generatePricingReport(priceData) {
    const { sku, name, buyPrice, sellPrice, confidence, priceHistory, marketData } = priceData;

    const validation = this.validatePriceIntegrity(priceData);
    const trendAnalysis = this.analyzeTrends(priceHistory || [], {
      buy: buyPrice,
      sell: sellPrice,
    });

    const report = {
      item: { sku, name },
      pricing: {
        buy: buyPrice,
        sell: sellPrice,
        spread: sellPrice - buyPrice,
        spreadRatio: (sellPrice - buyPrice) / sellPrice,
        midPrice: (buyPrice + sellPrice) / 2,
      },
      confidence: {
        original: confidence,
        validated: validation.confidence,
        grade: this.getConfidenceGrade(validation.confidence),
      },
      validation,
      trends: trendAnalysis,
      marketConditions: this.assessMarketConditions(marketData, validation, trendAnalysis),
      recommendations: this.generateRecommendations(validation, trendAnalysis, marketData),
      timestamp: new Date().toISOString(),
    };

    return report;
  }

  /**
   * Assess overall market conditions
   * @param {object} marketData - Market data
   * @param {object} validation - Validation results
   * @param {object} trends - Trend analysis
   * @returns {object} - Market condition assessment
   */
  assessMarketConditions(marketData, validation, trends) {
    let liquidity = 'unknown';
    let volatility = 'unknown';
    let activity = 'unknown';

    if (marketData) {
      // Liquidity assessment
      const totalListings = marketData.totalListings || 0;
      if (totalListings >= 20) {
        liquidity = 'high';
      } else if (totalListings >= 10) {
        liquidity = 'medium';
      } else if (totalListings >= 5) {
        liquidity = 'low';
      } else {
        liquidity = 'very_low';
      }

      // Volatility assessment
      if (marketData.volatility !== undefined) {
        if (marketData.volatility < 0.1) {
          volatility = 'low';
        } else if (marketData.volatility < 0.3) {
          volatility = 'medium';
        } else {
          volatility = 'high';
        }
      }

      // Activity assessment based on data freshness
      if (marketData.avgDataAge !== undefined) {
        const ageHours = marketData.avgDataAge / 3600;
        if (ageHours < 2) {
          activity = 'high';
        } else if (ageHours < 12) {
          activity = 'medium';
        } else {
          activity = 'low';
        }
      }
    }

    return {
      liquidity,
      volatility,
      activity,
      trend: trends.trend,
      trendStrength: trends.strength,
      overall: this.calculateOverallMarketScore(liquidity, volatility, activity, trends),
    };
  }

  /**
   * Calculate overall market condition score
   * @param {string} liquidity - Liquidity level
   * @param {string} volatility - Volatility level
   * @param {string} activity - Activity level
   * @param {object} trends - Trend data
   * @returns {string} - Overall market condition
   */
  calculateOverallMarketScore(liquidity, volatility, activity, trends) {
    const scores = {
      high: 3,
      medium: 2,
      low: 1,
      very_low: 0,
      unknown: 1,
    };

    const liquidityScore = scores[liquidity] || 1;
    const activityScore = scores[activity] || 1;
    const volatilityScore = volatility === 'low' ? 3 : volatility === 'medium' ? 2 : 1;

    const totalScore = liquidityScore + activityScore + volatilityScore;

    if (totalScore >= 8) {
      return 'excellent';
    }
    if (totalScore >= 6) {
      return 'good';
    }
    if (totalScore >= 4) {
      return 'fair';
    }
    return 'poor';
  }

  /**
   * Generate comprehensive recommendations
   * @param {object} validation - Validation results
   * @param {object} trends - Trend analysis
   * @param {object} marketData - Market data
   * @returns {Array} - Array of recommendations
   */
  generateRecommendations(validation, trends, marketData) {
    const recommendations = [...validation.recommendations];

    // Add trend-based recommendations
    if (trends.signals) {
      trends.signals.forEach((signal) => {
        recommendations.push({
          type: 'trend_based',
          message: signal.message,
          confidence: signal.confidence,
          priority: signal.confidence > 0.7 ? 'high' : 'medium',
        });
      });
    }

    // Add market condition recommendations
    if (marketData) {
      if (marketData.totalListings < 3) {
        recommendations.push({
          type: 'risk_management',
          message: 'Very low listing count. Consider conservative pricing or avoiding this item.',
          priority: 'high',
        });
      }

      if (marketData.volatility > 0.4) {
        recommendations.push({
          type: 'risk_management',
          message:
            'High volatility detected. Consider shorter hold times and frequent price updates.',
          priority: 'medium',
        });
      }
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  /**
   * Get confidence grade
   * @param {number} confidence - Confidence score
   * @returns {string} - Grade letter
   */
  getConfidenceGrade(confidence) {
    if (confidence >= 0.9) {
      return 'A+';
    }
    if (confidence >= 0.8) {
      return 'A';
    }
    if (confidence >= 0.7) {
      return 'B';
    }
    if (confidence >= 0.6) {
      return 'C';
    }
    if (confidence >= 0.5) {
      return 'D';
    }
    return 'F';
  }
}

module.exports = PriceValidator;

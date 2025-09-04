/**
 * Profit Optimization Engine
 * Advanced profit maximization strategies for BPTF Autopricer
 * Implements dynamic margin adjustment, market efficiency analysis, and profit forecasting
 */

const RobustEstimators = require('./robustEstimators');

class ProfitOptimizer {
  constructor(config = {}) {
    this.config = {
      baseMarginBuy: config.baseMarginBuy || 0.12, // 12% base buy margin
      baseMarginSell: config.baseMarginSell || 0.15, // 15% base sell margin
      maxMarginBuy: config.maxMarginBuy || 0.25, // 25% max buy margin
      maxMarginSell: config.maxMarginSell || 0.35, // 35% max sell margin
      minMarginBuy: config.minMarginBuy || 0.05, // 5% min buy margin
      minMarginSell: config.minMarginSell || 0.08, // 8% min sell margin
      liquidityThreshold: config.liquidityThreshold || 5, // Minimum listings for liquid market
      volatilityWeight: config.volatilityWeight || 0.3, // Weight for volatility adjustments
      competitionWeight: config.competitionWeight || 0.4, // Weight for competition adjustments
      trendWeight: config.trendWeight || 0.25, // Weight for trend adjustments
      riskTolerance: config.riskTolerance || 0.15, // Risk tolerance factor
      ...config,
    };
    this.robustEstimators = new RobustEstimators();
  }

  /**
   * Calculate optimal profit margins based on market conditions
   * @param {object} marketData - Current market data
   * @param {Array} priceHistory - Historical price data
   * @param {object} itemMetadata - Item metadata (sku, quality, etc.)
   * @returns {object} - Optimized buy/sell margins
   */
  calculateOptimalMargins(marketData, priceHistory = [], itemMetadata = {}) {
    try {
      // Base margins
      let buyMargin = this.config.baseMarginBuy;
      let sellMargin = this.config.baseMarginSell;

      // 1. Liquidity-based adjustment
      const liquidityFactor = this.calculateLiquidityFactor(marketData);
      buyMargin *= 1 + liquidityFactor * 0.3; // Increase margins in illiquid markets
      sellMargin *= 1 + liquidityFactor * 0.2;

      // 2. Volatility-based adjustment
      if (priceHistory.length >= 10) {
        const volatilityFactor = this.calculateVolatilityFactor(priceHistory);
        buyMargin *= 1 + volatilityFactor * this.config.volatilityWeight;
        sellMargin *= 1 + volatilityFactor * this.config.volatilityWeight;
      }

      // 3. Competition-based adjustment
      const competitionFactor = this.calculateCompetitionFactor(marketData);
      buyMargin *= 1 - competitionFactor * this.config.competitionWeight * 0.5;
      sellMargin *= 1 - competitionFactor * this.config.competitionWeight * 0.3;

      // 4. Trend-based adjustment
      if (priceHistory.length >= 20) {
        const trendFactor = this.calculateTrendFactor(priceHistory);
        // Adjust margins based on price trends
        if (trendFactor > 0) {
          // Rising trend - be more aggressive on buy, conservative on sell
          buyMargin *= 1 + trendFactor * this.config.trendWeight;
          sellMargin *= 1 - trendFactor * this.config.trendWeight * 0.5;
        } else {
          // Falling trend - be conservative on buy, aggressive on sell
          buyMargin *= 1 - Math.abs(trendFactor) * this.config.trendWeight * 0.5;
          sellMargin *= 1 + Math.abs(trendFactor) * this.config.trendWeight;
        }
      }

      // 5. Quality-based adjustment
      const qualityFactor = this.calculateQualityFactor(itemMetadata);
      buyMargin *= qualityFactor.buyMultiplier;
      sellMargin *= qualityFactor.sellMultiplier;

      // 6. Apply constraints
      buyMargin = Math.max(this.config.minMarginBuy, Math.min(buyMargin, this.config.maxMarginBuy));
      sellMargin = Math.max(
        this.config.minMarginSell,
        Math.min(sellMargin, this.config.maxMarginSell)
      );

      // Ensure buy margin is always less than sell margin
      if (buyMargin >= sellMargin) {
        buyMargin = sellMargin - 0.02; // Minimum 2% spread
      }

      return {
        buyMargin,
        sellMargin,
        spread: sellMargin - buyMargin,
        confidence: this.calculateMarginConfidence(marketData, priceHistory),
        factors: {
          liquidity: liquidityFactor,
          volatility: priceHistory.length >= 10 ? this.calculateVolatilityFactor(priceHistory) : 0,
          competition: competitionFactor,
          trend: priceHistory.length >= 20 ? this.calculateTrendFactor(priceHistory) : 0,
          quality: qualityFactor,
        },
      };
    } catch (error) {
      console.warn('Profit optimization failed, using base margins:', error.message);
      return {
        buyMargin: this.config.baseMarginBuy,
        sellMargin: this.config.baseMarginSell,
        spread: this.config.baseMarginSell - this.config.baseMarginBuy,
        confidence: 0.5,
        factors: {},
      };
    }
  }

  /**
   * Calculate liquidity factor (0 = liquid, 1 = illiquid)
   * @param marketData
   * @returns {number} Liquidity factor
   */
  calculateLiquidityFactor(marketData) {
    const totalListings = (marketData.buyCount || 0) + (marketData.sellCount || 0);
    if (totalListings >= this.config.liquidityThreshold * 2) {
      return 0;
    } // Very liquid
    if (totalListings >= this.config.liquidityThreshold) {
      return 0.3;
    } // Moderate liquidity
    if (totalListings >= this.config.liquidityThreshold / 2) {
      return 0.6;
    } // Low liquidity
    return 1; // Very illiquid
  }

  /**
   * Calculate volatility factor based on price history
   * @param priceHistory
   * @returns {number} Volatility factor
   */
  calculateVolatilityFactor(priceHistory) {
    if (priceHistory.length < 10) {
      return 0;
    }

    const prices = priceHistory.map((p) => p.value).filter((p) => p > 0);
    if (prices.length < 5) {
      return 0;
    }

    // Use robust volatility measure
    const robustStats = this.robustEstimators.calculateRobustSpread(prices);
    const medianPrice = this.robustEstimators.calculateTrimmedMean(prices, 0.1);

    // Normalized volatility (Coefficient of Variation using robust measures)
    const volatility = robustStats.mad / medianPrice;

    // Convert to factor (0 = low volatility, 1 = high volatility)
    return Math.min(1, volatility * 10); // Scale appropriately
  }

  /**
   * Calculate competition factor based on market density
   * @param marketData
   * @returns {number} Competition factor
   */
  calculateCompetitionFactor(marketData) {
    const buyCount = marketData.buyCount || 0;
    const sellCount = marketData.sellCount || 0;

    // High competition = many listings
    const totalCompetition = buyCount + sellCount;
    if (totalCompetition >= 20) {
      return 0.8;
    } // High competition
    if (totalCompetition >= 10) {
      return 0.5;
    } // Moderate competition
    if (totalCompetition >= 5) {
      return 0.2;
    } // Low competition
    return 0; // Very low competition
  }

  /**
   * Calculate trend factor (-1 = strong downtrend, +1 = strong up-trend)
   * @param priceHistory
   * @returns {number} Trend factor
   */
  calculateTrendFactor(priceHistory) {
    if (priceHistory.length < 20) {
      return 0;
    }

    // Sort by timestamp
    const sortedHistory = priceHistory
      .filter((p) => p.value > 0)
      .sort((a, b) => a.timestamp - b.timestamp);

    if (sortedHistory.length < 10) {
      return 0;
    }

    // Calculate trend using linear regression on recent data
    const recentData = sortedHistory.slice(-20); // Last 20 points
    const n = recentData.length;
    const sumX = recentData.reduce((sum, _, i) => sum + i, 0);
    const sumY = recentData.reduce((sum, p) => sum + p.value, 0);
    const sumXY = recentData.reduce((sum, p, i) => sum + i * p.value, 0);
    const sumXX = recentData.reduce((sum, _, i) => sum + i * i, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const meanPrice = sumY / n;

    // Normalize slope relative to price level
    const normalizedSlope = slope / meanPrice;

    // Convert to factor between -1 and 1
    return Math.max(-1, Math.min(1, normalizedSlope * 100));
  }

  /**
   * Calculate quality-based adjustment factors
   * @param itemMetadata
   * @returns {object} Quality factors with buy and sell multipliers
   */
  calculateQualityFactor(itemMetadata) {
    const { quality, effect, killstreak, australium, festive } = itemMetadata;

    let buyMultiplier = 1.0;
    let sellMultiplier = 1.0;

    // Quality adjustments
    switch (quality) {
      case '5': // Unusual
        buyMultiplier = 1.4;
        sellMultiplier = 1.6;
        break;
      case '14': // Collector's
        buyMultiplier = 1.3;
        sellMultiplier = 1.5;
        break;
      case '11': // Strange
        buyMultiplier = 1.1;
        sellMultiplier = 1.2;
        break;
      case '1': // Genuine
        buyMultiplier = 0.9;
        sellMultiplier = 1.0;
        break;
      case '3': // Vintage
        buyMultiplier = 0.9;
        sellMultiplier = 1.0;
        break;
    }

    // Effect adjustments (for unusuals)
    if (effect) {
      const effectTier = this.getEffectTier(effect);
      buyMultiplier *= effectTier.buyMultiplier;
      sellMultiplier *= effectTier.sellMultiplier;
    }

    // Killstreak adjustments
    if (killstreak) {
      const ksMultiplier = 1 + killstreak * 0.1; // 10% per KS tier
      buyMultiplier *= ksMultiplier;
      sellMultiplier *= ksMultiplier;
    }

    // Special attributes
    if (australium) {
      buyMultiplier *= 1.2;
      sellMultiplier *= 1.3;
    }
    if (festive) {
      buyMultiplier *= 1.1;
      sellMultiplier *= 1.15;
    }

    return { buyMultiplier, sellMultiplier };
  }

  /**
   * Get effect tier for unusual items
   * @param effectId
   * @returns {number} Effect tier
   */
  getEffectTier(effectId) {
    // Tier 1: God-tier effects
    const tier1Effects = [13, 12, 17, 18, 3, 4]; // Smoking, Blizzard Storm, etc.
    // Tier 2: High-tier effects
    const tier2Effects = [9, 10, 8, 14, 15, 16]; // Cloudy Moon, Stormy Storm, etc.
    // Tier 3: Mid-tier effects
    const tier3Effects = [6, 7, 11, 1, 2, 5]; // Hearts, Peace Sign, etc.

    if (tier1Effects.includes(effectId)) {
      return { buyMultiplier: 1.5, sellMultiplier: 1.8 };
    } else if (tier2Effects.includes(effectId)) {
      return { buyMultiplier: 1.3, sellMultiplier: 1.5 };
    } else if (tier3Effects.includes(effectId)) {
      return { buyMultiplier: 1.1, sellMultiplier: 1.2 };
    }
    return { buyMultiplier: 1.0, sellMultiplier: 1.1 }; // Low-tier effects
  }

  /**
   * Calculate confidence in margin calculations
   * @param marketData
   * @param priceHistory
   * @returns {number} Confidence score
   */
  calculateMarginConfidence(marketData, priceHistory) {
    let confidence = 0.5; // Base confidence

    // Data availability confidence
    const totalListings = (marketData.buyCount || 0) + (marketData.sellCount || 0);
    if (totalListings >= 10) {
      confidence += 0.3;
    } else if (totalListings >= 5) {
      confidence += 0.2;
    } else if (totalListings >= 2) {
      confidence += 0.1;
    }

    // Historical data confidence
    if (priceHistory.length >= 50) {
      confidence += 0.2;
    } else if (priceHistory.length >= 20) {
      confidence += 0.15;
    } else if (priceHistory.length >= 10) {
      confidence += 0.1;
    }

    return Math.min(1.0, confidence);
  }

  /**
   * Apply optimized margins to calculated prices
   * @param basePrice
   * @param margins
   * @param side
   * @returns {number} Optimized price
   */
  applyOptimizedMargins(basePrice, margins, side = 'both') {
    const { buyMargin, sellMargin } = margins;

    if (side === 'buy') {
      return basePrice * (1 - buyMargin);
    } else if (side === 'sell') {
      return basePrice * (1 + sellMargin);
    } else {
      return {
        buy: basePrice * (1 - buyMargin),
        sell: basePrice * (1 + sellMargin),
        spread: basePrice * (sellMargin + buyMargin),
        profitPercentage: ((sellMargin + buyMargin) / (1 - buyMargin)) * 100,
      };
    }
  }

  /**
   * Analyse profit potential for an item
   * @param marketData
   * @param priceHistory
   * @param currentPrice
   * @param itemMetadata
   * @returns {object} Profit analysis results
   */
  analyzeProfitPotential(marketData, priceHistory, currentPrice, itemMetadata = {}) {
    try {
      const margins = this.calculateOptimalMargins(marketData, priceHistory, itemMetadata);
      const pricingResult = this.applyOptimizedMargins(currentPrice, margins);

      // Calculate expected daily volume and profit
      const totalListings = (marketData.buyCount || 0) + (marketData.sellCount || 0);
      const estimatedDailyVolume = Math.max(1, totalListings * 0.1); // Rough estimate

      return {
        margins,
        pricing: pricingResult,
        volume: {
          estimated: estimatedDailyVolume,
          confidence: margins.confidence,
        },
        profit: {
          perUnit: pricingResult.spread,
          percentagePerUnit: pricingResult.profitPercentage,
          estimatedDaily: estimatedDailyVolume * pricingResult.spread,
        },
        risk: {
          level: this.assessRiskLevel(margins, marketData),
          factors: this.identifyRiskFactors(marketData, priceHistory),
        },
      };
    } catch (error) {
      console.warn('Profit analysis failed:', error.message);
      return null;
    }
  }

  /**
   * Assess risk level for the item
   * @param margins
   * @param marketData
   * @returns {string} Risk level
   */
  assessRiskLevel(margins) {
    const { factors } = margins;
    let riskScore = 0;

    // Liquidity risk
    riskScore += factors.liquidity * 0.4;

    // Volatility risk
    riskScore += factors.volatility * 0.3;

    // Competition risk (inverse)
    riskScore += (1 - factors.competition) * 0.2;

    // Trend risk
    riskScore += Math.abs(factors.trend) * 0.1;

    if (riskScore <= 0.3) {
      return 'low';
    }
    if (riskScore <= 0.6) {
      return 'medium';
    }
    return 'high';
  }

  /**
   * Identify specific risk factors
   * @param marketData
   * @param priceHistory
   * @returns {Array} Array of risk factors
   */
  identifyRiskFactors(marketData, priceHistory) {
    const factors = [];

    if ((marketData.buyCount || 0) + (marketData.sellCount || 0) < 3) {
      factors.push('Low liquidity - limited market data');
    }

    if (priceHistory.length >= 10) {
      const volatility = this.calculateVolatilityFactor(priceHistory);
      if (volatility > 0.5) {
        factors.push('High price volatility');
      }
    }

    if ((marketData.buyCount || 0) > 15 || (marketData.sellCount || 0) > 15) {
      factors.push('High competition - many competitors');
    }

    return factors;
  }
}

module.exports = ProfitOptimizer;

const Methods = require('../lib/methods');

/**
 * Market Analyzer - Real-time market condition detection for competitive pricing
 * Focuses on identifying market momentum, liquidity conditions, and competitive pressure
 */
class MarketAnalyzer {
  constructor(config = {}) {
    this.methods = new Methods();
    this.config = {
      momentumThreshold: config.momentumThreshold || 0.05, // 5% price movement threshold
      liquidityThreshold: config.liquidityThreshold || 10, // Minimum total listings for liquid market
      competitivePressureThreshold: config.competitivePressureThreshold || 0.08, // 8% spread threshold
      recentTimeWindow: config.recentTimeWindow || 3600, // 1 hour for "recent" data
      ...config,
    };
  }

  /**
   * Analyze current market conditions for an item
   * @param {Array} buyListings Current buy listings
   * @param {Array} sellListings Current sell listings
   * @param {Array} priceHistory Recent price history
   * @param {number} keyPrice Current key price
   * @returns {object} Market analysis results
   */
  analyzeMarketConditions(buyListings, sellListings, priceHistory, keyPrice) {
    const now = Date.now() / 1000;

    // Convert all listings to metal for analysis
    const buyPrices = buyListings.map((l) => this.methods.toMetal(l.currencies, keyPrice));
    const sellPrices = sellListings.map((l) => this.methods.toMetal(l.currencies, keyPrice));

    // Calculate basic market metrics
    const totalListings = buyListings.length + sellListings.length;
    const bestBid = buyPrices.length > 0 ? Math.max(...buyPrices) : 0;
    const bestAsk = sellPrices.length > 0 ? Math.min(...sellPrices) : 0;
    const midPrice = bestBid > 0 && bestAsk > 0 ? (bestBid + bestAsk) / 2 : 0;
    const spread = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0;
    const spreadPercentage = midPrice > 0 ? spread / midPrice : 0;

    // Analyze liquidity
    const totalVolume = [...buyListings, ...sellListings].reduce(
      (sum, l) => sum + (l.stock || 1),
      0
    );
    const liquidityCondition = this.assessLiquidity(totalListings, totalVolume, spreadPercentage);

    // Analyze momentum from price history
    const momentum = this.calculateMomentum(priceHistory, now);

    // Detect competitive pressure
    const competitivePressure = this.assessCompetitivePressure(
      buyListings,
      sellListings,
      spreadPercentage
    );

    // Market regime detection
    const regime = this.detectMarketRegime(liquidityCondition, momentum, competitivePressure);

    return {
      liquidity: liquidityCondition,
      momentum,
      competitivePressure,
      regime,
      metrics: {
        totalListings,
        totalVolume,
        bestBid,
        bestAsk,
        midPrice,
        spread,
        spreadPercentage,
      },
      recommendations: this.generatePricingRecommendations(regime, momentum, liquidityCondition),
    };
  }

  /**
   * Calculate price momentum from recent history
   * @param {Array} priceHistory Price history data
   * @param {number} currentTime Current timestamp
   * @returns {object} Momentum analysis
   */
  calculateMomentum(priceHistory, currentTime) {
    if (!priceHistory || priceHistory.length < 3) {
      return { direction: 'neutral', strength: 0, confidence: 0 };
    }

    // Filter recent data (last hour)
    const recentPrices = priceHistory.filter(
      (p) => currentTime - p.timestamp <= this.config.recentTimeWindow
    );

    if (recentPrices.length < 2) {
      return { direction: 'neutral', strength: 0, confidence: 0 };
    }

    // Sort by timestamp
    recentPrices.sort((a, b) => a.timestamp - b.timestamp);

    // Calculate weighted momentum (more recent = higher weight)
    let weightedPriceChange = 0;
    let totalWeight = 0;
    const firstPrice = recentPrices[0].value;

    for (let i = 1; i < recentPrices.length; i++) {
      const price = recentPrices[i].value;
      const age = currentTime - recentPrices[i].timestamp;
      const weight = Math.exp(-age / (this.config.recentTimeWindow / 3)); // Exponential decay
      const priceChange = (price - firstPrice) / firstPrice;

      weightedPriceChange += priceChange * weight;
      totalWeight += weight;
    }

    const momentum = totalWeight > 0 ? weightedPriceChange / totalWeight : 0;
    const strength = Math.abs(momentum);

    let direction = 'neutral';
    if (momentum > this.config.momentumThreshold) {
      direction = 'upward';
    } else if (momentum < -this.config.momentumThreshold) {
      direction = 'downward';
    }

    return {
      direction,
      strength,
      confidence: Math.min(1, recentPrices.length / 5), // Confidence based on data points
      rawMomentum: momentum,
    };
  }

  /**
   * Assess market liquidity conditions
   * @param {number} totalListings Total number of listings
   * @param {number} totalVolume Total volume available
   * @param {number} spreadPercentage Current spread percentage
   * @returns {object} Liquidity assessment
   */
  assessLiquidity(totalListings, totalVolume, spreadPercentage) {
    let condition = 'normal';
    let score = 0.5;

    // Penalize low listing count
    if (totalListings < 5) {
      condition = 'illiquid';
      score = 0.2;
    } else if (totalListings < this.config.liquidityThreshold) {
      condition = 'low';
      score = 0.35;
    } else if (totalListings > this.config.liquidityThreshold * 2) {
      condition = 'high';
      score = 0.8;
    }

    // Adjust for spread (tighter spread = better liquidity)
    if (spreadPercentage > 0.15) {
      condition = 'illiquid';
      score = Math.min(score, 0.3);
    } else if (spreadPercentage < 0.05) {
      score = Math.min(1, score + 0.2);
    }

    // Consider volume
    const avgVolume = totalVolume / Math.max(1, totalListings);
    if (avgVolume > 5) {
      score = Math.min(1, score + 0.1);
    }

    return {
      condition,
      score,
      totalListings,
      totalVolume,
      spreadPercentage,
    };
  }

  /**
   * Assess competitive pressure in the market
   * @param {Array} buyListings Buy listings
   * @param {Array} sellListings Sell listings
   * @param {number} spreadPercentage Current spread percentage
   * @returns {object} Competitive pressure assessment
   */
  assessCompetitivePressure(buyListings, sellListings, spreadPercentage) {
    // Calculate listing density at top prices
    const buyPrices = buyListings
      .map((l) => this.methods.toMetal(l.currencies, 60))
      .sort((a, b) => b - a);
    const sellPrices = sellListings
      .map((l) => this.methods.toMetal(l.currencies, 60))
      .sort((a, b) => a - b);

    let pressure = 'normal';
    let score = 0.5;

    // High density of similar priced listings = high competition
    if (buyPrices.length >= 3) {
      const topBuySpread = (buyPrices[0] - buyPrices[2]) / buyPrices[0];
      if (topBuySpread < 0.02) {
        // Top 3 buy orders within 2%
        pressure = 'high';
        score = 0.8;
      }
    }

    if (sellPrices.length >= 3) {
      const topSellSpread = (sellPrices[2] - sellPrices[0]) / sellPrices[0];
      if (topSellSpread < 0.02) {
        // Top 3 sell orders within 2%
        pressure = 'high';
        score = Math.max(score, 0.8);
      }
    }

    // Tight overall spread also indicates competition
    if (spreadPercentage < this.config.competitivePressureThreshold) {
      pressure = 'high';
      score = Math.max(score, 0.7);
    } else if (spreadPercentage > 0.2) {
      pressure = 'low';
      score = 0.3;
    }

    return {
      pressure,
      score,
      spreadPercentage,
      listingDensity: {
        buyTop3Spread: buyPrices.length >= 3 ? (buyPrices[0] - buyPrices[2]) / buyPrices[0] : null,
        sellTop3Spread:
          sellPrices.length >= 3 ? (sellPrices[2] - sellPrices[0]) / sellPrices[0] : null,
      },
    };
  }

  /**
   * Detect current market regime
   * @param {object} liquidity Liquidity assessment
   * @param {object} momentum Momentum analysis
   * @param {object} competitivePressure Competitive pressure assessment
   * @returns {string} Market regime
   */
  detectMarketRegime(liquidity, momentum, competitivePressure) {
    // High competition + good liquidity = "competitive_market"
    if (competitivePressure.pressure === 'high' && liquidity.condition !== 'illiquid') {
      return 'competitive_market';
    }

    // Strong momentum + good liquidity = "trending_market"
    if (momentum.strength > this.config.momentumThreshold && liquidity.condition !== 'illiquid') {
      return 'trending_market';
    }

    // Low liquidity = "thin_market"
    if (liquidity.condition === 'illiquid') {
      return 'thin_market';
    }

    // High momentum + high competition = "volatile_competitive"
    if (
      momentum.strength > this.config.momentumThreshold &&
      competitivePressure.pressure === 'high'
    ) {
      return 'volatile_competitive';
    }

    return 'normal_market';
  }

  /**
   * Generate pricing recommendations based on market analysis
   * @param {string} regime Market regime
   * @param {object} momentum Momentum data
   * @param {object} liquidity Liquidity data
   * @returns {object} Pricing recommendations
   */
  generatePricingRecommendations(regime, momentum, liquidity) {
    const recommendations = {
      buyAdjustment: 1.0,
      sellAdjustment: 1.0,
      aggressiveness: 'normal',
      updateFrequency: 'normal',
      strategy: 'balanced',
    };

    switch (regime) {
      case 'competitive_market':
        // Be aggressive to compete
        recommendations.buyAdjustment = 1.02; // Pay slightly more
        recommendations.sellAdjustment = 0.98; // Price slightly lower
        recommendations.aggressiveness = 'high';
        recommendations.updateFrequency = 'high';
        recommendations.strategy = 'aggressive_competitive';
        break;

      case 'trending_market':
        // Follow the trend but with profit protection
        if (momentum.direction === 'upward') {
          recommendations.buyAdjustment = 1.01; // Buy a bit higher in uptrend
          recommendations.sellAdjustment = 1.01; // Sell higher too
        } else if (momentum.direction === 'downward') {
          recommendations.buyAdjustment = 0.99; // Buy lower in downtrend
          recommendations.sellAdjustment = 0.99; // Sell lower too
        }
        recommendations.aggressiveness = 'moderate';
        recommendations.strategy = 'trend_following';
        break;

      case 'thin_market':
        // Be more conservative in thin markets
        recommendations.buyAdjustment = 0.95; // Lower buy prices
        recommendations.sellAdjustment = 1.08; // Higher sell prices
        recommendations.aggressiveness = 'low';
        recommendations.updateFrequency = 'low';
        recommendations.strategy = 'conservative_wide_spread';
        break;

      case 'volatile_competitive':
        // Quick updates but moderate positioning
        recommendations.buyAdjustment = 1.005; // Slight premium
        recommendations.sellAdjustment = 0.995; // Slight discount
        recommendations.aggressiveness = 'moderate';
        recommendations.updateFrequency = 'very_high';
        recommendations.strategy = 'nimble_competitive';
        break;

      default: // normal_market
        recommendations.strategy = 'balanced';
        break;
    }

    return recommendations;
  }

  /**
   * Calculate optimal spread for current market conditions
   * @param {object} marketAnalysis Market analysis results
   * @param {number} baseSpread Base spread to adjust
   * @returns {number} Recommended spread
   */
  calculateOptimalSpread(marketAnalysis, baseSpread = 0.1) {
    const { regime, liquidity, competitivePressure } = marketAnalysis;

    let spreadMultiplier = 1.0;

    // Adjust based on regime
    switch (regime) {
      case 'competitive_market':
        spreadMultiplier = 0.6; // Tighter spreads in competition
        break;
      case 'thin_market':
        spreadMultiplier = 2.0; // Wider spreads in thin markets
        break;
      case 'volatile_competitive':
        spreadMultiplier = 0.8; // Moderately tight
        break;
      default:
        spreadMultiplier = 1.0;
    }

    // Adjust for liquidity
    if (liquidity.condition === 'illiquid') {
      spreadMultiplier *= 1.5;
    } else if (liquidity.condition === 'high') {
      spreadMultiplier *= 0.8;
    }

    return Math.max(0.02, baseSpread * spreadMultiplier); // Minimum 2% spread
  }
}

module.exports = MarketAnalyzer;

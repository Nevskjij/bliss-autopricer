const Methods = require('../methods');

/**
 * Streamlined Advanced Pricing for Profit-Focused Trading
 * Focused on: Competitive pricing, profit protection, accurate valuation
 */
class AdvancedPricing {
  constructor(config = {}) {
    this.methods = new Methods();
    this.config = {
      outlierThreshold: config.outlierThreshold || 2.0, // More aggressive outlier removal
      minConfidenceLevel: config.minConfidenceLevel || 0.6, // Practical confidence level
      volumeWeight: config.volumeWeight || 0.3, // Weight volume in pricing
      ageDecayRate: config.ageDecayRate || 0.85, // How fast old prices lose weight
      ...config,
    };
  }

  /**
   * Volume-weighted average price (VWAP) - CORE METHOD
   * Considers trading volume for more accurate pricing
   * @param {Array} listings
   * @param {number} keyPrice
   * @returns {number|null} Volume-weighted average price
   */
  calculateVWAP(listings, keyPrice = 60) {
    if (!listings.length) {
      return null;
    }

    let totalValue = 0;
    let totalVolume = 0;

    listings.forEach((listing) => {
      const price = this.methods.toMetal(listing.currencies, keyPrice);
      const volume = Math.max(1, listing.stock || 1); // Minimum volume of 1
      totalValue += price * volume;
      totalVolume += volume;
    });

    return totalVolume > 0 ? totalValue / totalVolume : null;
  }

  /**
   * Time-weighted average with exponential decay - ESSENTIAL for fresh prices
   * @param {Array} priceHistory Array of {value, timestamp, side} objects
   * @param {number} halfLifeHours How quickly prices lose relevance
   * @returns {number|null} Time-weighted average price
   */
  calculateTimeWeightedAverage(priceHistory, halfLifeHours = 8) {
    if (!priceHistory.length) {
      return null;
    }

    const now = Date.now() / 1000;
    const decayConstant = Math.log(2) / (halfLifeHours * 3600);

    let weightedSum = 0;
    let totalWeight = 0;

    priceHistory.forEach((price) => {
      const age = Math.max(0, now - price.timestamp);
      const weight = Math.exp(-decayConstant * age);
      weightedSum += price.value * weight;
      totalWeight += weight;
    });

    return totalWeight > 0 ? weightedSum / totalWeight : null;
  }

  /**
   * Market depth analysis - CRITICAL for competitive pricing
   * @param {Array} buyListings
   * @param {Array} sellListings
   * @param {number} keyPrice
   * @returns {object} Market depth analysis results
   */
  analyzeMarketDepth(buyListings, sellListings, keyPrice) {
    const buyPrices = buyListings.map((l) => this.methods.toMetal(l.currencies, keyPrice));
    const sellPrices = sellListings.map((l) => this.methods.toMetal(l.currencies, keyPrice));

    if (!buyPrices.length || !sellPrices.length) {
      return {
        spread: null,
        depth: 'insufficient_data',
        competitive: false,
      };
    }

    const bestBid = Math.max(...buyPrices);
    const bestAsk = Math.min(...sellPrices);
    const spread = bestAsk - bestBid;
    const midPrice = (bestBid + bestAsk) / 2;

    // Calculate market depth
    const buyDepth = buyListings.reduce((sum, l) => sum + (l.stock || 1), 0);
    const sellDepth = sellListings.reduce((sum, l) => sum + (l.stock || 1), 0);

    return {
      bestBid,
      bestAsk,
      spread,
      spreadPercentage: spread / midPrice,
      midPrice,
      buyDepth,
      sellDepth,
      depthRatio: buyDepth / (sellDepth || 1),
      liquidity: Math.min(buyDepth, sellDepth),
      competitive: spread / midPrice < 0.15, // Market is competitive if spread < 15%
    };
  }

  /**
   * Smart synthetic price generation - ONLY when needed
   * @param {number} availablePrice
   * @param {string} side 'buy' or 'sell'
   * @param {object} marketContext
   * @returns {object} Synthetic price result
   */
  generateSyntheticPrice(availablePrice, side, marketContext = {}) {
    const { spreadHint = 0.1, competition = 'normal' } = marketContext;
    
    // Conservative approach for profit protection
    let adjustment;
    if (side === 'buy') {
      // For buy prices, be conservative (pay less)
      adjustment = competition === 'high' ? 0.88 : 0.92;
    } else {
      // For sell prices, be competitive but profitable
      adjustment = competition === 'high' ? 1.08 : 1.12;
    }

    // Apply spread hint if available
    if (spreadHint && spreadHint > 0) {
      const spreadMultiplier = side === 'buy' ? 1 - spreadHint : 1 + spreadHint;
      adjustment = (adjustment + spreadMultiplier) / 2; // Average the approaches
    }

    return {
      price: this.methods.getRight(availablePrice * adjustment),
      confidence: 0.4, // Lower confidence for synthetic prices
      method: `synthetic_${side}_${competition}`,
      adjustment,
    };
  }

  /**
   * Quick confidence scoring - SIMPLIFIED
   * @param {object} priceData
   * @returns {object} Confidence analysis
   */
  calculatePriceConfidence(priceData) {
    let confidence = 0.3; // Base confidence

    // Sample size factor (30% weight)
    const sampleSize = priceData.sampleSize || 0;
    confidence += Math.min(0.3, (sampleSize / 15) * 0.3);

    // Recency factor (25% weight)
    if (priceData.avgAge !== undefined) {
      const maxAge = 12 * 3600; // 12 hours
      confidence += Math.max(0, 0.25 * (1 - priceData.avgAge / maxAge));
    }

    // Market depth factor (25% weight)
    if (priceData.marketDepth !== undefined) {
      confidence += Math.min(0.25, (priceData.marketDepth / 8) * 0.25);
    }

    // Spread factor (20% weight)
    if (priceData.spread !== undefined && priceData.midPrice !== undefined) {
      const spreadRatio = priceData.spread / priceData.midPrice;
      confidence += Math.max(0, 0.2 * (1 - spreadRatio * 5));
    }

    return {
      confidence: Math.min(1, confidence),
      grade: this.getConfidenceGrade(confidence),
    };
  }

  /**
   * Confidence grading
   * @param {number} confidence
   * @returns {string} Grade letter
   */
  getConfidenceGrade(confidence) {
    if (confidence >= 0.85) {
      return 'A';
    }
    if (confidence >= 0.7) {
      return 'B';
    }
    if (confidence >= 0.55) {
      return 'C';
    }
    if (confidence >= 0.4) {
      return 'D';
    }
    return 'F';
  }

  /**
   * MAIN PRICING METHOD - Streamlined multi-factor estimation
   * @param {string} sku
   * @param {Array} buyListings
   * @param {Array} sellListings
   * @param {Array} historicalData
   * @param {object} config
   * @returns {object} Price estimation results
   */
  async estimatePrice(sku, buyListings, sellListings, historicalData, config) {
    const results = {
      buyPrice: null,
      sellPrice: null,
      confidence: null,
      methods: [],
      analysis: {},
    };

    const keyPrice = config.keyPrice || 60;

    // 1. Market depth analysis (always do this)
    const depthAnalysis = this.analyzeMarketDepth(buyListings, sellListings, keyPrice);
    results.analysis.depth = depthAnalysis;

    // 2. VWAP calculation (priority method)
    const pricingMethods = [];

    if (buyListings.length > 0) {
      const buyVWAP = this.calculateVWAP(buyListings, keyPrice);
      if (buyVWAP) {
        pricingMethods.push({
          method: 'vwap',
          side: 'buy',
          price: buyVWAP,
          confidence: 0.8,
        });
      }
    }

    if (sellListings.length > 0) {
      const sellVWAP = this.calculateVWAP(sellListings, keyPrice);
      if (sellVWAP) {
        pricingMethods.push({
          method: 'vwap',
          side: 'sell',
          price: sellVWAP,
          confidence: 0.8,
        });
      }
    }

    // 3. Time-weighted historical prices (if available)
    if (historicalData && historicalData.length > 2) {
      const buyHistory = historicalData.filter((p) => p.side === 'buy');
      const sellHistory = historicalData.filter((p) => p.side === 'sell');

      if (buyHistory.length > 0) {
        const timeWeightedBuy = this.calculateTimeWeightedAverage(buyHistory);
        if (timeWeightedBuy) {
          pricingMethods.push({
            method: 'time_weighted',
            side: 'buy',
            price: timeWeightedBuy,
            confidence: 0.7,
          });
        }
      }

      if (sellHistory.length > 0) {
        const timeWeightedSell = this.calculateTimeWeightedAverage(sellHistory);
        if (timeWeightedSell) {
          pricingMethods.push({
            method: 'time_weighted',
            side: 'sell',
            price: timeWeightedSell,
            confidence: 0.7,
          });
        }
      }
    }

    // 4. Combine results with confidence weighting
    const buyMethods = pricingMethods.filter((m) => m.side === 'buy');
    const sellMethods = pricingMethods.filter((m) => m.side === 'sell');

    if (buyMethods.length > 0) {
      let weightedSum = 0;
      let totalWeight = 0;
      buyMethods.forEach((method) => {
        weightedSum += method.price * method.confidence;
        totalWeight += method.confidence;
      });
      results.buyPrice = this.methods.getRight(weightedSum / totalWeight);
    }

    if (sellMethods.length > 0) {
      let weightedSum = 0;
      let totalWeight = 0;
      sellMethods.forEach((method) => {
        weightedSum += method.price * method.confidence;
        totalWeight += method.confidence;
      });
      results.sellPrice = this.methods.getRight(weightedSum / totalWeight);
    }

    // 5. Calculate overall confidence
    results.confidence = this.calculatePriceConfidence({
      sampleSize: buyListings.length + sellListings.length,
      marketDepth: depthAnalysis.liquidity,
      spread: depthAnalysis.spread,
      midPrice: depthAnalysis.midPrice,
      avgAge: historicalData
        ? historicalData.reduce((sum, h) => sum + (Date.now() / 1000 - h.timestamp), 0) /
          historicalData.length
        : 3600,
    });

    results.methods = pricingMethods;
    return results;
  }
}

module.exports = AdvancedPricing;

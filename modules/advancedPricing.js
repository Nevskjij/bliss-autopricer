const Methods = require('../methods');

/**
 * Advanced pricing algorithms for improved accuracy and coverage
 */
class AdvancedPricing {
  constructor(config = {}) {
    this.methods = new Methods();
    this.config = {
      outlierThreshold: config.outlierThreshold || 2.5, // Z-score threshold
      minConfidenceLevel: config.minConfidenceLevel || 0.7, // Minimum confidence for pricing
      trendWeight: config.trendWeight || 0.3, // Weight for trend analysis
      seasonalAdjustment: config.seasonalAdjustment || true,
      volumeWeight: config.volumeWeight || 0.2, // Weight volume in pricing
      ...config,
    };
  }

  /**
   * Time-weighted moving average with exponential decay
   * Recent prices have more weight than older ones
   * @param priceHistory
   * @param halfLifeHours
   */
  calculateTimeWeightedAverage(priceHistory, halfLifeHours = 12) {
    if (!priceHistory.length) {
      return null;
    }

    const now = Date.now() / 1000;
    const decayConstant = Math.log(2) / (halfLifeHours * 3600);

    let weightedSum = 0;
    let totalWeight = 0;

    priceHistory.forEach((price) => {
      const age = now - price.timestamp;
      const weight = Math.exp(-decayConstant * age);
      weightedSum += price.value * weight;
      totalWeight += weight;
    });

    return totalWeight > 0 ? weightedSum / totalWeight : null;
  }

  /**
   * Volume-weighted average price (VWAP)
   * Considers trading volume when calculating averages
   * @param listings
   */
  calculateVWAP(listings) {
    if (!listings.length) {
      return null;
    }

    let totalValue = 0;
    let totalVolume = 0;

    listings.forEach((listing) => {
      const price = this.methods.toMetal(listing.currencies, listing.keyPrice || 60);
      const volume = listing.stock || 1; // Use stock as volume proxy
      totalValue += price * volume;
      totalVolume += volume;
    });

    return totalVolume > 0 ? totalValue / totalVolume : null;
  }

  /**
   * Bollinger Bands calculation with robust statistics
   * Upper and lower bands based on price volatility
   * @param listings
   * @param period
   * @param multiplier
   */
  calculateBollingerBands(listings, period = 20, multiplier = 2) {
    if (!listings || listings.length < period) {
      return null;
    }

    const prices = listings.map((listing) =>
      this.methods.toMetal(listing.currencies, listing.keyPrice || 60)
    );

    if (prices.length < period) {
      return null;
    }

    // Use robust statistics for better outlier resistance
    const robustEstimators = require('./robustEstimators');
    const estimator = new robustEstimators();

    const recentPrices = prices.slice(-period);
    const robustMean = estimator.calculateAdaptiveRobustMean(recentPrices);
    const mad = estimator.calculateMAD(recentPrices);

    // Convert MAD to approximately standard deviation equivalent
    const robustStdDev = mad * 1.4826;

    return {
      middle: robustMean.value,
      upper: robustMean.value + multiplier * robustStdDev,
      lower: Math.max(0, robustMean.value - multiplier * robustStdDev),
      confidence: robustMean.confidence,
      method: robustMean.method,
      period,
      multiplier,
    };
  }

  /**
   * Market microstructure analysis
   * Analyzes bid-ask spread and market depth
   * @param buyListings
   * @param sellListings
   * @param keyPrice
   */
  analyzeMarketMicrostructure(buyListings, sellListings, keyPrice) {
    const buyPrices = buyListings.map((l) => this.methods.toMetal(l.currencies, keyPrice));
    const sellPrices = sellListings.map((l) => this.methods.toMetal(l.currencies, keyPrice));

    if (!buyPrices.length || !sellPrices.length) {
      return { spread: null, depth: 'insufficient_data' };
    }

    const bestBid = Math.max(...buyPrices);
    const bestAsk = Math.min(...sellPrices);
    const spread = bestAsk - bestBid;
    const midPrice = (bestBid + bestAsk) / 2;

    // Market depth analysis
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
    };
  }

  /**
   * Synthetic price generation using multiple methods
   * When one side of the market is missing
   * @param availablePrice
   * @param side
   * @param marketData
   * @param confidence
   */
  generateSyntheticPrice(availablePrice, side, marketData, confidence = 0.5) {
    const methods = [];

    // Method 1: Historical spread analysis
    if (marketData.historicalSpread) {
      const spreadMultiplier =
        side === 'buy' ? 1 - marketData.historicalSpread : 1 + marketData.historicalSpread;
      methods.push({
        price: availablePrice * spreadMultiplier,
        confidence: 0.7,
        method: 'historical_spread',
      });
    }

    // Method 2: Comparable items analysis
    if (marketData.comparableItems && marketData.comparableItems.length > 0) {
      const avgSpread =
        marketData.comparableItems.reduce(
          (sum, item) => sum + (item.sellPrice - item.buyPrice) / item.sellPrice,
          0
        ) / marketData.comparableItems.length;

      const spreadMultiplier = side === 'buy' ? 1 - avgSpread : 1 + avgSpread;
      methods.push({
        price: availablePrice * spreadMultiplier,
        confidence: 0.6,
        method: 'comparable_spread',
      });
    }

    // Method 3: Quality-based adjustment
    if (marketData.qualityMultiplier) {
      const adjustment = side === 'buy' ? 0.95 : 1.05; // Conservative adjustment
      methods.push({
        price: availablePrice * adjustment * marketData.qualityMultiplier,
        confidence: 0.5,
        method: 'quality_adjustment',
      });
    }

    // Method 4: Volume-based adjustment
    if (marketData.volumeRatio) {
      const volumeAdjustment = Math.min(1.2, Math.max(0.8, 1 + (marketData.volumeRatio - 1) * 0.1));
      methods.push({
        price: availablePrice * volumeAdjustment,
        confidence: 0.4,
        method: 'volume_adjustment',
      });
    }

    if (methods.length === 0) {
      // Fallback: Simple percentage adjustment
      const fallbackAdjustment = side === 'buy' ? 0.9 : 1.1;
      return {
        price: availablePrice * fallbackAdjustment,
        confidence: 0.3,
        method: 'fallback_percentage',
      };
    }

    // Weighted average of all methods
    let weightedSum = 0;
    let totalWeight = 0;
    let methodsUsed = [];

    methods.forEach((method) => {
      weightedSum += method.price * method.confidence;
      totalWeight += method.confidence;
      methodsUsed.push(method.method);
    });

    return {
      price: this.methods.getRight(weightedSum / totalWeight),
      confidence: Math.min(totalWeight / methods.length, 1),
      method: methodsUsed.join('+'),
      alternatives: methods,
    };
  }

  /**
   * Confidence scoring for price estimates
   * Based on multiple factors
   * @param priceData
   */
  calculatePriceConfidence(priceData) {
    let confidence = 0;
    const factors = [];

    // Factor 1: Sample size
    const sampleSize = priceData.sampleSize || 0;
    const sampleFactor = Math.min(1, sampleSize / 10);
    confidence += sampleFactor * 0.3;
    factors.push({ factor: 'sample_size', value: sampleFactor, weight: 0.3 });

    // Factor 2: Price consistency (low variance)
    if (priceData.variance !== undefined) {
      const consistencyFactor = Math.max(0, 1 - priceData.variance / priceData.mean);
      confidence += consistencyFactor * 0.25;
      factors.push({ factor: 'consistency', value: consistencyFactor, weight: 0.25 });
    }

    // Factor 3: Recency of data
    if (priceData.avgAge !== undefined) {
      const maxAge = 24 * 3600; // 24 hours
      const recencyFactor = Math.max(0, 1 - priceData.avgAge / maxAge);
      confidence += recencyFactor * 0.2;
      factors.push({ factor: 'recency', value: recencyFactor, weight: 0.2 });
    }

    // Factor 4: Market depth
    if (priceData.marketDepth !== undefined) {
      const depthFactor = Math.min(1, priceData.marketDepth / 5);
      confidence += depthFactor * 0.15;
      factors.push({ factor: 'market_depth', value: depthFactor, weight: 0.15 });
    }

    // Factor 5: Spread reasonableness
    if (priceData.spread !== undefined && priceData.midPrice !== undefined) {
      const spreadRatio = priceData.spread / priceData.midPrice;
      const spreadFactor = spreadRatio < 0.1 ? 1 : Math.max(0, 1 - (spreadRatio - 0.1) * 5);
      confidence += spreadFactor * 0.1;
      factors.push({ factor: 'spread', value: spreadFactor, weight: 0.1 });
    }

    return {
      confidence: Math.min(1, confidence),
      factors,
      grade: this.getConfidenceGrade(confidence),
    };
  }

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

  /**
   * Trend analysis using linear regression
   * @param priceHistory
   * @param periods
   */
  calculatePriceTrend(priceHistory, periods = 10) {
    if (priceHistory.length < periods) {
      return null;
    }

    const recentPrices = priceHistory.slice(-periods);
    const n = recentPrices.length;

    // Simple linear regression
    let sumX = 0,
      sumY = 0,
      sumXY = 0,
      sumX2 = 0;

    recentPrices.forEach((price, i) => {
      sumX += i;
      sumY += price.value;
      sumXY += i * price.value;
      sumX2 += i * i;
    });

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Calculate R-squared for trend strength
    const meanY = sumY / n;
    let ssRes = 0,
      ssTot = 0;

    recentPrices.forEach((price, i) => {
      const predicted = slope * i + intercept;
      ssRes += Math.pow(price.value - predicted, 2);
      ssTot += Math.pow(price.value - meanY, 2);
    });

    const rSquared = 1 - ssRes / ssTot;

    return {
      slope,
      intercept,
      rSquared,
      trend: slope > 0.01 ? 'upward' : slope < -0.01 ? 'downward' : 'stable',
      strength: Math.abs(slope) * rSquared,
    };
  }

  /**
   * Multi-factor price estimation
   * Combines multiple pricing methods with confidence weighting
   * @param sku
   * @param buyListings
   * @param sellListings
   * @param historicalData
   * @param config
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

    // Market microstructure analysis
    const microstructure = this.analyzeMarketMicrostructure(buyListings, sellListings, keyPrice);
    results.analysis.microstructure = microstructure;

    // Time-weighted averages
    if (historicalData && historicalData.length > 0) {
      const timeWeightedBuy = this.calculateTimeWeightedAverage(
        historicalData.filter((p) => p.side === 'buy')
      );
      const timeWeightedSell = this.calculateTimeWeightedAverage(
        historicalData.filter((p) => p.side === 'sell')
      );

      if (timeWeightedBuy) {
        results.methods.push({
          method: 'time_weighted_average',
          side: 'buy',
          price: timeWeightedBuy,
          confidence: 0.8,
        });
      }

      if (timeWeightedSell) {
        results.methods.push({
          method: 'time_weighted_average',
          side: 'sell',
          price: timeWeightedSell,
          confidence: 0.8,
        });
      }

      // Trend analysis
      results.analysis.trend = this.calculatePriceTrend(historicalData);
    }

    // VWAP calculation
    if (buyListings.length > 0) {
      const buyVWAP = this.calculateVWAP(buyListings);
      if (buyVWAP) {
        results.methods.push({
          method: 'vwap',
          side: 'buy',
          price: buyVWAP,
          confidence: 0.7,
        });
      }
    }

    if (sellListings.length > 0) {
      const sellVWAP = this.calculateVWAP(sellListings);
      if (sellVWAP) {
        results.methods.push({
          method: 'vwap',
          side: 'sell',
          price: sellVWAP,
          confidence: 0.7,
        });
      }
    }

    // Combine results with confidence weighting
    const buyMethods = results.methods.filter((m) => m.side === 'buy');
    const sellMethods = results.methods.filter((m) => m.side === 'sell');

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

    // Calculate overall confidence
    results.confidence = this.calculatePriceConfidence({
      sampleSize: buyListings.length + sellListings.length,
      variance: results.analysis.microstructure.spread,
      mean: results.analysis.microstructure.midPrice,
      marketDepth: results.analysis.microstructure.liquidity,
      spread: results.analysis.microstructure.spread,
    });

    return results;
  }
}

module.exports = AdvancedPricing;

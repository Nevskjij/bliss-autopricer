const Methods = require('../methods');
const RobustEstimators = require('./robustEstimators');
const OrderBookAnalyzer = require('./orderBookAnalyzer');

/**
 * Price Discovery Engine - Advanced price discovery algorithms
 * Implements multiple price discovery methods for optimal pricing
 */
class PriceDiscoveryEngine {
  constructor(config = {}) {
    this.methods = new Methods();
    this.robustEstimators = new RobustEstimators(config.robustEstimators || {});
    this.orderBookAnalyzer = new OrderBookAnalyzer(config.orderBook || {});
    this.config = {
      confidenceThreshold: config.confidenceThreshold || 0.7,
      methodWeights: config.methodWeights || {
        robust: 0.3,
        orderBook: 0.25,
        traditional: 0.2,
        consensus: 0.15,
        adaptive: 0.1,
      },
      adaptiveMode: config.adaptiveMode !== false,
      ...config,
    };
  }

  /**
   * Main price discovery method
   * @param {Array} buyListings - Buy listings
   * @param {Array} sellListings - Sell listings
   * @param {Array} priceHistory - Historical price data
   * @param {number} keyPrice - Current key price
   * @param {object} options - Discovery options
   * @returns {object} - Price discovery results
   */
  async discoverPrice(buyListings, sellListings, priceHistory, keyPrice, options = {}) {
    const discovery = {
      timestamp: Date.now(),
      methods: {},
      consensus: null,
      confidence: 0,
      recommendations: [],
      metadata: {
        buyCount: buyListings.length,
        sellCount: sellListings.length,
        historyLength: priceHistory.length,
        keyPrice,
      },
    };

    try {
      // Method 1: Robust statistical estimation
      discovery.methods.robust = await this.robustStatisticalDiscovery(
        buyListings,
        sellListings,
        keyPrice
      );

      // Method 2: Order book microstructure analysis
      discovery.methods.orderBook = await this.orderBookDiscovery(
        buyListings,
        sellListings,
        keyPrice
      );

      // Method 3: Traditional mean-based discovery
      discovery.methods.traditional = await this.traditionalDiscovery(
        buyListings,
        sellListings,
        keyPrice
      );

      // Method 4: Historical consensus discovery
      if (priceHistory.length > 0) {
        discovery.methods.consensus = await this.consensusDiscovery(
          buyListings,
          sellListings,
          priceHistory,
          keyPrice
        );
      }

      // Method 5: Adaptive discovery based on market conditions
      if (this.config.adaptiveMode) {
        discovery.methods.adaptive = await this.adaptiveDiscovery(
          buyListings,
          sellListings,
          priceHistory,
          keyPrice,
          discovery.methods
        );
      }

      // Combine methods for final consensus
      discovery.consensus = this.combineDiscoveryMethods(discovery.methods);
      discovery.confidence = this.calculateDiscoveryConfidence(discovery);
      discovery.recommendations = this.generateDiscoveryRecommendations(discovery);

      return discovery;
    } catch (error) {
      discovery.error = error.message;
      discovery.confidence = 0;
      return discovery;
    }
  }

  /**
   * Robust statistical price discovery
   * @param {Array} buyListings - Buy listings
   * @param {Array} sellListings - Sell listings
   * @param {number} keyPrice - Key price
   * @returns {object} - Robust discovery results
   */
  async robustStatisticalDiscovery(buyListings, sellListings, keyPrice) {
    const buyPrices = buyListings.map((l) => this.methods.toMetal(l.currencies, keyPrice));
    const sellPrices = sellListings.map((l) => this.methods.toMetal(l.currencies, keyPrice));

    const buyEstimate =
      buyPrices.length > 0 ? this.robustEstimators.calculateRobustMean(buyPrices) : null;
    const sellEstimate =
      sellPrices.length > 0 ? this.robustEstimators.calculateRobustMean(sellPrices) : null;

    // Robust outlier detection
    const buyOutliers = buyPrices.length > 0 ? this.robustEstimators.detectOutliers(buyPrices) : [];
    const sellOutliers =
      sellPrices.length > 0 ? this.robustEstimators.detectOutliers(sellPrices) : [];

    // Clean prices (removing outliers)
    const cleanBuyPrices = buyPrices.filter(
      (_, i) => !buyOutliers.some((outlier) => outlier.index === i)
    );
    const cleanSellPrices = sellPrices.filter(
      (_, i) => !sellOutliers.some((outlier) => outlier.index === i)
    );

    // Re-estimate with clean data
    const cleanBuyEstimate =
      cleanBuyPrices.length > 0
        ? this.robustEstimators.calculateRobustMean(cleanBuyPrices)
        : null;
    const cleanSellEstimate =
      cleanSellPrices.length > 0
        ? this.robustEstimators.calculateAdaptiveRobustMean(cleanSellPrices)
        : null;

    return {
      method: 'robust_statistical',
      buyPrice: cleanBuyEstimate?.value || buyEstimate?.value || null,
      sellPrice: cleanSellEstimate?.value || sellEstimate?.value || null,
      confidence: this.calculateRobustConfidence(
        buyEstimate,
        sellEstimate,
        buyOutliers,
        sellOutliers
      ),
      outliers: { buy: buyOutliers, sell: sellOutliers },
      estimates: {
        buy: { original: buyEstimate, clean: cleanBuyEstimate },
        sell: { original: sellEstimate, clean: cleanSellEstimate },
      },
      dataQuality: this.assessDataQuality(buyPrices, sellPrices, buyOutliers, sellOutliers),
    };
  }

  /**
   * Order book microstructure price discovery
   * @param {Array} buyListings - Buy listings
   * @param {Array} sellListings - Sell listings
   * @param {number} keyPrice - Key price
   * @returns {object} - Order book discovery results
   */
  async orderBookDiscovery(buyListings, sellListings, keyPrice) {
    const analysis = this.orderBookAnalyzer.analyzeOrderBook(buyListings, sellListings, keyPrice);

    if (!analysis.basic.valid) {
      return {
        method: 'order_book',
        buyPrice: null,
        sellPrice: null,
        confidence: 0,
        reason: 'insufficient_data',
      };
    }

    // Use order book insights for price discovery
    let buyPrice = null;
    let sellPrice = null;
    let confidence = 0;

    // Volume-weighted approach
    if (analysis.depth.levels.length > 0) {
      const topLevel = analysis.depth.levels[0];

      // Adjust prices based on market conditions
      if (analysis.imbalance.direction === 'bullish') {
        // Buy pressure - adjust buy price up, sell price up
        buyPrice = topLevel.bidPrice * 1.02;
        sellPrice = topLevel.askPrice * 1.01;
      } else if (analysis.imbalance.direction === 'bearish') {
        // Sell pressure - adjust buy price down, sell price down
        buyPrice = topLevel.bidPrice * 0.99;
        sellPrice = topLevel.askPrice * 0.98;
      } else {
        // Neutral - use mid-prices
        buyPrice = (topLevel.bidPrice + analysis.basic.midPrice) / 2;
        sellPrice = (analysis.basic.midPrice + topLevel.askPrice) / 2;
      }

      // Confidence based on liquidity and stability
      confidence = (analysis.liquidity.score + analysis.stability.overall) / 2;
    }

    return {
      method: 'order_book',
      buyPrice,
      sellPrice,
      confidence,
      analysis,
      insights: {
        imbalance: analysis.imbalance,
        liquidity: analysis.liquidity.score,
        stability: analysis.stability.overall,
        spread: analysis.basic.spreadBps,
      },
    };
  }

  /**
   * Traditional discovery with robust statistical methods
   * @param {Array} buyListings - Buy listings
   * @param {Array} sellListings - Sell listings
   * @param {number} keyPrice - Key price
   * @returns {object} - Traditional discovery results
   */
  async traditionalDiscovery(buyListings, sellListings, keyPrice) {
    const buyPrices = buyListings.map((l) => this.methods.toMetal(l.currencies, keyPrice));
    const sellPrices = sellListings.map((l) => this.methods.toMetal(l.currencies, keyPrice));

    let buyPrice = null;
    let sellPrice = null;
    let confidence = 0;

    if (buyPrices.length > 0) {
      // Use robust estimation when possible, fallback to simple mean
      if (buyPrices.length >= 3) {
        const robustResult = this.robustEstimators.calculateAdaptiveRobustMean(buyPrices);
        buyPrice = robustResult.value;
        confidence += robustResult.confidence * 0.5;
      } else {
        // Simple mean for small samples
        buyPrice = buyPrices.reduce((a, b) => a + b, 0) / buyPrices.length;
        confidence += 0.3; // Lower confidence for small samples
      }
    }

    if (sellPrices.length > 0) {
      // Use robust estimation when possible, fallback to simple mean
      if (sellPrices.length >= 3) {
        const robustResult = this.robustEstimators.calculateAdaptiveRobustMean(sellPrices);
        sellPrice = robustResult.value;
        confidence += robustResult.confidence * 0.5;
      } else {
        // Simple mean for small samples
        sellPrice = sellPrices.reduce((a, b) => a + b, 0) / sellPrices.length;
        confidence += 0.3; // Lower confidence for small samples
      }
    }

    // Confidence based on sample size and consistency
    const totalSamples = buyPrices.length + sellPrices.length;
    const sampleConfidence = Math.min(1, totalSamples / 10);

    // Additional consistency check using robust methods
    let consistencyConfidence = 1;
    if (buyPrices.length > 2) {
      const mad = this.robustEstimators.calculateMAD(buyPrices);
      const median = this.robustEstimators.calculateMedian(buyPrices);
      consistencyConfidence *= median > 0 ? Math.max(0, 1 - mad / median) : 0;
    }
    if (sellPrices.length > 2) {
      const mad = this.robustEstimators.calculateMAD(sellPrices);
      const median = this.robustEstimators.calculateMedian(sellPrices);
      consistencyConfidence *= median > 0 ? Math.max(0, 1 - mad / median) : 0;
    }

    confidence = Math.min(1, (confidence + sampleConfidence + consistencyConfidence) / 3);

    return {
      method: 'traditional_robust',
      buyPrice,
      sellPrice,
      confidence,
      samples: { buy: buyPrices.length, sell: sellPrices.length },
      consistency: consistencyConfidence,
    };
  }

  /**
   * Consensus discovery using historical data
   * @param {Array} buyListings - Buy listings
   * @param {Array} sellListings - Sell listings
   * @param {Array} priceHistory - Historical prices
   * @param {number} keyPrice - Key price
   * @returns {object} - Consensus discovery results
   */
  async consensusDiscovery(buyListings, sellListings, priceHistory, keyPrice) {
    const currentBuyPrices = buyListings.map((l) => this.methods.toMetal(l.currencies, keyPrice));
    const currentSellPrices = sellListings.map((l) => this.methods.toMetal(l.currencies, keyPrice));

    // Recent historical prices (last 7 days)
    const recentHistory = priceHistory.filter(
      (p) => p.timestamp > Date.now() / 1000 - 7 * 24 * 3600
    );

    if (recentHistory.length === 0) {
      return {
        method: 'consensus',
        buyPrice: null,
        sellPrice: null,
        confidence: 0,
        reason: 'no_historical_data',
      };
    }

    // Historical price ranges
    const historicalBuyPrices = recentHistory.filter((p) => p.side === 'buy').map((p) => p.value);
    const historicalSellPrices = recentHistory.filter((p) => p.side === 'sell').map((p) => p.value);

    // Consensus calculation
    let buyPrice = null;
    let sellPrice = null;

    if (currentBuyPrices.length > 0 && historicalBuyPrices.length > 0) {
      const currentAvg = currentBuyPrices.reduce((a, b) => a + b, 0) / currentBuyPrices.length;
      const historicalAvg =
        historicalBuyPrices.reduce((a, b) => a + b, 0) / historicalBuyPrices.length;

      // Weight current more heavily but consider historical context
      buyPrice = currentAvg * 0.7 + historicalAvg * 0.3;
    }

    if (currentSellPrices.length > 0 && historicalSellPrices.length > 0) {
      const currentAvg = currentSellPrices.reduce((a, b) => a + b, 0) / currentSellPrices.length;
      const historicalAvg =
        historicalSellPrices.reduce((a, b) => a + b, 0) / historicalSellPrices.length;

      sellPrice = currentAvg * 0.7 + historicalAvg * 0.3;
    }

    // Confidence based on historical consistency
    const confidence = this.calculateHistoricalConsistency(
      currentBuyPrices,
      currentSellPrices,
      historicalBuyPrices,
      historicalSellPrices
    );

    return {
      method: 'consensus',
      buyPrice,
      sellPrice,
      confidence,
      historical: {
        buyCount: historicalBuyPrices.length,
        sellCount: historicalSellPrices.length,
        period: '7_days',
      },
    };
  }

  /**
   * Adaptive discovery based on market conditions
   * @param {Array} buyListings - Buy listings
   * @param {Array} sellListings - Sell listings
   * @param {Array} priceHistory - Historical prices
   * @param {number} keyPrice - Key price
   * @param {object} otherMethods - Results from other methods
   * @returns {object} - Adaptive discovery results
   */
  async adaptiveDiscovery(buyListings, sellListings, priceHistory, keyPrice, otherMethods) {
    // Assess market conditions
    const conditions = this.assessMarketConditions(
      buyListings,
      sellListings,
      priceHistory,
      keyPrice
    );

    // Select best method based on conditions
    let selectedMethod;
    let adaptationReason;

    if (conditions.volatility === 'high') {
      selectedMethod = 'robust';
      adaptationReason = 'high_volatility_favors_robust_methods';
    } else if (conditions.liquidity === 'low') {
      selectedMethod = 'consensus';
      adaptationReason = 'low_liquidity_favors_historical_consensus';
    } else if (conditions.orderBookQuality === 'high') {
      selectedMethod = 'orderBook';
      adaptationReason = 'high_quality_order_book_favors_microstructure';
    } else {
      selectedMethod = 'traditional';
      adaptationReason = 'normal_conditions_favor_traditional_methods';
    }

    const selectedResult = otherMethods[selectedMethod];

    return {
      method: 'adaptive',
      buyPrice: selectedResult?.buyPrice || null,
      sellPrice: selectedResult?.sellPrice || null,
      confidence: selectedResult?.confidence || 0,
      adaptation: {
        selectedMethod,
        reason: adaptationReason,
        conditions,
      },
    };
  }

  /**
   * Combine multiple discovery methods
   * @param {object} methods - Results from all methods
   * @returns {object} - Combined consensus result
   */
  combineDiscoveryMethods(methods) {
    const validMethods = Object.values(methods).filter(
      (m) => m && m.buyPrice !== null && m.sellPrice !== null && m.confidence > 0
    );

    if (validMethods.length === 0) {
      return {
        buyPrice: null,
        sellPrice: null,
        confidence: 0,
        reason: 'no_valid_methods',
      };
    }

    // Weighted combination based on confidence and method weights
    let weightedBuySum = 0;
    let weightedSellSum = 0;
    let totalWeight = 0;

    validMethods.forEach((method) => {
      const methodWeight = this.config.methodWeights[method.method] || 0.1;
      const weight = method.confidence * methodWeight;

      weightedBuySum += method.buyPrice * weight;
      weightedSellSum += method.sellPrice * weight;
      totalWeight += weight;
    });

    if (totalWeight === 0) {
      return {
        buyPrice: null,
        sellPrice: null,
        confidence: 0,
        reason: 'zero_total_weight',
      };
    }

    const buyPrice = weightedBuySum / totalWeight;
    const sellPrice = weightedSellSum / totalWeight;

    // Consensus confidence
    const avgConfidence =
      validMethods.reduce((sum, m) => sum + m.confidence, 0) / validMethods.length;
    const methodAgreement = this.calculateMethodAgreement(validMethods);
    const confidence = (avgConfidence + methodAgreement) / 2;

    return {
      buyPrice,
      sellPrice,
      confidence,
      methodsUsed: validMethods.length,
      agreement: methodAgreement,
      weights: totalWeight,
    };
  }

  /**
   * Calculate confidence for robust estimation
   * @param {object} buyEst - Buy estimate
   * @param {object} sellEst - Sell estimate
   * @param {Array} buyOutliers - Buy outliers
   * @param {Array} sellOutliers - Sell outliers
   * @returns {number} - Confidence score
   */
  calculateRobustConfidence(buyEst, sellEst, buyOutliers, sellOutliers) {
    let confidence = 0;
    let factors = 0;

    if (buyEst) {
      confidence += buyEst.confidence;
      factors++;
    }

    if (sellEst) {
      confidence += sellEst.confidence;
      factors++;
    }

    if (factors === 0) {
      return 0;
    }

    const baseConfidence = confidence / factors;

    // Penalize for outliers
    const totalSamples =
      (buyEst?.dataCharacteristics?.sampleSize || 0) +
      (sellEst?.dataCharacteristics?.sampleSize || 0);
    const totalOutliers = buyOutliers.length + sellOutliers.length;
    const outlierPenalty = totalSamples > 0 ? totalOutliers / totalSamples : 0;

    return Math.max(0, baseConfidence - outlierPenalty * 0.3);
  }

  /**
   * Assess data quality for pricing
   * @param {Array} buyPrices - Buy prices
   * @param {Array} sellPrices - Sell prices
   * @param {Array} buyOutliers - Buy outliers
   * @param {Array} sellOutliers - Sell outliers
   * @returns {object} - Data quality assessment
   */
  assessDataQuality(buyPrices, sellPrices, buyOutliers, sellOutliers) {
    const totalSamples = buyPrices.length + sellPrices.length;
    const totalOutliers = buyOutliers.length + sellOutliers.length;

    const quality = {
      sampleSize: totalSamples,
      outlierRate: totalSamples > 0 ? totalOutliers / totalSamples : 0,
      balance: totalSamples > 0 ? Math.min(buyPrices.length, sellPrices.length) / totalSamples : 0,
    };

    // Overall quality score
    const sizeScore = Math.min(1, totalSamples / 10);
    const outlierScore = Math.max(0, 1 - quality.outlierRate * 2);
    const balanceScore = quality.balance;

    quality.overall = (sizeScore + outlierScore + balanceScore) / 3;
    quality.grade =
      quality.overall > 0.8
        ? 'excellent'
        : quality.overall > 0.6
          ? 'good'
          : quality.overall > 0.4
            ? 'fair'
            : 'poor';

    return quality;
  }

  /**
   * Calculate historical consistency
   * @param {Array} currentBuy - Current buy prices
   * @param {Array} currentSell - Current sell prices
   * @param {Array} historicalBuy - Historical buy prices
   * @param {Array} historicalSell - Historical sell prices
   * @returns {number} - Consistency score
   */
  calculateHistoricalConsistency(currentBuy, currentSell, historicalBuy, historicalSell) {
    let consistency = 0;
    let factors = 0;

    if (currentBuy.length > 0 && historicalBuy.length > 0) {
      const currentAvg = currentBuy.reduce((a, b) => a + b, 0) / currentBuy.length;
      const historicalAvg = historicalBuy.reduce((a, b) => a + b, 0) / historicalBuy.length;
      const deviation = Math.abs(currentAvg - historicalAvg) / historicalAvg;
      consistency += Math.max(0, 1 - deviation);
      factors++;
    }

    if (currentSell.length > 0 && historicalSell.length > 0) {
      const currentAvg = currentSell.reduce((a, b) => a + b, 0) / currentSell.length;
      const historicalAvg = historicalSell.reduce((a, b) => a + b, 0) / historicalSell.length;
      const deviation = Math.abs(currentAvg - historicalAvg) / historicalAvg;
      consistency += Math.max(0, 1 - deviation);
      factors++;
    }

    return factors > 0 ? consistency / factors : 0;
  }

  /**
   * Assess current market conditions
   * @param {Array} buyListings - Buy listings
   * @param {Array} sellListings - Sell listings
   * @param {Array} priceHistory - Price history
   * @param {number} keyPrice - Key price
   * @returns {object} - Market conditions assessment
   */
  assessMarketConditions(buyListings, sellListings, priceHistory, keyPrice) {
    const conditions = {};

    // Volatility assessment
    if (priceHistory.length > 10) {
      const recentPrices = priceHistory.slice(-10).map((p) => p.value);
      const mean = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
      const variance =
        recentPrices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / recentPrices.length;
      const cv = Math.sqrt(variance) / mean;

      conditions.volatility = cv > 0.15 ? 'high' : cv > 0.08 ? 'medium' : 'low';
    } else {
      conditions.volatility = 'unknown';
    }

    // Liquidity assessment
    const totalListings = buyListings.length + sellListings.length;
    conditions.liquidity = totalListings > 15 ? 'high' : totalListings > 8 ? 'medium' : 'low';

    // Order book quality assessment
    const orderBookAnalysis = this.orderBookAnalyzer.analyzeOrderBook(
      buyListings,
      sellListings,
      keyPrice
    );
    if (orderBookAnalysis.basic.valid) {
      const qualityScore = orderBookAnalysis.quality.score;
      conditions.orderBookQuality =
        qualityScore > 0.7 ? 'high' : qualityScore > 0.4 ? 'medium' : 'low';
    } else {
      conditions.orderBookQuality = 'poor';
    }

    return conditions;
  }

  /**
   * Calculate agreement between methods
   * @param {Array} methods - Array of method results
   * @returns {number} - Agreement score (0-1)
   */
  calculateMethodAgreement(methods) {
    if (methods.length < 2) {
      return 1;
    }

    const buyPrices = methods.map((m) => m.buyPrice).filter((p) => p !== null);
    const sellPrices = methods.map((m) => m.sellPrice).filter((p) => p !== null);

    let agreement = 0;
    let factors = 0;

    if (buyPrices.length > 1) {
      const buyMean = buyPrices.reduce((a, b) => a + b, 0) / buyPrices.length;
      const buyVariance =
        buyPrices.reduce((sum, p) => sum + Math.pow(p - buyMean, 2), 0) / buyPrices.length;
      const buyCV = Math.sqrt(buyVariance) / buyMean;
      agreement += Math.max(0, 1 - buyCV);
      factors++;
    }

    if (sellPrices.length > 1) {
      const sellMean = sellPrices.reduce((a, b) => a + b, 0) / sellPrices.length;
      const sellVariance =
        sellPrices.reduce((sum, p) => sum + Math.pow(p - sellMean, 2), 0) / sellPrices.length;
      const sellCV = Math.sqrt(sellVariance) / sellMean;
      agreement += Math.max(0, 1 - sellCV);
      factors++;
    }

    return factors > 0 ? agreement / factors : 1;
  }

  /**
   * Calculate overall discovery confidence
   * @param {object} discovery - Discovery results
   * @returns {number} - Overall confidence
   */
  calculateDiscoveryConfidence(discovery) {
    if (!discovery.consensus || discovery.consensus.confidence === 0) {
      return 0;
    }

    let confidence = discovery.consensus.confidence;

    // Boost confidence if multiple methods agree
    if (discovery.consensus.methodsUsed > 1) {
      confidence *= 1 + discovery.consensus.agreement * 0.2;
    }

    // Penalize if very few methods succeeded
    if (discovery.consensus.methodsUsed < 2) {
      confidence *= 0.8;
    }

    return Math.min(1, confidence);
  }

  /**
   * Generate discovery recommendations
   * @param {object} discovery - Discovery results
   * @returns {Array} - Array of recommendations
   */
  generateDiscoveryRecommendations(discovery) {
    const recommendations = [];

    if (discovery.confidence < this.config.confidenceThreshold) {
      recommendations.push({
        type: 'warning',
        priority: 'high',
        message: `Low discovery confidence (${(discovery.confidence * 100).toFixed(1)}%). Consider manual review.`,
        action: 'increase_data_requirements',
      });
    }

    if (discovery.consensus && discovery.consensus.methodsUsed < 2) {
      recommendations.push({
        type: 'caution',
        priority: 'medium',
        message: 'Only one method succeeded. Results may be less reliable.',
        action: 'gather_more_data',
      });
    }

    if (discovery.methods.robust?.outliers) {
      const totalOutliers =
        discovery.methods.robust.outliers.buy.length +
        discovery.methods.robust.outliers.sell.length;
      if (totalOutliers > 0) {
        recommendations.push({
          type: 'info',
          priority: 'low',
          message: `${totalOutliers} price outliers detected and filtered.`,
          action: 'monitor_data_quality',
        });
      }
    }

    return recommendations;
  }
}

module.exports = PriceDiscoveryEngine;

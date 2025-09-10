const Methods = require('../lib/methods');

/**
 * Order Book Analyzer - Advanced market microstructure analysis
 * Provides detailed order book analytics for improved pricing
 */
class OrderBookAnalyzer {
  constructor(config = {}) {
    this.methods = new Methods();
    this.config = {
      depthLevels: config.depthLevels || 5, // Number of price levels to analyze
      minSpreadBps: config.minSpreadBps || 10, // Minimum spread in basis points
      liquidityThreshold: config.liquidityThreshold || 100, // Minimum liquidity for analysis
      impactThreshold: config.impactThreshold || 0.02, // 2% price impact threshold
      ...config,
    };
  }

  /**
   * Analyze complete order book structure
   * @param {Array} buyListings - Buy side listings
   * @param {Array} sellListings - Sell side listings
   * @param {number} keyPrice - Current key price
   * @returns {object} - Comprehensive order book analysis
   */
  analyzeOrderBook(buyListings, sellListings, keyPrice) {
    const analysis = {
      timestamp: Date.now(),
      basic: this.calculateBasicMetrics(buyListings, sellListings, keyPrice),
      depth: this.analyzeMarketDepth(buyListings, sellListings, keyPrice),
      liquidity: this.analyzeLiquidity(buyListings, sellListings, keyPrice),
      imbalance: this.calculateOrderImbalance(buyListings, sellListings, keyPrice),
      microstructure: this.analyzeMicrostructure(buyListings, sellListings, keyPrice),
      stability: this.assessPriceStability(buyListings, sellListings, keyPrice),
      quality: this.assessOrderQuality(buyListings, sellListings),
    };

    analysis.recommendations = this.generateOrderBookRecommendations(analysis);
    return analysis;
  }

  /**
   * Calculate basic order book metrics
   * @param {Array} buyListings - Buy listings
   * @param {Array} sellListings - Sell listings
   * @param {number} keyPrice - Key price
   * @returns {object} - Basic metrics
   */
  calculateBasicMetrics(buyListings, sellListings, keyPrice) {
    const buyPrices = buyListings.map((l) => this.methods.toMetal(l.currencies, keyPrice));
    const sellPrices = sellListings.map((l) => this.methods.toMetal(l.currencies, keyPrice));

    if (buyPrices.length === 0 || sellPrices.length === 0) {
      return { valid: false, reason: 'insufficient_data' };
    }

    const bestBid = Math.max(...buyPrices);
    const bestAsk = Math.min(...sellPrices);
    const midPrice = (bestBid + bestAsk) / 2;
    const spread = bestAsk - bestBid;
    const spreadBps = midPrice > 0 ? (spread / midPrice) * 10000 : 0;

    return {
      valid: true,
      bestBid,
      bestAsk,
      midPrice,
      spread,
      spreadBps,
      bidCount: buyListings.length,
      askCount: sellListings.length,
      totalListings: buyListings.length + sellListings.length,
    };
  }

  /**
   * Analyze market depth at multiple price levels
   * @param {Array} buyListings - Buy listings
   * @param {Array} sellListings - Sell listings
   * @param {number} keyPrice - Key price
   * @returns {object} - Market depth analysis
   */
  analyzeMarketDepth(buyListings, sellListings, keyPrice) {
    const buyData = this.processListingsForDepth(buyListings, keyPrice, 'buy');
    const sellData = this.processListingsForDepth(sellListings, keyPrice, 'sell');

    const depthLevels = [];
    const maxLevels = Math.min(this.config.depthLevels, Math.min(buyData.length, sellData.length));

    for (let i = 0; i < maxLevels; i++) {
      depthLevels.push({
        level: i + 1,
        bidPrice: buyData[i]?.price || 0,
        bidVolume: buyData[i]?.volume || 0,
        askPrice: sellData[i]?.price || 0,
        askVolume: sellData[i]?.volume || 0,
        spread: (sellData[i]?.price || 0) - (buyData[i]?.price || 0),
      });
    }

    return {
      levels: depthLevels,
      totalBidVolume: buyData.reduce((sum, level) => sum + level.volume, 0),
      totalAskVolume: sellData.reduce((sum, level) => sum + level.volume, 0),
      averageDepth:
        depthLevels.length > 0
          ? depthLevels.reduce((sum, level) => sum + level.bidVolume + level.askVolume, 0) /
            depthLevels.length
          : 0,
      depthImbalance: this.calculateDepthImbalance(buyData, sellData),
    };
  }

  /**
   * Process listings for depth analysis
   * @param {Array} listings - Listings to process
   * @param {number} keyPrice - Key price
   * @param {string} side - 'buy' or 'sell'
   * @returns {Array} - Processed depth data
   */
  processListingsForDepth(listings, keyPrice, side) {
    const priceVolumes = new Map();

    // Group by price level and sum volumes
    listings.forEach((listing) => {
      const price = this.methods.toMetal(listing.currencies, keyPrice);
      const volume = listing.stock || 1;

      if (priceVolumes.has(price)) {
        priceVolumes.set(price, priceVolumes.get(price) + volume);
      } else {
        priceVolumes.set(price, volume);
      }
    });

    // Convert to array and sort
    const sorted = Array.from(priceVolumes.entries())
      .map(([price, volume]) => ({ price, volume }))
      .sort((a, b) => (side === 'buy' ? b.price - a.price : a.price - b.price));

    return sorted;
  }

  /**
   * Calculate depth imbalance
   * @param {Array} buyData - Buy depth data
   * @param {Array} sellData - Sell depth data
   * @returns {object} - Imbalance metrics
   */
  calculateDepthImbalance(buyData, sellData) {
    const totalBuyVolume = buyData.reduce((sum, level) => sum + level.volume, 0);
    const totalSellVolume = sellData.reduce((sum, level) => sum + level.volume, 0);
    const totalVolume = totalBuyVolume + totalSellVolume;

    if (totalVolume === 0) {
      return { ratio: 1, direction: 'neutral', strength: 0 };
    }

    const ratio = totalBuyVolume / totalSellVolume;
    let direction = 'neutral';
    let strength = 0;

    if (ratio > 1.2) {
      direction = 'buy_heavy';
      strength = Math.min((ratio - 1) / 2, 1);
    } else if (ratio < 0.8) {
      direction = 'sell_heavy';
      strength = Math.min((1 - ratio) / 0.2, 1);
    }

    return {
      ratio,
      direction,
      strength,
      buyVolume: totalBuyVolume,
      sellVolume: totalSellVolume,
    };
  }

  /**
   * Analyze liquidity characteristics
   * @param {Array} buyListings - Buy listings
   * @param {Array} sellListings - Sell listings
   * @param {number} keyPrice - Key price
   * @returns {object} - Liquidity analysis
   */
  analyzeLiquidity(buyListings, sellListings, keyPrice) {
    const basic = this.calculateBasicMetrics(buyListings, sellListings, keyPrice);
    if (!basic.valid) {
      return { valid: false };
    }

    // Calculate market impact for different trade sizes
    const impactSizes = [1, 3, 5, 10]; // Number of items
    const buyImpact = impactSizes.map((size) =>
      this.calculateMarketImpact(buyListings, size, keyPrice, 'buy')
    );
    const sellImpact = impactSizes.map((size) =>
      this.calculateMarketImpact(sellListings, size, keyPrice, 'sell')
    );

    // Liquidity score based on spread and depth
    const spreadScore = Math.max(0, 1 - basic.spreadBps / 500); // Penalize spreads > 5%
    const depthScore = Math.min(1, basic.totalListings / 20); // Reward depth up to 20 listings
    const liquidityScore = (spreadScore + depthScore) / 2;

    return {
      valid: true,
      score: liquidityScore,
      spreadScore,
      depthScore,
      buyImpact,
      sellImpact,
      effectiveSpread: this.calculateEffectiveSpread(buyListings, sellListings, keyPrice),
      resilience: this.calculateMarketResilience(buyListings, sellListings, keyPrice),
    };
  }

  /**
   * Calculate market impact for a given trade size
   * @param {Array} listings - Listings on one side
   * @param {number} size - Trade size
   * @param {number} keyPrice - Key price
   * @param {string} side - 'buy' or 'sell'
   * @returns {object} - Impact metrics
   */
  calculateMarketImpact(listings, size, keyPrice, side) {
    if (listings.length === 0) {
      return { impact: 1, feasible: false };
    }

    const sorted = [...listings].sort((a, b) => {
      const priceA = this.methods.toMetal(a.currencies, keyPrice);
      const priceB = this.methods.toMetal(b.currencies, keyPrice);
      return side === 'buy' ? priceB - priceA : priceA - priceB; // Best prices first
    });

    let remainingSize = size;
    let totalCost = 0;
    let lastPrice = 0;
    let consumed = 0;

    for (const listing of sorted) {
      const price = this.methods.toMetal(listing.currencies, keyPrice);
      const available = listing.stock || 1;
      const takeSize = Math.min(remainingSize, available);

      totalCost += takeSize * price;
      consumed += takeSize;
      lastPrice = price;
      remainingSize -= takeSize;

      if (remainingSize <= 0) {
        break;
      }
    }

    const avgPrice = consumed > 0 ? totalCost / consumed : lastPrice;
    const bestPrice = this.methods.toMetal(sorted[0].currencies, keyPrice);
    const impact = Math.abs(avgPrice - bestPrice) / bestPrice;

    return {
      impact,
      avgPrice,
      bestPrice,
      feasible: remainingSize === 0,
      consumed,
      partialFill: remainingSize > 0,
    };
  }

  /**
   * Calculate effective spread (average of bid-ask spreads weighted by volume)
   * @param {Array} buyListings - Buy listings
   * @param {Array} sellListings - Sell listings
   * @param {number} keyPrice - Key price
   * @returns {number} - Effective spread
   */
  calculateEffectiveSpread(buyListings, sellListings, keyPrice) {
    const basic = this.calculateBasicMetrics(buyListings, sellListings, keyPrice);
    if (!basic.valid) {
      return 0;
    }

    // Volume-weighted effective spread
    let totalVolumeSpread = 0;
    let totalVolume = 0;

    // Consider top 3 levels for each side
    const topBuys = buyListings
      .map((l) => ({ price: this.methods.toMetal(l.currencies, keyPrice), volume: l.stock || 1 }))
      .sort((a, b) => b.price - a.price)
      .slice(0, 3);

    const topSells = sellListings
      .map((l) => ({ price: this.methods.toMetal(l.currencies, keyPrice), volume: l.stock || 1 }))
      .sort((a, b) => a.price - b.price)
      .slice(0, 3);

    topBuys.forEach((buy) => {
      topSells.forEach((sell) => {
        const spread = sell.price - buy.price;
        const weight = Math.min(buy.volume, sell.volume);
        totalVolumeSpread += spread * weight;
        totalVolume += weight;
      });
    });

    return totalVolume > 0 ? totalVolumeSpread / totalVolume : basic.spread;
  }

  /**
   * Calculate market resilience (how quickly order book recovers)
   * @param {Array} buyListings - Buy listings
   * @param {Array} sellListings - Sell listings
   * @param {number} keyPrice - Key price
   * @returns {number} - Resilience score (0-1)
   */
  calculateMarketResilience(buyListings, sellListings, keyPrice) {
    const depth = this.analyzeMarketDepth(buyListings, sellListings, keyPrice);

    if (depth.levels.length < 2) {
      return 0;
    }

    // Resilience based on how much volume exists at subsequent price levels
    let resilienceScore = 0;
    const firstLevel = depth.levels[0];

    for (let i = 1; i < depth.levels.length; i++) {
      const level = depth.levels[i];
      const volumeRatio =
        (level.bidVolume + level.askVolume) / (firstLevel.bidVolume + firstLevel.askVolume);
      resilienceScore += volumeRatio / depth.levels.length;
    }

    return Math.min(1, resilienceScore);
  }

  /**
   * Calculate order flow imbalance
   * @param {Array} buyListings - Buy listings
   * @param {Array} sellListings - Sell listings
   * @param {number} keyPrice - Key price
   * @returns {object} - Imbalance metrics
   */
  calculateOrderImbalance(buyListings, sellListings, keyPrice) {
    const buyVolume = buyListings.reduce((sum, l) => sum + (l.stock || 1), 0);
    const sellVolume = sellListings.reduce((sum, l) => sum + (l.stock || 1), 0);
    const totalVolume = buyVolume + sellVolume;

    if (totalVolume === 0) {
      return { ratio: 1, direction: 'neutral', strength: 0, pressure: 'none' };
    }

    const ratio = buyVolume / sellVolume;
    const imbalance = (buyVolume - sellVolume) / totalVolume;

    let direction = 'neutral';
    let pressure = 'none';
    let strength = Math.abs(imbalance);

    if (imbalance > 0.2) {
      direction = 'bullish';
      pressure = 'buy';
    } else if (imbalance < -0.2) {
      direction = 'bearish';
      pressure = 'sell';
    }

    return {
      ratio,
      imbalance,
      direction,
      strength,
      pressure,
      buyVolume,
      sellVolume,
      confidence: Math.min(1, totalVolume / 10), // Higher confidence with more volume
    };
  }

  /**
   * Analyze market microstructure patterns
   * @param {Array} buyListings - Buy listings
   * @param {Array} sellListings - Sell listings
   * @param {number} keyPrice - Key price
   * @returns {object} - Microstructure analysis
   */
  analyzeMicrostructure(buyListings, sellListings, keyPrice) {
    const basic = this.calculateBasicMetrics(buyListings, sellListings, keyPrice);
    if (!basic.valid) {
      return { valid: false };
    }

    // Price clustering analysis
    const priceClustering = this.analyzePriceClustering(buyListings, sellListings, keyPrice);

    // Order size distribution
    const sizeDistribution = this.analyzeSizeDistribution(buyListings, sellListings);

    // Quote density
    const quoteDensity = this.calculateQuoteDensity(buyListings, sellListings, keyPrice);

    return {
      valid: true,
      clustering: priceClustering,
      sizeDistribution,
      quoteDensity,
      fragmentation: this.calculateFragmentation(buyListings, sellListings, keyPrice),
      concentration: this.calculateMarketConcentration(buyListings, sellListings),
    };
  }

  /**
   * Analyze price clustering patterns
   * @param {Array} buyListings - Buy listings
   * @param {Array} sellListings - Sell listings
   * @param {number} keyPrice - Key price
   * @returns {object} - Price clustering analysis
   */
  analyzePriceClustering(buyListings, sellListings, keyPrice) {
    const allPrices = [...buyListings, ...sellListings].map((l) =>
      this.methods.toMetal(l.currencies, keyPrice)
    );

    if (allPrices.length === 0) {
      return { clustering: 0, roundNumbers: 0 };
    }

    // Count round numbers (ending in .00, .50, etc.)
    const roundNumbers = allPrices.filter((price) => {
      const decimal = price % 1;
      return decimal === 0 || Math.abs(decimal - 0.5) < 0.01;
    }).length;

    const roundRatio = roundNumbers / allPrices.length;

    // Price level concentration
    const priceFreq = new Map();
    allPrices.forEach((price) => {
      const rounded = Math.round(price * 100) / 100; // Round to 2 decimals
      priceFreq.set(rounded, (priceFreq.get(rounded) || 0) + 1);
    });

    const uniquePrices = priceFreq.size;
    const maxFreq = Math.max(...priceFreq.values());
    const clustering = 1 - uniquePrices / allPrices.length;

    return {
      clustering,
      roundNumbers: roundRatio,
      uniquePrices,
      maxFrequency: maxFreq,
      concentration: maxFreq / allPrices.length,
    };
  }

  /**
   * Analyze order size distribution
   * @param {Array} buyListings - Buy listings
   * @param {Array} sellListings - Sell listings
   * @returns {object} - Size distribution analysis
   */
  analyzeSizeDistribution(buyListings, sellListings) {
    const allSizes = [...buyListings, ...sellListings].map((l) => l.stock || 1);

    if (allSizes.length === 0) {
      return { mean: 0, median: 0, std: 0, skewness: 0 };
    }

    const mean = allSizes.reduce((a, b) => a + b, 0) / allSizes.length;
    const sorted = [...allSizes].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];

    const variance =
      allSizes.reduce((sum, size) => sum + Math.pow(size - mean, 2), 0) / allSizes.length;
    const std = Math.sqrt(variance);

    // Calculate skewness
    const skewness =
      std > 0
        ? allSizes.reduce((sum, size) => sum + Math.pow((size - mean) / std, 3), 0) /
          allSizes.length
        : 0;

    return {
      mean,
      median,
      std,
      skewness,
      min: Math.min(...allSizes),
      max: Math.max(...allSizes),
      uniformity: 1 - std / mean, // Higher for more uniform sizes
    };
  }

  /**
   * Calculate quote density
   * @param {Array} buyListings - Buy listings
   * @param {Array} sellListings - Sell listings
   * @param {number} keyPrice - Key price
   * @returns {object} - Quote density metrics
   */
  calculateQuoteDensity(buyListings, sellListings, keyPrice) {
    const allPrices = [...buyListings, ...sellListings].map((l) =>
      this.methods.toMetal(l.currencies, keyPrice)
    );

    if (allPrices.length < 2) {
      return { density: 0, coverage: 0 };
    }

    const sorted = [...allPrices].sort((a, b) => a - b);
    const priceRange = sorted[sorted.length - 1] - sorted[0];
    const avgGap = priceRange / (sorted.length - 1);

    // Quote density = quotes per unit price
    const density = priceRange > 0 ? sorted.length / priceRange : 0;

    // Price coverage - how well quotes cover the range
    let totalGaps = 0;
    for (let i = 1; i < sorted.length; i++) {
      totalGaps += sorted[i] - sorted[i - 1];
    }
    const coverage = priceRange > 0 ? 1 - (totalGaps - priceRange) / priceRange : 1;

    return {
      density,
      coverage: Math.max(0, coverage),
      avgGap,
      priceRange,
      quotes: sorted.length,
    };
  }

  /**
   * Calculate market fragmentation
   * @param {Array} buyListings - Buy listings
   * @param {Array} sellListings - Sell listings
   * @param {number} keyPrice - Key price
   * @returns {number} - Fragmentation score (0-1)
   */
  calculateFragmentation(buyListings, sellListings, keyPrice) {
    const totalListings = buyListings.length + sellListings.length;
    if (totalListings === 0) {
      return 0;
    }

    // Count unique traders
    const traders = new Set();
    [...buyListings, ...sellListings].forEach((listing) => {
      if (listing.steamid) {
        traders.add(listing.steamid);
      }
    });

    // Fragmentation = number of traders / total listings
    // Higher values indicate more fragmented market
    return traders.size / totalListings;
  }

  /**
   * Calculate market concentration
   * @param {Array} buyListings - Buy listings
   * @param {Array} sellListings - Sell listings
   * @returns {object} - Concentration metrics
   */
  calculateMarketConcentration(buyListings, sellListings) {
    const traderVolumes = new Map();

    [...buyListings, ...sellListings].forEach((listing) => {
      const trader = listing.steamid || 'unknown';
      const volume = listing.stock || 1;
      traderVolumes.set(trader, (traderVolumes.get(trader) || 0) + volume);
    });

    const volumes = Array.from(traderVolumes.values()).sort((a, b) => b - a);
    const totalVolume = volumes.reduce((a, b) => a + b, 0);

    if (volumes.length === 0) {
      return { hhi: 0, topTraderShare: 0, top3Share: 0 };
    }

    // Herfindahl-Hirschman Index
    const hhi = volumes.reduce((sum, vol) => sum + Math.pow(vol / totalVolume, 2), 0);

    // Market share of top traders
    const topTraderShare = volumes[0] / totalVolume;
    const top3Share = volumes.slice(0, 3).reduce((a, b) => a + b, 0) / totalVolume;

    return {
      hhi,
      topTraderShare,
      top3Share,
      traders: volumes.length,
      concentration: hhi > 0.25 ? 'high' : hhi > 0.15 ? 'moderate' : 'low',
    };
  }

  /**
   * Assess price stability
   * @param {Array} buyListings - Buy listings
   * @param {Array} sellListings - Sell listings
   * @param {number} keyPrice - Key price
   * @returns {object} - Stability assessment
   */
  assessPriceStability(buyListings, sellListings, keyPrice) {
    const basic = this.calculateBasicMetrics(buyListings, sellListings, keyPrice);
    if (!basic.valid) {
      return { valid: false };
    }

    const liquidity = this.analyzeLiquidity(buyListings, sellListings, keyPrice);
    const imbalance = this.calculateOrderImbalance(buyListings, sellListings, keyPrice);

    // Stability factors
    const spreadStability =
      basic.spreadBps < 200 ? 1 : Math.max(0, 1 - (basic.spreadBps - 200) / 300);
    const volumeStability = Math.min(1, basic.totalListings / 10);
    const imbalanceStability = 1 - imbalance.strength;
    const liquidityStability = liquidity.valid ? liquidity.score : 0;

    const overallStability =
      (spreadStability + volumeStability + imbalanceStability + liquidityStability) / 4;

    return {
      valid: true,
      overall: overallStability,
      spread: spreadStability,
      volume: volumeStability,
      imbalance: imbalanceStability,
      liquidity: liquidityStability,
      rating: overallStability > 0.8 ? 'high' : overallStability > 0.6 ? 'moderate' : 'low',
    };
  }

  /**
   * Assess order quality
   * @param {Array} buyListings - Buy listings
   * @param {Array} sellListings - Sell listings
   * @returns {object} - Order quality assessment
   */
  assessOrderQuality(buyListings, sellListings) {
    const allListings = [...buyListings, ...sellListings];
    if (allListings.length === 0) {
      return { score: 0, factors: {} };
    }

    // Quality factors
    const factors = {};

    // Factor 1: Information completeness
    const completeInfo = allListings.filter(
      (l) => l.currencies && l.steamid && l.stock !== undefined
    ).length;
    factors.completeness = completeInfo / allListings.length;

    // Factor 2: Size consistency
    const sizes = allListings.map((l) => l.stock || 1);
    const avgSize = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    const sizeVariance =
      sizes.reduce((sum, size) => sum + Math.pow(size - avgSize, 2), 0) / sizes.length;
    factors.sizeConsistency = avgSize > 0 ? Math.max(0, 1 - Math.sqrt(sizeVariance) / avgSize) : 0;

    // Factor 3: Price rationality (no extreme outliers)
    const buyPrices = buyListings.map((l) => l.currencies?.metal || 0);
    const sellPrices = sellListings.map((l) => l.currencies?.metal || 0);

    const priceRationality = this.assessPriceRationality(buyPrices, sellPrices);
    factors.priceRationality = priceRationality;

    // Overall quality score
    const score = Object.values(factors).reduce((a, b) => a + b, 0) / Object.keys(factors).length;

    return {
      score,
      factors,
      grade: score > 0.8 ? 'A' : score > 0.6 ? 'B' : score > 0.4 ? 'C' : 'D',
    };
  }

  /**
   * Assess price rationality
   * @param {Array} buyPrices - Buy prices
   * @param {Array} sellPrices - Sell prices
   * @returns {number} - Rationality score (0-1)
   */
  assessPriceRationality(buyPrices, sellPrices) {
    if (buyPrices.length === 0 || sellPrices.length === 0) {
      return 0;
    }

    const maxBuy = Math.max(...buyPrices);
    const minSell = Math.min(...sellPrices);

    // Basic rationality: best buy should be less than best sell
    if (maxBuy >= minSell) {
      return 0.3;
    } // Crossed market penalty

    // Check for reasonable spreads
    const spread = (minSell - maxBuy) / maxBuy;
    if (spread > 0.5) {
      return 0.6;
    } // Very wide spread

    // Check for price clustering sanity
    const allPrices = [...buyPrices, ...sellPrices];
    const priceRange = Math.max(...allPrices) - Math.min(...allPrices);
    const avgPrice = allPrices.reduce((a, b) => a + b, 0) / allPrices.length;

    if (priceRange / avgPrice > 2) {
      return 0.7;
    } // Extreme price variation

    return 1; // Prices look rational
  }

  /**
   * Generate order book recommendations
   * @param {object} analysis - Complete order book analysis
   * @returns {Array} - Array of recommendations
   */
  generateOrderBookRecommendations(analysis) {
    const recommendations = [];

    if (!analysis.basic.valid) {
      recommendations.push({
        type: 'error',
        priority: 'high',
        message: 'Insufficient order book data for reliable pricing.',
        action: 'increase_data_requirements',
      });
      return recommendations;
    }

    // Spread-based recommendations
    if (analysis.basic.spreadBps > 500) {
      recommendations.push({
        type: 'warning',
        priority: 'high',
        message: `Very wide spread (${analysis.basic.spreadBps.toFixed(0)} bps). Price discovery may be poor.`,
        action: 'increase_safety_margins',
      });
    }

    // Liquidity recommendations
    if (analysis.liquidity.valid && analysis.liquidity.score < 0.4) {
      recommendations.push({
        type: 'caution',
        priority: 'medium',
        message: 'Low market liquidity. Consider conservative pricing.',
        action: 'reduce_position_size',
      });
    }

    // Imbalance recommendations
    if (analysis.imbalance.strength > 0.6) {
      recommendations.push({
        type: 'info',
        priority: 'medium',
        message: `Strong ${analysis.imbalance.direction} pressure detected. Consider asymmetric pricing.`,
        action: 'adjust_pricing_bias',
      });
    }

    // Stability recommendations
    if (analysis.stability.valid && analysis.stability.overall < 0.5) {
      recommendations.push({
        type: 'warning',
        priority: 'high',
        message: 'Low price stability detected. Increase monitoring frequency.',
        action: 'increase_monitoring',
      });
    }

    // Concentration recommendations
    if (analysis.microstructure.concentration.hhi > 0.3) {
      recommendations.push({
        type: 'caution',
        priority: 'medium',
        message: 'High market concentration. Single trader dominance risk.',
        action: 'diversify_sources',
      });
    }

    return recommendations;
  }
}

module.exports = OrderBookAnalyzer;

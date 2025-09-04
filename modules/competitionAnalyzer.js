/**
 * Competition Analysis Module
 * Analyzes competitor pricing and market positioning for optimal pricing strategies
 */

class CompetitionAnalyzer {
  constructor(config = {}) {
    this.config = {
      competitorThreshold: config.competitorThreshold || 5, // Min competitors to analyze
      priceAggression: config.priceAggression || 0.5, // Aggressiveness factor (0-1)
      trustBonus: config.trustBonus || 0.02, // 2% bonus for trusted competitors
      volumeWeight: config.volumeWeight || 0.3, // Weight for volume consideration
      ...config,
    };
  }

  /**
   * Analyze competition for an item and suggest optimal pricing
   * @param {Array} buyListings - Buy listings from competitors
   * @param {Array} sellListings - Sell listings from competitors
   * @param {Array} trustedIds - Trusted competitor steam IDs
   * @param {Array} excludedIds - Excluded competitor steam IDs
   * @returns {object} - Competition analysis and pricing recommendations
   */
  analyzeCompetition(buyListings, sellListings, trustedIds = [], excludedIds = []) {
    try {
      // Filter out excluded competitors
      const filteredBuyListings = buyListings.filter(
        (listing) => !excludedIds.includes(listing.steamid)
      );
      const filteredSellListings = sellListings.filter(
        (listing) => !excludedIds.includes(listing.steamid)
      );

      // Analyze buy competition
      const buyAnalysis = this.analyzeBuyCompetition(filteredBuyListings, trustedIds);

      // Analyze sell competition
      const sellAnalysis = this.analyzeSellCompetition(filteredSellListings, trustedIds);

      // Generate pricing recommendations
      const recommendations = this.generatePricingRecommendations(buyAnalysis, sellAnalysis);

      return {
        buyCompetition: buyAnalysis,
        sellCompetition: sellAnalysis,
        recommendations,
        marketDynamics: this.assessMarketDynamics(buyAnalysis, sellAnalysis),
        competitiveAdvantage: this.calculateCompetitiveAdvantage(buyAnalysis, sellAnalysis),
      };
    } catch (error) {
      console.warn('Competition analysis failed:', error.message);
      return null;
    }
  }

  /**
   * Analyze buy-side competition
   * @param buyListings
   * @param trustedIds
   * @returns {object} Buy competition analysis
   */
  analyzeBuyCompetition(buyListings, trustedIds) {
    if (!buyListings || buyListings.length === 0) {
      return { competitorCount: 0, priceRange: null, recommendations: null };
    }

    // Convert to metal prices and sort
    const Methods = require('../methods');
    const methods = new Methods();

    const competitorPrices = buyListings
      .map((listing) => ({
        steamid: listing.steamid,
        price: methods.toMetal(listing.currencies, listing.keyPrice || 60), // Fallback key price
        isTrusted: trustedIds.includes(listing.steamid),
        stock: listing.stock || 1,
      }))
      .sort((a, b) => b.price - a.price); // Highest buy prices first

    const prices = competitorPrices.map((c) => c.price);
    const topPrice = prices[0];
    const bottomPrice = prices[prices.length - 1];
    const averagePrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;

    // Identify market leaders (top 3 prices)
    const marketLeaders = competitorPrices.slice(0, 3);
    const trustedCompetitors = competitorPrices.filter((c) => c.isTrusted);

    // Calculate competition intensity
    const priceRange = topPrice - bottomPrice;
    const priceSpread = priceRange / averagePrice;
    const competitionIntensity = Math.min(1, competitorPrices.length / 10); // Normalize to 0-1

    return {
      competitorCount: competitorPrices.length,
      priceRange: { top: topPrice, bottom: bottomPrice, average: averagePrice },
      priceSpread,
      competitionIntensity,
      marketLeaders,
      trustedCompetitors,
      optimalBuyPrice: this.calculateOptimalBuyPrice(competitorPrices),
      marketPosition: this.calculateMarketPosition(competitorPrices, 'buy'),
    };
  }

  /**
   * Analyze sell-side competition
   * @param sellListings
   * @param trustedIds
   * @returns {object} Sell competition analysis
   */
  analyzeSellCompetition(sellListings, trustedIds) {
    if (!sellListings || sellListings.length === 0) {
      return { competitorCount: 0, priceRange: null, recommendations: null };
    }

    const Methods = require('../methods');
    const methods = new Methods();

    const competitorPrices = sellListings
      .map((listing) => ({
        steamid: listing.steamid,
        price: methods.toMetal(listing.currencies, listing.keyPrice || 60),
        isTrusted: trustedIds.includes(listing.steamid),
        stock: listing.stock || 1,
      }))
      .sort((a, b) => a.price - b.price); // Lowest sell prices first

    const prices = competitorPrices.map((c) => c.price);
    const topPrice = prices[prices.length - 1];
    const bottomPrice = prices[0];
    const averagePrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;

    const marketLeaders = competitorPrices.slice(0, 3); // Lowest prices are market leaders
    const trustedCompetitors = competitorPrices.filter((c) => c.isTrusted);

    const priceRange = topPrice - bottomPrice;
    const priceSpread = priceRange / averagePrice;
    const competitionIntensity = Math.min(1, competitorPrices.length / 10);

    return {
      competitorCount: competitorPrices.length,
      priceRange: { top: topPrice, bottom: bottomPrice, average: averagePrice },
      priceSpread,
      competitionIntensity,
      marketLeaders,
      trustedCompetitors,
      optimalSellPrice: this.calculateOptimalSellPrice(competitorPrices),
      marketPosition: this.calculateMarketPosition(competitorPrices, 'sell'),
    };
  }

  /**
   * Calculate optimal buy price to compete effectively
   * @param competitorPrices
   * @returns {number} Optimal buy price
   */
  calculateOptimalBuyPrice(competitorPrices) {
    if (competitorPrices.length === 0) {
      return null;
    }

    const topPrice = competitorPrices[0].price;
    const secondPrice = competitorPrices.length > 1 ? competitorPrices[1].price : topPrice;

    // Strategy: Beat the second highest price slightly, or top price if only one competitor
    const targetPrice =
      competitorPrices.length === 1
        ? topPrice * (1 + this.config.priceAggression * 0.02)
        : secondPrice * (1 + this.config.priceAggression * 0.01);

    return {
      suggested: targetPrice,
      reasoning:
        competitorPrices.length === 1
          ? 'Slightly above only competitor'
          : 'Beat second-highest price',
      competitiveAdvantage: (targetPrice - topPrice) / topPrice,
    };
  }

  /**
   * Calculate optimal sell price to compete effectively
   * @param competitorPrices
   * @returns {number} Optimal sell price
   */
  calculateOptimalSellPrice(competitorPrices) {
    if (competitorPrices.length === 0) {
      return null;
    }

    const bottomPrice = competitorPrices[0].price;
    // Strategy: Beat the lowest price slightly, but not too aggressively
    const targetPrice =
      competitorPrices.length === 1
        ? bottomPrice * (1 - this.config.priceAggression * 0.02)
        : bottomPrice * (1 - this.config.priceAggression * 0.005);

    return {
      suggested: Math.max(targetPrice, bottomPrice * 0.95), // Don't go below 95% of lowest
      reasoning:
        competitorPrices.length === 1
          ? 'Slightly below only competitor'
          : 'Beat lowest price marginally',
      competitiveAdvantage: (bottomPrice - targetPrice) / bottomPrice,
    };
  }

  /**
   * Calculate market position relative to competitors
   * @param competitorPrices
   * @param side
   * @returns {object} Market position analysis
   */
  calculateMarketPosition(competitorPrices, side) {
    if (competitorPrices.length === 0) {
      return 'no_competition';
    }

    const prices = competitorPrices.map((p) => p.price);

    // Determine position strategy
    if (side === 'buy') {
      // For buying, higher prices are more competitive
      const topQuartile = this.calculatePercentile(prices, 75);

      return {
        strategy: 'aggressive_buyer',
        targetPrice: topQuartile,
        marketShare: 'top_quartile',
        description: 'Aggressive buying to secure inventory',
      };
    } else {
      // For selling, lower prices are more competitive
      const bottomQuartile = this.calculatePercentile(prices, 25);

      return {
        strategy: 'competitive_seller',
        targetPrice: bottomQuartile,
        marketShare: 'bottom_quartile',
        description: 'Competitive pricing for quick sales',
      };
    }
  }

  /**
   * Generate comprehensive pricing recommendations
   * @param buyAnalysis
   * @param sellAnalysis
   * @returns {object} Pricing recommendations with strategy and prices
   */
  generatePricingRecommendations(buyAnalysis, sellAnalysis) {
    const recommendations = {
      strategy: 'balanced',
      buyPrice: null,
      sellPrice: null,
      confidence: 0.5,
      risks: [],
      opportunities: [],
    };

    // Buy side recommendations
    if (buyAnalysis.competitorCount > 0) {
      recommendations.buyPrice = buyAnalysis.optimalBuyPrice;

      if (buyAnalysis.competitionIntensity > 0.7) {
        recommendations.risks.push('High buy-side competition - margins may be squeezed');
      }

      if (buyAnalysis.trustedCompetitors.length > 0) {
        recommendations.opportunities.push(
          'Trusted competitors present - premium pricing possible'
        );
      }
    }

    // Sell side recommendations
    if (sellAnalysis.competitorCount > 0) {
      recommendations.sellPrice = sellAnalysis.optimalSellPrice;

      if (sellAnalysis.competitionIntensity > 0.7) {
        recommendations.risks.push('High sell-side competition - quick sales needed');
      }

      if (sellAnalysis.priceSpread > 0.1) {
        recommendations.opportunities.push('Wide price spread - room for premium pricing');
      }
    }

    // Overall strategy
    const totalCompetition =
      (buyAnalysis.competitorCount || 0) + (sellAnalysis.competitorCount || 0);
    if (totalCompetition < 5) {
      recommendations.strategy = 'market_maker';
      recommendations.confidence = 0.8;
    } else if (totalCompetition > 15) {
      recommendations.strategy = 'price_follower';
      recommendations.confidence = 0.6;
    } else {
      recommendations.strategy = 'competitive';
      recommendations.confidence = 0.7;
    }

    return recommendations;
  }

  /**
   * Assess overall market dynamics
   * @param buyAnalysis
   * @param sellAnalysis
   * @returns {object} Market dynamics assessment
   */
  assessMarketDynamics(buyAnalysis, sellAnalysis) {
    const dynamics = {
      liquidity: 'unknown',
      volatility: 'unknown',
      trend: 'stable',
      health: 'unknown',
    };

    const totalCompetitors =
      (buyAnalysis.competitorCount || 0) + (sellAnalysis.competitorCount || 0);

    // Liquidity assessment
    if (totalCompetitors >= 15) {
      dynamics.liquidity = 'high';
    } else if (totalCompetitors >= 8) {
      dynamics.liquidity = 'medium';
    } else if (totalCompetitors >= 3) {
      dynamics.liquidity = 'low';
    } else {
      dynamics.liquidity = 'very_low';
    }

    // Volatility assessment (based on price spreads)
    const avgSpread = ((buyAnalysis.priceSpread || 0) + (sellAnalysis.priceSpread || 0)) / 2;
    if (avgSpread > 0.2) {
      dynamics.volatility = 'high';
    } else if (avgSpread > 0.1) {
      dynamics.volatility = 'medium';
    } else {
      dynamics.volatility = 'low';
    }

    // Market health
    const hasBalancedSides = buyAnalysis.competitorCount > 0 && sellAnalysis.competitorCount > 0;
    const hasGoodLiquidity = dynamics.liquidity !== 'very_low';
    const hasReasonableSpread = avgSpread > 0.02 && avgSpread < 0.3;

    if (hasBalancedSides && hasGoodLiquidity && hasReasonableSpread) {
      dynamics.health = 'healthy';
    } else if (hasBalancedSides && hasGoodLiquidity) {
      dynamics.health = 'fair';
    } else {
      dynamics.health = 'poor';
    }

    return dynamics;
  }

  /**
   * Calculate competitive advantage score
   * @param buyAnalysis
   * @param sellAnalysis
   * @returns {number} Competitive advantage score
   */
  calculateCompetitiveAdvantage(buyAnalysis, sellAnalysis) {
    let score = 0.5; // Base score

    // Buy side advantages
    if (buyAnalysis.competitorCount === 0) {
      score += 0.3; // No buy competition
    } else if (buyAnalysis.competitorCount < 3) {
      score += 0.15; // Low buy competition
    }

    // Sell side advantages
    if (sellAnalysis.competitorCount === 0) {
      score += 0.3; // No sell competition
    } else if (sellAnalysis.competitorCount < 3) {
      score += 0.15; // Low sell competition
    }

    // Market position advantages
    if (buyAnalysis.trustedCompetitors && buyAnalysis.trustedCompetitors.length > 0) {
      score += 0.1; // Trusted status advantage
    }
    if (sellAnalysis.trustedCompetitors && sellAnalysis.trustedCompetitors.length > 0) {
      score += 0.1;
    }

    return Math.min(1.0, Math.max(0.0, score));
  }

  /**
   * Calculate percentile of array
   * @param arr
   * @param percentile
   * @returns {number} Percentile value
   */
  calculatePercentile(arr, percentile) {
    const sorted = [...arr].sort((a, b) => a - b);
    const index = (percentile / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index % 1;

    if (lower === upper) {
      return sorted[lower];
    }

    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  /**
   * Monitor competition changes over time
   * @param getListingsCallback
   * @param interval
   * @returns {number} Interval ID for monitoring
   */
  monitorCompetition(getListingsCallback, interval = 300000) {
    // 5 minutes default
    const competitionHistory = [];
    const maxHistorySize = 288; // 24 hours of 5-minute intervals

    const analyze = async () => {
      try {
        const { buyListings, sellListings, trustedIds, excludedIds } = await getListingsCallback();
        const analysis = this.analyzeCompetition(
          buyListings,
          sellListings,
          trustedIds,
          excludedIds
        );

        if (analysis) {
          competitionHistory.push({
            timestamp: Date.now(),
            analysis,
          });

          // Trim history
          if (competitionHistory.length > maxHistorySize) {
            competitionHistory.shift();
          }

          return analysis;
        }
      } catch (error) {
        console.warn('Competition monitoring error:', error.message);
      }
      return null;
    };

    const intervalId = setInterval(analyze, interval);

    return {
      stop: () => clearInterval(intervalId),
      getHistory: () => [...competitionHistory],
      analyzeNow: analyze,
    };
  }
}

module.exports = CompetitionAnalyzer;

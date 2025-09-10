/**
 * Streamlined Profit Optimization Engine
 * Fast, effective profit maximization that works with MarketAnalyzer
 */

const RobustEstimators = require('./robustEstimators');

class ProfitOptimizer {
  constructor(config = {}) {
    this.config = {
      baseMarginBuy: config.baseMarginBuy || 0.08, // 8% base buy margin
      baseMarginSell: config.baseMarginSell || 0.1, // 10% base sell margin
      maxMarginBuy: config.maxMarginBuy || 0.15, // 15% max buy margin (more reasonable)
      maxMarginSell: config.maxMarginSell || 0.18, // 18% max sell margin (more reasonable)
      minMarginBuy: config.minMarginBuy || 0.03, // 3% min buy margin (very competitive)
      minMarginSell: config.minMarginSell || 0.05, // 5% min sell margin
      profitTarget: config.profitTarget || 0.06, // 6% target profit per trade (more realistic)
      ...config,
    };
    this.robustEstimators = new RobustEstimators();
  }

  /**
   * Calculate optimal margins using market analysis results
   * @param {object} marketAnalysis Market analysis from MarketAnalyzer
   * @param {number} basePrice Base price for margin calculation
   * @param {object} itemMetadata Item metadata
   * @returns {object} Optimized margins and prices
   */
  optimizeMargins(marketAnalysis, basePrice, itemMetadata = {}) {
    if (!marketAnalysis || !basePrice) {
      return this.getDefaultMargins(basePrice);
    }

    const { regime, liquidity, recommendations } = marketAnalysis;

    let buyMargin = this.config.baseMarginBuy;
    let sellMargin = this.config.baseMarginSell;

    // Adjust margins based on market regime
    switch (regime) {
      case 'competitive_market':
        // Tight margins to compete
        buyMargin = this.config.minMarginBuy * 1.5;
        sellMargin = this.config.minMarginSell * 1.5;
        break;

      case 'thin_market':
        // Wider margins due to low competition
        buyMargin = this.config.maxMarginBuy;
        sellMargin = this.config.maxMarginSell;
        break;

      case 'trending_market':
        // Moderate margins, follow trend
        buyMargin = this.config.baseMarginBuy * 0.8;
        sellMargin = this.config.baseMarginSell * 0.9;
        break;

      case 'volatile_competitive':
        // Quick turns with smaller margins
        buyMargin = this.config.baseMarginBuy * 0.7;
        sellMargin = this.config.baseMarginSell * 0.8;
        break;

      default:
        // Keep base margins
        break;
    }

    // Fine-tune based on liquidity
    if (liquidity.condition === 'illiquid') {
      buyMargin *= 1.3;
      sellMargin *= 1.2;
    } else if (liquidity.condition === 'high') {
      buyMargin *= 0.8;
      sellMargin *= 0.9;
    }

    // Apply market recommendations if available
    if (recommendations) {
      // Use the recommendations as additional guidance
      const aggFactor =
        recommendations.aggressiveness === 'high'
          ? 0.7
          : recommendations.aggressiveness === 'low'
            ? 1.3
            : 1.0;
      buyMargin *= aggFactor;
      sellMargin *= aggFactor;
    }

    // Ensure margins stay within bounds
    buyMargin = Math.max(this.config.minMarginBuy, Math.min(this.config.maxMarginBuy, buyMargin));
    sellMargin = Math.max(
      this.config.minMarginSell,
      Math.min(this.config.maxMarginSell, sellMargin)
    );

    return this.calculatePricesFromMargins(basePrice, buyMargin, sellMargin, regime);
  }

  /**
   * Calculate buy/sell prices from base price and margins
   * @param {number} basePrice Base market price
   * @param {number} buyMargin Buy margin percentage
   * @param {number} sellMargin Sell margin percentage
   * @param {string} regime Market regime for additional logic
   * @returns {object} Buy and sell prices with margins
   */
  calculatePricesFromMargins(basePrice, buyMargin, sellMargin, regime) {
    // In competitive markets, be more aggressive on the buy side
    let buyPrice = basePrice * (1 - buyMargin);
    let sellPrice = basePrice * (1 + sellMargin);

    // Ensure minimum profit margin
    const minProfit = basePrice * this.config.profitTarget;
    if (sellPrice - buyPrice < minProfit) {
      const adjustment = (minProfit - (sellPrice - buyPrice)) / 2;
      buyPrice -= adjustment;
      sellPrice += adjustment;
    }

    return {
      buyPrice: Math.max(0.01, buyPrice), // Minimum 0.01 ref
      sellPrice: Math.max(0.02, sellPrice), // Minimum 0.02 ref
      buyMargin,
      sellMargin,
      expectedProfit: sellPrice - buyPrice,
      profitMargin: (sellPrice - buyPrice) / buyPrice,
      regime,
      strategy: this.getStrategyDescription(regime, buyMargin, sellMargin),
    };
  }

  /**
   * Get default margins when no market analysis is available
   * @param {number} basePrice Base price
   * @returns {object} Default margin calculation
   */
  getDefaultMargins(basePrice) {
    return this.calculatePricesFromMargins(
      basePrice,
      this.config.baseMarginBuy,
      this.config.baseMarginSell,
      'unknown'
    );
  }

  /**
   * Get strategy description for logging
   * @param {string} regime Market regime
   * @param {number} buyMargin Buy margin used
   * @param {number} sellMargin Sell margin used
   * @returns {string} Strategy description
   */
  getStrategyDescription(regime, buyMargin, sellMargin) {
    const avgMargin = (buyMargin + sellMargin) / 2;

    if (avgMargin < 0.08) {
      return `aggressive_${regime}`;
    } else if (avgMargin > 0.15) {
      return `conservative_${regime}`;
    } else {
      return `balanced_${regime}`;
    }
  }

  /**
   * Legacy method for backwards compatibility - simplified
   * @param {object} marketData Market data
   * @param {Array} priceHistory Price history
   * @param {object} itemMetadata Item metadata
   * @returns {object} Margin data
   */
  calculateOptimalMargins(marketData, priceHistory = [], itemMetadata = {}) {
    // Convert to simple format for legacy compatibility
    const basePrice = marketData.midPrice || 1.0;
    const result = this.getDefaultMargins(basePrice);

    // Calculate estimated daily profit (simplified)
    const estimatedDailyVolume = 1; // Simplified assumption
    const avgMargin = (result.buyMargin + result.sellMargin) / 2;
    const estimatedDaily = basePrice * avgMargin * estimatedDailyVolume;

    return {
      margins: {
        buyMargin: result.buyMargin,
        sellMargin: result.sellMargin,
        confidence: 0.7,
        risk: 'medium',
      },
      profit: {
        estimatedDaily: estimatedDaily,
        potential: 'medium',
      },
    };
  }

  /**
   * Apply optimized margins to a base price
   * @param {number} basePrice - Base price to optimize
   * @param {object} margins - Margin configuration
   * @returns {object} - Optimized buy and sell prices
   */
  applyOptimizedMargins(basePrice, margins) {
    const buyPrice = basePrice * (1 - margins.buyMargin);
    const sellPrice = basePrice * (1 + margins.sellMargin);

    return {
      buy: buyPrice,
      sell: sellPrice,
    };
  }
}

module.exports = ProfitOptimizer;

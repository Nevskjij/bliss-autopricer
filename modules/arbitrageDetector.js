/**
 * Market Arbitrage Detection Module
 * Identifies price discrepancies between BPTF and Steam Community Market
 * Enables cross-platform profit opportunities
 */

const { getSCMPrice, getSCMKeyPrice } = require('./steamMarketFetcher');
const { toMarketHashName } = require('./scmPriceCalculator');

class ArbitrageDetector {
  constructor(config = {}) {
    this.config = {
      minArbitrageProfit: config.minArbitrageProfit || 0.15, // Minimum 15% profit
      maxPriceThreshold: config.maxPriceThreshold || 100, // Max price in refined metal
      scmFeeRate: config.scmFeeRate || 0.15, // Steam 15% fee
      bptfFeeRate: config.bptfFeeRate || 0.0, // No BPTF fees
      priceAgeTolerance: config.priceAgeTolerance || 3600, // 1 hour tolerance
      ...config,
    };
  }

  /**
   * Detect arbitrage opportunities between BPTF and SCM
   * @param {string} sku - Item SKU
   * @param {string} name - Item name
   * @param {object} bptfPrice - BPTF price data
   * @param {number} keyMetal - Current key price in metal
   * @param {object} schemaManager - Schema manager instance
   * @returns {Promise<object|null>} - Arbitrage opportunity or null
   */
  async detectArbitrage(sku, name, bptfPrice, keyMetal, schemaManager) {
    try {
      // Get SCM pricing
      const hashName = toMarketHashName(sku, schemaManager.schema);
      const [scmItemPrice, scmKeyPrice] = await Promise.all([
        getSCMPrice(hashName, 'USD'),
        getSCMKeyPrice('USD'),
      ]);

      if (!scmItemPrice || !scmKeyPrice || scmKeyPrice === 0) {
        return null; // SCM data unavailable
      }

      // Convert SCM price to metal
      const scmPriceInKeys = scmItemPrice / scmKeyPrice;
      const scmPriceInMetal = scmPriceInKeys * keyMetal;

      // Convert BPTF prices to metal
      const bptfBuyMetal = bptfPrice.buy.keys * keyMetal + bptfPrice.buy.metal;
      const bptfSellMetal = bptfPrice.sell.keys * keyMetal + bptfPrice.sell.metal;

      // Calculate arbitrage opportunities
      const opportunities = [];

      // Opportunity 1: Buy on SCM, sell on BPTF
      const scmToBptfProfit = this.calculateProfit(scmPriceInMetal, bptfSellMetal, 'scm_to_bptf');
      if (scmToBptfProfit.profitable) {
        opportunities.push({
          type: 'scm_to_bptf',
          buyPlatform: 'Steam Community Market',
          sellPlatform: 'Backpack.tf',
          buyPrice: scmPriceInMetal,
          sellPrice: bptfSellMetal,
          ...scmToBptfProfit,
        });
      }

      // Opportunity 2: Buy on BPTF, sell on SCM
      const bptfToScmProfit = this.calculateProfit(bptfBuyMetal, scmPriceInMetal, 'bptf_to_scm');
      if (bptfToScmProfit.profitable) {
        opportunities.push({
          type: 'bptf_to_scm',
          buyPlatform: 'Backpack.tf',
          sellPlatform: 'Steam Community Market',
          buyPrice: bptfBuyMetal,
          sellPrice: scmPriceInMetal,
          ...bptfToScmProfit,
        });
      }

      if (opportunities.length === 0) {
        return null;
      }

      // Return best opportunity
      const bestOpportunity = opportunities.reduce((best, current) =>
        current.profitPercentage > best.profitPercentage ? current : best
      );

      return {
        sku,
        name,
        hashName,
        bestOpportunity,
        allOpportunities: opportunities,
        priceData: {
          bptf: { buy: bptfBuyMetal, sell: bptfSellMetal },
          scm: { price: scmPriceInMetal, usd: scmItemPrice },
          keyPrice: { metal: keyMetal, usd: scmKeyPrice },
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      console.warn(`Arbitrage detection failed for ${name} (${sku}):`, error.message);
      return null;
    }
  }

  /**
   * Calculate profit for an arbitrage opportunity
   * @param buyPrice
   * @param sellPrice
   * @param type
   */
  calculateProfit(buyPrice, sellPrice, type) {
    let effectiveBuyPrice = buyPrice;
    let effectiveSellPrice = sellPrice;

    // Apply platform fees
    if (type === 'scm_to_bptf') {
      // Buying on SCM (no fee), selling on BPTF (no fee)
      effectiveBuyPrice = buyPrice;
      effectiveSellPrice = sellPrice;
    } else if (type === 'bptf_to_scm') {
      // Buying on BPTF (no fee), selling on SCM (15% fee)
      effectiveBuyPrice = buyPrice;
      effectiveSellPrice = sellPrice * (1 - this.config.scmFeeRate);
    }

    const grossProfit = effectiveSellPrice - effectiveBuyPrice;
    const profitPercentage = grossProfit / effectiveBuyPrice;

    return {
      profitable: grossProfit > 0 && profitPercentage >= this.config.minArbitrageProfit,
      grossProfit,
      profitPercentage,
      effectiveBuyPrice,
      effectiveSellPrice,
      fees: {
        buy: buyPrice - effectiveBuyPrice,
        sell: sellPrice - effectiveSellPrice,
        total: buyPrice - effectiveBuyPrice + (sellPrice - effectiveSellPrice),
      },
    };
  }

  /**
   * Scan multiple items for arbitrage opportunities
   * @param {Array} items - Array of {sku, name, bptfPrice} objects
   * @param {number} keyMetal - Current key price
   * @param {object} schemaManager - Schema manager
   * @returns {Promise<Array>} - Array of arbitrage opportunities
   */
  async scanForArbitrage(items, keyMetal, schemaManager) {
    const opportunities = [];
    const batchSize = 5; // Limit concurrent requests
    const delayBetweenBatches = 1500; // 1.5 second delay between batches

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);

      const batchResults = await Promise.allSettled(
        batch.map((item) =>
          this.detectArbitrage(item.sku, item.name, item.bptfPrice, keyMetal, schemaManager)
        )
      );

      batchResults.forEach((result) => {
        if (result.status === 'fulfilled' && result.value) {
          opportunities.push(result.value);
        }
      });

      // Rate limiting
      if (i + batchSize < items.length) {
        await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches));
      }
    }

    // Sort by profit percentage descending
    return opportunities.sort(
      (a, b) => b.bestOpportunity.profitPercentage - a.bestOpportunity.profitPercentage
    );
  }

  /**
   * Filter arbitrage opportunities by criteria
   * @param opportunities
   * @param filters
   */
  filterOpportunities(opportunities, filters = {}) {
    return opportunities.filter((opp) => {
      // Minimum profit filter
      if (filters.minProfit && opp.bestOpportunity.grossProfit < filters.minProfit) {
        return false;
      }

      // Minimum profit percentage filter
      if (
        filters.minProfitPercentage &&
        opp.bestOpportunity.profitPercentage < filters.minProfitPercentage
      ) {
        return false;
      }

      // Maximum price filter
      if (filters.maxPrice && opp.bestOpportunity.effectiveBuyPrice > filters.maxPrice) {
        return false;
      }

      // Platform filter
      if (filters.buyPlatform && opp.bestOpportunity.buyPlatform !== filters.buyPlatform) {
        return false;
      }

      if (filters.sellPlatform && opp.bestOpportunity.sellPlatform !== filters.sellPlatform) {
        return false;
      }

      return true;
    });
  }

  /**
   * Generate arbitrage report
   * @param opportunities
   */
  generateArbitrageReport(opportunities) {
    if (opportunities.length === 0) {
      return {
        summary: {
          totalOpportunities: 0,
          totalPotentialProfit: 0,
          averageProfitPercentage: 0,
        },
        topOpportunities: [],
        platformBreakdown: {},
      };
    }

    const totalPotentialProfit = opportunities.reduce(
      (sum, opp) => sum + opp.bestOpportunity.grossProfit,
      0
    );

    const averageProfitPercentage =
      opportunities.reduce((sum, opp) => sum + opp.bestOpportunity.profitPercentage, 0) /
      opportunities.length;

    // Platform breakdown
    const platformBreakdown = opportunities.reduce((breakdown, opp) => {
      const type = opp.bestOpportunity.type;
      if (!breakdown[type]) {
        breakdown[type] = { count: 0, totalProfit: 0 };
      }
      breakdown[type].count++;
      breakdown[type].totalProfit += opp.bestOpportunity.grossProfit;
      return breakdown;
    }, {});

    return {
      summary: {
        totalOpportunities: opportunities.length,
        totalPotentialProfit: Math.round(totalPotentialProfit * 100) / 100,
        averageProfitPercentage: Math.round(averageProfitPercentage * 10000) / 100,
      },
      topOpportunities: opportunities.slice(0, 10), // Top 10
      platformBreakdown,
      timestamp: Date.now(),
    };
  }

  /**
   * Monitor arbitrage opportunities over time
   * @param items
   * @param keyMetal
   * @param schemaManager
   * @param callback
   */
  async monitorArbitrage(items, keyMetal, schemaManager, callback) {
    const scan = async () => {
      try {
        const opportunities = await this.scanForArbitrage(items, keyMetal, schemaManager);
        const report = this.generateArbitrageReport(opportunities);

        if (callback) {
          callback(report);
        }

        console.log(`Arbitrage scan complete: ${opportunities.length} opportunities found`);
        return report;
      } catch (error) {
        console.error('Arbitrage monitoring error:', error);
        return null;
      }
    };

    // Initial scan
    await scan();

    // Set up periodic scanning (every 30 minutes)
    const interval = setInterval(scan, 30 * 60 * 1000);

    return {
      stop: () => clearInterval(interval),
      scanNow: scan,
    };
  }
}

module.exports = ArbitrageDetector;

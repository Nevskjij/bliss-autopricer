const Methods = require('../lib/methods');

/**
 * Simplified Robust Statistical Estimators for Profit-Focused Pricing
 * Only includes the most effective methods that actually improve pricing accuracy
 */
class RobustEstimators {
  constructor(config = {}) {
    this.methods = new Methods();
    this.config = {
      trimmedMeanPercent: config.trimmedMeanPercent || 0.15, // 15% trimmed mean (more aggressive)
      outlierThreshold: config.outlierThreshold || 2.5, // Standard deviations for outlier detection
      ...config,
    };
  }

  /**
   * Trimmed Mean - CORE METHOD - removes extreme values from both ends
   * Most practical robust estimator for pricing
   * @param {Array} prices Array of prices
   * @param {number} trimPercent Percentage to trim from each end
   * @returns {number} Trimmed mean
   */
  calculateTrimmedMean(prices, trimPercent = this.config.trimmedMeanPercent) {
    if (prices.length === 0) {
      return 0;
    }
    if (prices.length <= 2) {
      return prices.reduce((a, b) => a + b, 0) / prices.length;
    }

    const sorted = [...prices].sort((a, b) => a - b);
    const trimCount = Math.floor(sorted.length * trimPercent);
    const trimmed = sorted.slice(trimCount, sorted.length - trimCount);

    if (trimmed.length === 0) {
      return sorted[Math.floor(sorted.length / 2)];
    }

    return trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
  }

  /**
   * Median - ESSENTIAL - most robust central tendency measure
   * @param {Array} prices Array of prices
   * @returns {number} Median value
   */
  calculateMedian(prices) {
    if (prices.length === 0) {
      return 0;
    }

    const sorted = [...prices].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    } else {
      return sorted[mid];
    }
  }

  /**
   * Median Absolute Deviation - CRITICAL for outlier detection
   * @param {Array} prices Array of prices
   * @returns {number} MAD value
   */
  calculateMAD(prices) {
    if (prices.length === 0) {
      return 0;
    }

    const median = this.calculateMedian(prices);
    const deviations = prices.map((price) => Math.abs(price - median));
    return this.calculateMedian(deviations);
  }

  /**
   * Interquartile Mean (IQM) - USEFUL for noisy data
   * Mean of values between Q1 and Q3, very robust to outliers
   * @param {Array} prices Array of prices
   * @returns {number} Interquartile mean
   */
  calculateInterquartileMean(prices) {
    if (prices.length === 0) {
      return 0;
    }
    if (prices.length <= 4) {
      return this.calculateMedian(prices);
    }

    const sorted = [...prices].sort((a, b) => a - b);
    const q1Index = Math.floor(sorted.length * 0.25);
    const q3Index = Math.floor(sorted.length * 0.75);

    const iqrValues = sorted.slice(q1Index, q3Index + 1);
    return iqrValues.reduce((a, b) => a + b, 0) / iqrValues.length;
  }

  /**
   * Smart outlier detection using MAD - PRACTICAL method
   * @param {Array} prices Array of prices
   * @param {number} threshold MAD threshold multiplier
   * @returns {Array} Array of outlier indices
   */
  detectOutliers(prices, threshold = this.config.outlierThreshold) {
    if (prices.length < 4) {
      return [];
    }

    const median = this.calculateMedian(prices);
    const mad = this.calculateMAD(prices);

    if (mad === 0) {
      return []; // No variability, no outliers
    }

    const outliers = [];
    prices.forEach((price, index) => {
      const madScore = Math.abs(price - median) / (mad * 1.4826); // Convert to ~std dev units
      if (madScore > threshold) {
        outliers.push({
          index,
          value: price,
          score: madScore,
          severity: madScore > threshold * 1.5 ? 'extreme' : 'moderate',
        });
      }
    });

    return outliers;
  }

  /**
   * MAIN METHOD - Smart robust estimation with automatic method selection
   * Chooses the best estimator based on data characteristics
   * @param {Array} prices Array of prices
   * @returns {object} Estimation result with method and confidence
   */
  calculateRobustMean(prices) {
    if (prices.length === 0) {
      return { value: 0, method: 'none', confidence: 0 };
    }
    if (prices.length === 1) {
      return { value: prices[0], method: 'single', confidence: 1 };
    }

    // Calculate basic statistics
    const arithmeticMean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const median = this.calculateMedian(prices);

    // Detect data quality issues
    const outliers = this.detectOutliers(prices);
    const outlierRatio = outliers.length / prices.length;

    let selectedValue;
    let selectedMethod;
    let confidence;

    // Decision logic based on sample size and outlier contamination
    if (prices.length < 5) {
      // Small sample: use median (most robust)
      selectedValue = median;
      selectedMethod = 'median';
      confidence = 0.7;
    } else if (outlierRatio > 0.2) {
      // High contamination (>20% outliers): use IQM
      selectedValue = this.calculateInterquartileMean(prices);
      selectedMethod = 'interquartile_mean';
      confidence = 0.75;
    } else if (outlierRatio > 0.1) {
      // Moderate contamination (>10% outliers): use trimmed mean
      selectedValue = this.calculateTrimmedMean(prices);
      selectedMethod = 'trimmed_mean';
      confidence = 0.85;
    } else if (outlierRatio > 0.05) {
      // Light contamination (>5% outliers): use light trimmed mean
      selectedValue = this.calculateTrimmedMean(prices, 0.05);
      selectedMethod = 'light_trimmed';
      confidence = 0.9;
    } else {
      // Clean data: use arithmetic mean
      selectedValue = arithmeticMean;
      selectedMethod = 'arithmetic';
      confidence = 0.95;
    }

    // Ensure valid result
    const finalValue = this.methods.getRight(selectedValue);

    return {
      value: finalValue,
      method: selectedMethod,
      confidence,
      sampleSize: prices.length,
      outlierCount: outliers.length,
      outlierRatio,
      alternatives: {
        arithmetic: arithmeticMean,
        median,
        trimmed: this.calculateTrimmedMean(prices),
      },
    };
  }

  /**
   * Clean price array by removing extreme outliers - UTILITY method
   * @param {Array} prices Array of prices
   * @param {number} threshold Outlier threshold
   * @returns {Array} Cleaned price array
   */
  cleanPrices(prices, threshold = 3.0) {
    if (prices.length < 4) {
      return prices;
    }

    const outliers = this.detectOutliers(prices, threshold);
    const outlierIndices = new Set(outliers.map((o) => o.index));

    return prices.filter((_, index) => !outlierIndices.has(index));
  }

  /**
   * Calculate robust spread measure - PRACTICAL method
   * @param {Array} prices Array of prices
   * @returns {number} Robust spread estimate
   */
  calculateRobustSpread(prices) {
    if (prices.length === 0) {
      return 0;
    }

    const mad = this.calculateMAD(prices);
    if (mad > 0) {
      return mad * 1.4826; // Convert MAD to approximate standard deviation
    }

    // Fallback to IQR if MAD is zero
    if (prices.length >= 4) {
      const sorted = [...prices].sort((a, b) => a - b);
      const q1 = sorted[Math.floor(sorted.length * 0.25)];
      const q3 = sorted[Math.floor(sorted.length * 0.75)];
      return (q3 - q1) / 1.349; // Convert IQR to approximate standard deviation
    }

    return 0;
  }
}

module.exports = RobustEstimators;

const Methods = require('../methods');

/**
 * Robust statistical estimators for pricing
 * Implements advanced statistical methods less sensitive to outliers
 */
class RobustEstimators {
  constructor(config = {}) {
    this.methods = new Methods();
    this.config = {
      trimmedMeanPercent: config.trimmedMeanPercent || 0.2, // 20% trimmed mean
      winsorizePercent: config.winsorizePercent || 0.05, // 5% winsorization (caps extreme values)
      huberThreshold: config.huberThreshold || 1.345, // Huber M-estimator threshold
      ...config,
    };
  }

  /**
   * Trimmed Mean - removes extreme values from both ends
   * More robust than arithmetic mean
   * @param {Array} prices - Array of prices
   * @param {number} trimPercent - Percentage to trim from each end
   * @returns {number} - Trimmed mean
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
   * Winsorized Mean - caps extreme values instead of removing them
   * @param {Array} prices - Array of prices
   * @param {number} winsorizePercent - Percentage to winsorize
   * @returns {number} - Winsorized mean
   */
  calculateWinsorizedMean(prices, winsorizePercent = this.config.winsorizePercent) {
    if (prices.length === 0) {
      return 0;
    }
    if (prices.length <= 2) {
      return prices.reduce((a, b) => a + b, 0) / prices.length;
    }

    const sorted = [...prices].sort((a, b) => a - b);
    const lowerIndex = Math.floor(sorted.length * winsorizePercent);
    const upperIndex = Math.floor(sorted.length * (1 - winsorizePercent));

    const lowerCap = sorted[lowerIndex];
    const upperCap = sorted[upperIndex];

    const winsorized = prices.map((price) => {
      if (price < lowerCap) {
        return lowerCap;
      }
      if (price > upperCap) {
        return upperCap;
      }
      return price;
    });

    return winsorized.reduce((a, b) => a + b, 0) / winsorized.length;
  }

  /**
   * Median - most robust central tendency measure
   * @param {Array} prices - Array of prices
   * @returns {number} - Median value
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
   * Interquartile Mean (IQM) - mean of values between Q1 and Q3
   * Very robust to outliers
   * @param {Array} prices - Array of prices
   * @returns {number} - Interquartile mean
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
   * Tukey's Biweight - robust estimator that weights observations
   * @param {Array} prices - Array of prices
   * @param {number} c - Tuning constant (default 6.0)
   * @returns {number} - Biweight estimate
   */
  calculateTukeyBiweight(prices, c = 6.0) {
    if (prices.length === 0) {
      return 0;
    }
    if (prices.length <= 2) {
      return this.calculateMedian(prices);
    }

    let location = this.calculateMedian(prices);
    const mad = this.calculateMAD(prices);

    if (mad === 0) {
      return location;
    }

    // Iteratively refine estimate
    for (let iter = 0; iter < 10; iter++) {
      let numerator = 0;
      let denominator = 0;

      for (const price of prices) {
        const u = (price - location) / (c * mad);

        if (Math.abs(u) < 1) {
          const weight = Math.pow(1 - u * u, 2);
          numerator += weight * price;
          denominator += weight;
        }
      }

      if (denominator === 0) {
        break;
      }

      const newLocation = numerator / denominator;
      if (Math.abs(newLocation - location) < 1e-6) {
        break;
      }
      location = newLocation;
    }

    return location;
  }

  /**
   * Median Absolute Deviation - robust measure of spread
   * @param {Array} prices - Array of prices
   * @returns {number} - MAD value
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
   * Huber M-estimator - robust location estimator
   * @param {Array} prices - Array of prices
   * @param {number} k - Huber threshold
   * @returns {number} - Huber estimate
   */
  calculateHuberMean(prices, k = this.config.huberThreshold) {
    if (prices.length === 0) {
      return 0;
    }
    if (prices.length <= 2) {
      return this.calculateMedian(prices);
    }

    let location = this.calculateMedian(prices);
    const scale = this.calculateMAD(prices) * 1.4826; // Convert MAD to approximate std dev

    if (scale === 0) {
      return location;
    }

    // Iteratively refine estimate
    for (let iter = 0; iter < 20; iter++) {
      let numerator = 0;
      let denominator = 0;

      for (const price of prices) {
        const standardized = (price - location) / scale;

        if (Math.abs(standardized) <= k) {
          // Linear region
          numerator += price;
          denominator += 1;
        } else {
          // Constant region - cap the influence
          const sign = Math.sign(standardized);
          numerator += location + sign * k * scale;
          denominator += 1;
        }
      }

      if (denominator === 0) {
        break;
      }

      const newLocation = numerator / denominator;
      if (Math.abs(newLocation - location) < 1e-6) {
        break;
      }
      location = newLocation;
    }

    return location;
  }

  /**
   * Hodges-Lehmann estimator - robust location estimator based on pairwise medians
   * @param {Array} prices - Array of prices
   * @returns {number} - Hodges-Lehmann estimate
   */
  calculateHodgesLehmann(prices) {
    if (prices.length === 0) {
      return 0;
    }
    if (prices.length === 1) {
      return prices[0];
    }

    const pairwiseMeans = [];

    for (let i = 0; i < prices.length; i++) {
      for (let j = i; j < prices.length; j++) {
        pairwiseMeans.push((prices[i] + prices[j]) / 2);
      }
    }

    return this.calculateMedian(pairwiseMeans);
  }

  /**
   * Adaptive robust estimator - selects best method based on data characteristics
   * @param {Array} prices - Array of prices
   * @param {object} options - Estimation options
   * @returns {object} - Estimation result with method and confidence
   */
  calculateAdaptiveRobustMean(prices, options = {}) {
    if (prices.length === 0) {
      return { value: 0, method: 'none', confidence: 0 };
    }
    if (prices.length === 1) {
      return { value: prices[0], method: 'single', confidence: 1 };
    }

    const results = {};

    // Calculate multiple estimates
    results.arithmetic = prices.reduce((a, b) => a + b, 0) / prices.length;
    results.median = this.calculateMedian(prices);
    results.trimmed = this.calculateTrimmedMean(prices);
    results.winsorized = this.calculateWinsorizedMean(prices);
    results.iqm = this.calculateInterquartileMean(prices);
    results.biweight = this.calculateTukeyBiweight(prices);
    results.huber = this.calculateHuberMean(prices);
    results.hodgesLehmann = this.calculateHodgesLehmann(prices);

    // Assess data characteristics
    const mad = this.calculateMAD(prices);
    const stdDev = Math.sqrt(
      prices.reduce((sum, p) => sum + Math.pow(p - results.arithmetic, 2), 0) / prices.length
    );
    const outlierRatio = stdDev > 0 ? mad / (stdDev * 0.6745) : 1; // MAD efficiency factor

    // Select best method based on characteristics
    let selectedMethod;
    let confidence;

    if (prices.length < 5) {
      selectedMethod = 'median';
      confidence = 0.7;
    } else if (outlierRatio > 1.2) {
      // High outlier contamination - use most robust method
      selectedMethod = 'biweight';
      confidence = 0.8;
    } else if (outlierRatio > 1.1) {
      // Moderate outliers - use IQM
      selectedMethod = 'iqm';
      confidence = 0.85;
    } else if (outlierRatio > 1.05) {
      // Light contamination - use trimmed mean
      selectedMethod = 'trimmed';
      confidence = 0.9;
    } else {
      // Clean data - use arithmetic mean
      selectedMethod = 'arithmetic';
      confidence = 0.95;
    }

    return {
      value: results[selectedMethod],
      method: selectedMethod,
      confidence,
      alternatives: results,
      dataCharacteristics: {
        outlierRatio,
        sampleSize: prices.length,
        mad,
        stdDev,
      },
    };
  }

  /**
   * Robust spread estimator
   * @param {Array} prices - Array of prices
   * @returns {object} - Various spread measures
   */
  calculateRobustSpread(prices) {
    if (prices.length === 0) {
      return { mad: 0, iqr: 0, qn: 0 };
    }

    const sorted = [...prices].sort((a, b) => a - b);
    const median = this.calculateMedian(prices);
    const mad = this.calculateMAD(prices);

    // Interquartile Range
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;

    // Qn estimator (more efficient than MAD)
    let qn = 0;
    if (prices.length > 1) {
      const pairwiseDiffs = [];
      for (let i = 0; i < prices.length; i++) {
        for (let j = i + 1; j < prices.length; j++) {
          pairwiseDiffs.push(Math.abs(prices[i] - prices[j]));
        }
      }
      qn = this.calculateMedian(pairwiseDiffs) * 2.2219; // Scale factor for normal efficiency
    }

    return {
      mad: mad * 1.4826, // Scale to approximate standard deviation
      iqr,
      qn,
      recommended: mad > 0 ? mad * 1.4826 : iqr / 1.349, // Choose best available
    };
  }

  /**
   * Detect outliers using multiple robust methods
   * @param {Array} prices - Array of prices
   * @returns {Array} - Outlier detection results
   */
  detectRobustOutliers(prices) {
    if (prices.length < 4) {
      return [];
    }

    const median = this.calculateMedian(prices);
    const mad = this.calculateMAD(prices);
    const spread = this.calculateRobustSpread(prices);

    const outliers = [];

    prices.forEach((price, index) => {
      const methods = {};

      // MAD-based detection
      if (mad > 0) {
        const madScore = Math.abs(price - median) / (mad * 1.4826);
        methods.mad = { score: madScore, isOutlier: madScore > 3 };
      }

      // IQR-based detection
      if (spread.iqr > 0) {
        const sorted = [...prices].sort((a, b) => a - b);
        const q1 = sorted[Math.floor(sorted.length * 0.25)];
        const q3 = sorted[Math.floor(sorted.length * 0.75)];
        const lowerFence = q1 - 1.5 * spread.iqr;
        const upperFence = q3 + 1.5 * spread.iqr;
        methods.iqr = {
          score: Math.max((lowerFence - price) / spread.iqr, (price - upperFence) / spread.iqr, 0),
          isOutlier: price < lowerFence || price > upperFence,
        };
      }

      // Consensus outlier detection
      const outlierCount = Object.values(methods).filter((m) => m.isOutlier).length;
      const isConsensusOutlier = outlierCount >= Math.ceil(Object.keys(methods).length / 2);

      if (isConsensusOutlier) {
        outliers.push({
          index,
          value: price,
          methods,
          severity: outlierCount / Object.keys(methods).length,
        });
      }
    });

    return outliers;
  }
}

module.exports = RobustEstimators;

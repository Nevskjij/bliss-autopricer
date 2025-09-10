/**
 * Machine Learning-inspired price prediction and analysis
 * Uses statistical methods and pattern recognition for better pricing
 */
class MLPricePrediction {
  constructor(config = {}) {
    this.config = {
      lookbackPeriod: config.lookbackPeriod || 168, // 7 days in hours
      minTrainingData: config.minTrainingData || 10,
      seasonalPeriods: config.seasonalPeriods || [24, 168], // Daily and weekly patterns
      anomalyThreshold: config.anomalyThreshold || 2.5,
      ...config,
    };
    this.models = new Map(); // Cache for trained models per SKU
  }

  /**
   * Simple linear regression for trend analysis
   * @param {Array} data - Array of {x, y} points
   * @returns {object} - Regression parameters
   */
  linearRegression(data) {
    const n = data.length;
    if (n < 2) {
      return null;
    }

    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    data.forEach((point) => {
      sumX += point.x;
      sumY += point.y;
      sumXY += point.x * point.y;
      sumX2 += point.x * point.x;
    });

    const denominator = n * sumX2 - sumX * sumX;
    if (denominator === 0) {
      return null;
    }

    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;

    // Calculate R-squared
    const meanY = sumY / n;
    let ssRes = 0;
    let ssTot = 0;

    data.forEach((point) => {
      const predicted = slope * point.x + intercept;
      ssRes += Math.pow(point.y - predicted, 2);
      ssTot += Math.pow(point.y - meanY, 2);
    });

    const rSquared = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

    return {
      slope,
      intercept,
      rSquared,
      predict: (x) => slope * x + intercept,
    };
  }

  /**
   * Moving average with different strategies and robust methods
   * @param {Array} prices - Price history
   * @param {number} window - Window size
   * @param {string} type - Type of moving average
   * @returns {Array} - Moving averages
   */
  calculateMovingAverage(prices, window, type = 'simple') {
    if (prices.length < window) {
      return [];
    }

    const result = [];

    for (let i = window - 1; i < prices.length; i++) {
      let value;
      const windowPrices = prices.slice(i - window + 1, i + 1);

      switch (type) {
        case 'exponential':
          value = this.calculateEMA(prices.slice(0, i + 1), window);
          break;
        case 'weighted':
          value = this.calculateWMA(windowPrices);
          break;
        case 'trimmed':
          // Robust trimmed mean (removes outliers)
          value = this.calculateTrimmedMean(windowPrices.map((p) => p.value || p));
          break;
        case 'median':
          // Most robust central tendency
          value = this.calculateMedian(windowPrices.map((p) => p.value || p));
          break;
        default: // simple
          value = windowPrices.reduce((sum, price) => sum + (price.value || price), 0) / window;
      }

      result.push({
        index: i,
        value,
        timestamp: prices[i].timestamp || i,
      });
    }

    return result;
  }

  /**
   * Exponential Moving Average
   * @param {Array} prices - Price history
   * @param {number} period - Period for EMA
   * @returns {number} - EMA value
   */
  calculateEMA(prices, period) {
    if (prices.length === 0) {
      return 0;
    }
    if (prices.length === 1) {
      return prices[0].value || prices[0];
    }

    const multiplier = 2 / (period + 1);
    let ema = prices[0].value || prices[0];

    for (let i = 1; i < prices.length; i++) {
      const price = prices[i].value || prices[i];
      ema = price * multiplier + ema * (1 - multiplier);
    }

    return ema;
  }

  /**
   * Weighted Moving Average
   * @param {Array} prices - Recent prices
   * @returns {number} - WMA value
   */
  calculateWMA(prices) {
    let weightedSum = 0;
    let totalWeight = 0;

    prices.forEach((price, index) => {
      const weight = index + 1;
      weightedSum += (price.value || price) * weight;
      totalWeight += weight;
    });

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  /**
   * Calculate trimmed mean (removes outliers from both ends)
   * @param {Array} values - Array of numerical values
   * @param {number} trimPercent - Percentage to trim from each end (default 10%)
   * @returns {number} - Trimmed mean value
   */
  calculateTrimmedMean(values, trimPercent = 0.1) {
    if (!values || values.length === 0) {
      return 0;
    }

    if (values.length === 1) {
      return values[0];
    }

    // Convert to numbers and filter out invalid values
    const numericValues = values
      .map((v) => (typeof v === 'number' ? v : parseFloat(v)))
      .filter((v) => !isNaN(v))
      .sort((a, b) => a - b);

    if (numericValues.length === 0) {
      return 0;
    }

    if (numericValues.length <= 2) {
      return numericValues.reduce((sum, val) => sum + val, 0) / numericValues.length;
    }

    // Calculate how many values to trim from each end
    const trimCount = Math.floor(numericValues.length * trimPercent);
    const startIndex = trimCount;
    const endIndex = numericValues.length - trimCount;

    // Get the trimmed array
    const trimmedValues = numericValues.slice(startIndex, endIndex);

    if (trimmedValues.length === 0) {
      // If we trimmed too much, fall back to simple mean
      return numericValues.reduce((sum, val) => sum + val, 0) / numericValues.length;
    }

    // Calculate mean of trimmed values
    return trimmedValues.reduce((sum, val) => sum + val, 0) / trimmedValues.length;
  }

  /**
   * Seasonal decomposition for identifying patterns
   * @param {Array} priceHistory - Historical price data
   * @param {number} seasonalPeriod - Period for seasonal analysis
   * @returns {object} - Decomposed components
   */
  seasonalDecomposition(priceHistory, seasonalPeriod = 24) {
    if (priceHistory.length < seasonalPeriod * 2) {
      return null;
    }

    const prices = priceHistory.map((p) => p.value);

    // Calculate trend using moving average
    const trendWindow = Math.max(3, Math.floor(seasonalPeriod / 2));
    const trend = this.calculateMovingAverage(
      prices.map((p, i) => ({ value: p, timestamp: i })),
      trendWindow
    );

    // Detrend the data
    const detrended = [];
    trend.forEach((t, i) => {
      if (i + trendWindow - 1 < prices.length) {
        detrended.push(prices[i + trendWindow - 1] - t.value);
      }
    });

    // Calculate seasonal component
    const seasonal = new Array(seasonalPeriod).fill(0);
    const seasonalCounts = new Array(seasonalPeriod).fill(0);

    detrended.forEach((value, index) => {
      const seasonIndex = index % seasonalPeriod;
      seasonal[seasonIndex] += value;
      seasonalCounts[seasonIndex]++;
    });

    // Average seasonal values
    seasonal.forEach((sum, index) => {
      seasonal[index] = seasonalCounts[index] > 0 ? sum / seasonalCounts[index] : 0;
    });

    // Calculate residual (random component)
    const residual = [];
    for (let i = 0; i < Math.min(detrended.length, trend.length); i++) {
      const seasonIndex = i % seasonalPeriod;
      residual.push(detrended[i] - seasonal[seasonIndex]);
    }

    return {
      trend: trend.map((t) => t.value),
      seasonal,
      residual,
      seasonalPeriod,
    };
  }

  /**
   * Anomaly detection using statistical methods
   * @param {Array} priceHistory - Historical prices
   * @param {number} threshold - Z-score threshold
   * @returns {Array} - Detected anomalies
   */
  detectAnomalies(priceHistory, threshold = 2.5) {
    if (priceHistory.length < 10) {
      return [];
    }

    const prices = priceHistory.map((p) => p.value);
    const mean = prices.reduce((sum, price) => sum + price, 0) / prices.length;
    const variance =
      prices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / prices.length;
    const stdDev = Math.sqrt(variance);

    const anomalies = [];

    priceHistory.forEach((price, index) => {
      const zScore = stdDev === 0 ? 0 : (price.value - mean) / stdDev;
      if (Math.abs(zScore) > threshold) {
        anomalies.push({
          index,
          timestamp: price.timestamp,
          value: price.value,
          zScore,
          severity: Math.abs(zScore) > 3 ? 'high' : 'medium',
        });
      }
    });

    return anomalies;
  }

  /**
   * Price momentum calculation
   * @param {Array} priceHistory - Historical prices
   * @param {number} period - Period for momentum calculation
   * @returns {object} - Momentum indicators
   */
  calculateMomentum(priceHistory, period = 14) {
    if (priceHistory.length < period + 1) {
      return null;
    }

    const prices = priceHistory.map((p) => p.value);
    const gains = [];
    const losses = [];

    // Calculate price changes
    for (let i = 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      gains.push(Math.max(0, change));
      losses.push(Math.max(0, -change));
    }

    // Calculate RSI with robust statistics
    const avgGain = gains.length > 0 ? this.calculateTrimmedMean(gains.slice(-period)) : 0;
    const avgLoss = losses.length > 0 ? this.calculateTrimmedMean(losses.slice(-period)) : 0;

    // Handle edge cases for RSI calculation
    let rsi;
    if (avgLoss === 0 && avgGain === 0) {
      rsi = 50; // Neutral when no movement
    } else if (avgLoss === 0) {
      rsi = 100; // All gains, maximum RSI
    } else {
      rsi = 100 - 100 / (1 + avgGain / avgLoss);
    }

    // Ensure RSI is within valid range
    rsi = Math.max(0, Math.min(100, rsi));

    // Calculate momentum
    const momentum =
      prices.length >= period + 1
        ? prices[prices.length - 1] - prices[prices.length - 1 - period]
        : 0;

    // Calculate rate of change
    let roc = 0;
    if (prices.length >= period + 1 && prices[prices.length - 1 - period] !== 0) {
      roc =
        ((prices[prices.length - 1] - prices[prices.length - 1 - period]) /
          prices[prices.length - 1 - period]) *
        100;
    }

    // Ensure all values are valid numbers
    const validRsi = isNaN(rsi) ? 50 : rsi;
    const validMomentum = isNaN(momentum) ? 0 : momentum;
    const validRoc = isNaN(roc) ? 0 : roc;

    return {
      rsi: Math.round(validRsi * 100) / 100,
      momentum: Math.round(validMomentum * 100) / 100,
      roc: Math.round(validRoc * 100) / 100,
      signal: validRsi > 70 ? 'overbought' : validRsi < 30 ? 'oversold' : 'neutral',
    };
  }

  /**
   * Support and resistance level detection
   * @param {Array} priceHistory - Historical prices
   * @param {number} strength - Minimum strength for levels
   * @returns {object} - Support and resistance levels
   */
  findSupportResistance(priceHistory, strength = 3) {
    if (priceHistory.length < strength * 2 + 1) {
      return { support: [], resistance: [] };
    }

    const prices = priceHistory.map((p) => p.value);
    const support = [];
    const resistance = [];

    // Find local minima (support) and maxima (resistance)
    for (let i = strength; i < prices.length - strength; i++) {
      let isSupport = true;
      let isResistance = true;

      // Check if current point is a local minimum
      for (let j = i - strength; j <= i + strength; j++) {
        if (j !== i && prices[j] <= prices[i]) {
          isSupport = false;
        }
        if (j !== i && prices[j] >= prices[i]) {
          isResistance = false;
        }
      }

      if (isSupport) {
        support.push({
          price: prices[i],
          index: i,
          timestamp: priceHistory[i].timestamp,
          strength: this.calculateLevelStrength(prices, i, prices[i], 'support'),
        });
      }

      if (isResistance) {
        resistance.push({
          price: prices[i],
          index: i,
          timestamp: priceHistory[i].timestamp,
          strength: this.calculateLevelStrength(prices, i, prices[i], 'resistance'),
        });
      }
    }

    // Sort by strength
    support.sort((a, b) => b.strength - a.strength);
    resistance.sort((a, b) => b.strength - a.strength);

    return { support: support.slice(0, 5), resistance: resistance.slice(0, 5) };
  }

  /**
   * Calculate strength of support/resistance level
   * @param {Array} prices - Price array
   * @param {number} index - Index of the level
   * @param {number} price - Price level
   * @param {string} type - 'support' or 'resistance'
   * @returns {number} - Strength score
   */
  calculateLevelStrength(prices, index, price, type) {
    let touches = 0;
    const tolerance = price * 0.02; // 2% tolerance

    prices.forEach((p, i) => {
      if (i !== index && Math.abs(p - price) <= tolerance) {
        touches++;
      }
    });

    // More recent touches have higher weight
    const recencyWeight = Math.max(0, 1 - (prices.length - index) / prices.length);

    return touches + recencyWeight;
  }

  /**
   * Predict next price using ensemble of methods
   * @param {string} sku - Item SKU
   * @param {Array} priceHistory - Historical price data
   * @param {object} options - Prediction options
   * @returns {object} - Price prediction with confidence
   */
  async predictPrice(sku, priceHistory, options = {}) {
    if (priceHistory.length < this.config.minTrainingData) {
      return {
        prediction: null,
        confidence: 0,
        reason: 'insufficient_data',
        minRequired: this.config.minTrainingData,
      };
    }

    const predictions = [];
    const analysis = {};

    // Method 1: Linear regression trend
    const trendData = priceHistory.map((p, i) => ({ x: i, y: p.value }));
    const regression = this.linearRegression(trendData);
    if (regression && regression.rSquared > 0.1) {
      const nextIndex = priceHistory.length;
      predictions.push({
        method: 'linear_trend',
        value: regression.predict(nextIndex),
        confidence: Math.min(0.9, regression.rSquared),
        weight: 0.3,
      });
    }

    // Method 2: Moving average projection
    const ema = this.calculateEMA(priceHistory, 14);
    if (ema > 0) {
      predictions.push({
        method: 'exponential_ma',
        value: ema,
        confidence: 0.6,
        weight: 0.2,
      });
    }

    // Method 3: Seasonal pattern
    const seasonal = this.seasonalDecomposition(priceHistory, 24);
    if (seasonal) {
      const currentHour = new Date().getHours();
      const seasonalAdjustment = seasonal.seasonal[currentHour % seasonal.seasonalPeriod];
      const latestTrend = seasonal.trend[seasonal.trend.length - 1] || ema;
      predictions.push({
        method: 'seasonal_adjustment',
        value: latestTrend + seasonalAdjustment,
        confidence: 0.5,
        weight: 0.15,
      });
    }

    // Method 4: Momentum-based prediction
    const momentum = this.calculateMomentum(priceHistory);
    if (momentum) {
      const lastPrice = priceHistory[priceHistory.length - 1].value;
      const momentumAdjustment = momentum.momentum * 0.1; // Conservative adjustment
      predictions.push({
        method: 'momentum',
        value: lastPrice + momentumAdjustment,
        confidence: momentum.rsi > 70 || momentum.rsi < 30 ? 0.7 : 0.4,
        weight: 0.15,
      });
    }

    // Method 5: Support/Resistance levels
    const levels = this.findSupportResistance(priceHistory);
    if (levels.support.length > 0 || levels.resistance.length > 0) {
      const lastPrice = priceHistory[priceHistory.length - 1].value;
      const nearestSupport = levels.support.find((s) => s.price < lastPrice);
      const nearestResistance = levels.resistance.find((r) => r.price > lastPrice);

      if (nearestSupport && nearestResistance) {
        const midpoint = (nearestSupport.price + nearestResistance.price) / 2;
        predictions.push({
          method: 'support_resistance',
          value: midpoint,
          confidence: 0.6,
          weight: 0.2,
        });
      }
    }

    if (predictions.length === 0) {
      return {
        prediction: null,
        confidence: 0,
        reason: 'no_viable_methods',
        analysis,
      };
    }

    // Ensemble prediction: weighted average
    let weightedSum = 0;
    let totalWeight = 0;
    let totalConfidence = 0;

    predictions.forEach((pred) => {
      const effectiveWeight = pred.weight * pred.confidence;
      weightedSum += pred.value * effectiveWeight;
      totalWeight += effectiveWeight;
      totalConfidence += pred.confidence;
    });

    const finalPrediction = totalWeight > 0 ? weightedSum / totalWeight : null;
    const avgConfidence = totalConfidence / predictions.length;

    // Anomaly detection
    analysis.anomalies = this.detectAnomalies(priceHistory);
    analysis.momentum = momentum;
    analysis.levels = levels;
    analysis.seasonal = seasonal;

    return {
      prediction: finalPrediction,
      confidence: avgConfidence,
      methods: predictions,
      analysis,
      recommendations: this.generateRecommendations(analysis, finalPrediction, priceHistory),
    };
  }

  /**
   * Generate trading recommendations based on analysis
   * @param {object} analysis - Price analysis results
   * @param {number} prediction - Predicted price
   * @param {Array} priceHistory - Historical prices
   * @returns {Array} - Array of recommendations
   */
  generateRecommendations(analysis, prediction, priceHistory) {
    const recommendations = [];
    const currentPrice = priceHistory[priceHistory.length - 1].value;

    // Trend-based recommendations
    if (analysis.momentum) {
      if (analysis.momentum.signal === 'overbought') {
        recommendations.push({
          type: 'caution',
          message: 'Price may be overbought (RSI > 70). Consider conservative sell pricing.',
          confidence: 0.7,
        });
      } else if (analysis.momentum.signal === 'oversold') {
        recommendations.push({
          type: 'opportunity',
          message: 'Price may be oversold (RSI < 30). Consider aggressive buy pricing.',
          confidence: 0.7,
        });
      }
    }

    // Anomaly-based recommendations
    if (analysis.anomalies && analysis.anomalies.length > 0) {
      const recentAnomalies = analysis.anomalies.filter((a) => a.index > priceHistory.length - 10);
      if (recentAnomalies.length > 0) {
        recommendations.push({
          type: 'warning',
          message: `${recentAnomalies.length} recent price anomalies detected. Increase confidence thresholds.`,
          confidence: 0.8,
        });
      }
    }

    // Prediction vs current price
    if (prediction) {
      const change = ((prediction - currentPrice) / currentPrice) * 100;
      if (Math.abs(change) > 5) {
        recommendations.push({
          type: change > 0 ? 'bullish' : 'bearish',
          message: `Prediction suggests ${Math.abs(change).toFixed(1)}% ${change > 0 ? 'increase' : 'decrease'}.`,
          confidence: 0.6,
        });
      }
    }

    return recommendations;
  }

  /**
   * Train and cache model for specific SKU
   * @param {string} sku - Item SKU
   * @param {Array} priceHistory - Training data
   * @returns {object} - Trained model
   */
  trainModel(sku, priceHistory) {
    const model = {
      sku,
      trainedAt: Date.now(),
      dataPoints: priceHistory.length,
      patterns: {},
    };

    // Store various patterns
    model.patterns.trend = this.linearRegression(
      priceHistory.map((p, i) => ({ x: i, y: p.value }))
    );
    model.patterns.seasonal = this.seasonalDecomposition(priceHistory);
    model.patterns.momentum = this.calculateMomentum(priceHistory);
    model.patterns.levels = this.findSupportResistance(priceHistory);

    // Cache the model
    this.models.set(sku, model);

    return model;
  }

  /**
   * Get cached model or train new one
   * @param {string} sku - Item SKU
   * @param {Array} priceHistory - Price data
   * @returns {object} - Model for the SKU
   */
  getModel(sku, priceHistory) {
    const cached = this.models.get(sku);

    // Check if model is fresh enough (24 hours)
    if (cached && Date.now() - cached.trainedAt < 24 * 60 * 60 * 1000) {
      return cached;
    }

    // Train new model
    return this.trainModel(sku, priceHistory);
  }
}

module.exports = MLPricePrediction;

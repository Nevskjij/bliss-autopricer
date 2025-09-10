const path = require('path');
const renderPage = require('../layout');
const { loadJson } = require('../utils');
const { db } = require('../dbInstance');

module.exports = function (app) {
  app.get('/market-analysis', async (req, res) => {
    try {
      // Load current configuration
      const configPath = path.resolve(__dirname, '../../config/config.json');
      let config = {};
      try {
        config = loadJson(configPath);
      } catch (error) {
        console.log('No config.json found');
      }

      // Get recent market analysis data from database
      let recentAnalysis = [];
      try {
        const result = await db.query(`
          SELECT 
            sku, 
            name,
            market_regime,
            liquidity_condition,
            momentum_direction,
            strategy_applied,
            expected_profit,
            profit_margin,
            buy_price,
            sell_price,
            timestamp,
            competitive_pressure
          FROM price_history 
          WHERE market_regime IS NOT NULL 
          ORDER BY timestamp DESC 
          LIMIT 50
        `);
        recentAnalysis = result.rows || [];
      } catch (error) {
        console.log('No market analysis data available:', error.message);
      }

      // Calculate summary statistics
      const totalItems = recentAnalysis.length;
      const regimeCounts = {};
      const strategies = {};
      let totalProfit = 0;
      let avgMargin = 0;

      recentAnalysis.forEach((item) => {
        // Count market regimes
        const regime = item.market_regime || 'unknown';
        regimeCounts[regime] = (regimeCounts[regime] || 0) + 1;

        // Count strategies
        const strategy = item.strategy_applied || 'unknown';
        strategies[strategy] = (strategies[strategy] || 0) + 1;

        // Calculate totals
        if (item.expected_profit) {
          totalProfit += parseFloat(item.expected_profit);
        }
        if (item.profit_margin) {
          avgMargin += parseFloat(item.profit_margin);
        }
      });

      if (totalItems > 0) {
        avgMargin = avgMargin / totalItems;
      }

      // Generate HTML
      let html = '<div style="max-width: 1200px; margin: 0 auto; padding: 20px;">';

      // Header
      html += `
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #007cba; margin-bottom: 10px;">📊 Market Analysis Dashboard</h1>
          <p style="color: #666; font-size: 16px;">Real-time market intelligence and profit optimization insights</p>
        </div>
      `;

      // Summary Cards
      html +=
        '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px;">';

      // Total Items Card
      html += `
        <div style="background: linear-gradient(135deg, #28a745, #20c997); color: white; padding: 20px; border-radius: 8px; text-align: center;">
          <h3 style="margin: 0 0 10px 0; font-size: 2em;">${totalItems}</h3>
          <p style="margin: 0; opacity: 0.9;">Items Analyzed</p>
        </div>
      `;

      // Average Profit Margin Card
      html += `
        <div style="background: linear-gradient(135deg, #007cba, #6610f2); color: white; padding: 20px; border-radius: 8px; text-align: center;">
          <h3 style="margin: 0 0 10px 0; font-size: 2em;">${(avgMargin * 100).toFixed(1)}%</h3>
          <p style="margin: 0; opacity: 0.9;">Avg Profit Margin</p>
        </div>
      `;

      // Total Expected Profit Card
      html += `
        <div style="background: linear-gradient(135deg, #fd7e14, #e83e8c); color: white; padding: 20px; border-radius: 8px; text-align: center;">
          <h3 style="margin: 0 0 10px 0; font-size: 2em;">${totalProfit.toFixed(1)}</h3>
          <p style="margin: 0; opacity: 0.9;">Total Expected Profit (ref)</p>
        </div>
      `;

      // Configuration Status Card
      const marketAnalyzerEnabled = config.marketAnalyzer ? '✅' : '❌';
      const profitOptimizerEnabled = config.profitOptimizer ? '✅' : '❌';
      html += `
        <div style="background: linear-gradient(135deg, #6c757d, #495057); color: white; padding: 20px; border-radius: 8px; text-align: center;">
          <h3 style="margin: 0 0 10px 0; font-size: 1.2em;">System Status</h3>
          <p style="margin: 5px 0; opacity: 0.9;">Market Analysis: ${marketAnalyzerEnabled}</p>
          <p style="margin: 5px 0; opacity: 0.9;">Profit Optimizer: ${profitOptimizerEnabled}</p>
        </div>
      `;

      html += '</div>';

      // Market Regime Distribution
      if (Object.keys(regimeCounts).length > 0) {
        html +=
          '<div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px;">';
        html +=
          '<h3 style="color: #007cba; margin-bottom: 15px;">🏪 Market Regime Distribution</h3>';
        html +=
          '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">';

        for (const [regime, count] of Object.entries(regimeCounts)) {
          const percentage = ((count / totalItems) * 100).toFixed(1);
          const regimeColors = {
            competitive_market: '#28a745',
            thin_market: '#fd7e14',
            trending_market: '#007cba',
            volatile_competitive: '#dc3545',
            unknown: '#6c757d',
          };
          const color = regimeColors[regime] || '#6c757d';

          html += `
            <div style="border: 2px solid ${color}; border-radius: 6px; padding: 15px; text-align: center;">
              <h4 style="margin: 0 0 5px 0; color: ${color}; text-transform: capitalize;">${regime.replace(
                '_',
                ' '
              )}</h4>
              <p style="margin: 0; font-size: 1.2em; font-weight: bold;">${count} (${percentage}%)</p>
            </div>
          `;
        }

        html += '</div>';
        html += '</div>';
      }

      // Strategy Distribution
      if (Object.keys(strategies).length > 0) {
        html +=
          '<div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px;">';
        html += '<h3 style="color: #007cba; margin-bottom: 15px;">🎯 Strategy Distribution</h3>';
        html +=
          '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">';

        for (const [strategy, count] of Object.entries(strategies)) {
          const percentage = ((count / totalItems) * 100).toFixed(1);
          html += `
            <div style="border: 1px solid #ddd; border-radius: 6px; padding: 15px; text-align: center;">
              <h4 style="margin: 0 0 5px 0; color: #495057; text-transform: capitalize;">${strategy.replace(
                /_/g,
                ' '
              )}</h4>
              <p style="margin: 0; font-size: 1.2em; font-weight: bold;">${count} (${percentage}%)</p>
            </div>
          `;
        }

        html += '</div>';
        html += '</div>';
      }

      // Recent Analysis Table
      if (recentAnalysis.length > 0) {
        html +=
          '<div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">';
        html += '<h3 style="color: #007cba; margin-bottom: 15px;">📋 Recent Market Analysis</h3>';
        html += '<div style="overflow-x: auto;">';
        html += `
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <thead>
              <tr style="background: #f8f9fa;">
                <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Item</th>
                <th style="padding: 10px; border: 1px solid #ddd; text-align: center;">Market Regime</th>
                <th style="padding: 10px; border: 1px solid #ddd; text-align: center;">Liquidity</th>
                <th style="padding: 10px; border: 1px solid #ddd; text-align: center;">Momentum</th>
                <th style="padding: 10px; border: 1px solid #ddd; text-align: center;">Strategy</th>
                <th style="padding: 10px; border: 1px solid #ddd; text-align: center;">Buy Price</th>
                <th style="padding: 10px; border: 1px solid #ddd; text-align: center;">Sell Price</th>
                <th style="padding: 10px; border: 1px solid #ddd; text-align: center;">Expected Profit</th>
                <th style="padding: 10px; border: 1px solid #ddd; text-align: center;">Margin %</th>
                <th style="padding: 10px; border: 1px solid #ddd; text-align: center;">Time</th>
              </tr>
            </thead>
            <tbody>
        `;

        recentAnalysis.slice(0, 20).forEach((item) => {
          const buyPrice = item.buy_price ? parseFloat(item.buy_price).toFixed(2) : 'N/A';
          const sellPrice = item.sell_price ? parseFloat(item.sell_price).toFixed(2) : 'N/A';
          const profit = item.expected_profit ? parseFloat(item.expected_profit).toFixed(2) : 'N/A';
          const margin = item.profit_margin
            ? (parseFloat(item.profit_margin) * 100).toFixed(1)
            : 'N/A';
          const time = new Date(item.timestamp * 1000).toLocaleString();

          // Color coding for regimes
          const regimeColors = {
            competitive_market: '#28a745',
            thin_market: '#fd7e14',
            trending_market: '#007cba',
            volatile_competitive: '#dc3545',
          };
          const regimeColor = regimeColors[item.market_regime] || '#6c757d';

          html += `
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">${item.name || item.sku}</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">
                <span style="background: ${regimeColor}; color: white; padding: 2px 6px; border-radius: 3px; font-size: 12px;">
                  ${(item.market_regime || 'unknown').replace('_', ' ')}
                </span>
              </td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${
                item.liquidity_condition || 'unknown'
              }</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${
                item.momentum_direction || 'neutral'
              }</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: center; font-size: 12px;">${(
                item.strategy_applied || 'unknown'
              ).replace(/_/g, ' ')}</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${buyPrice} ref</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${sellPrice} ref</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: center; color: #28a745; font-weight: bold;">${profit} ref</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: center; font-weight: bold;">${margin}%</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: center; font-size: 12px;">${time}</td>
            </tr>
          `;
        });

        html += '</tbody></table>';
        html += '</div>';
        html += '</div>';
      } else {
        html +=
          '<div style="background: #f8f9fa; padding: 30px; border-radius: 8px; text-align: center;">';
        html += '<h3 style="color: #6c757d;">📊 No Market Analysis Data Available</h3>';
        html +=
          '<p style="color: #666;">Market analysis data will appear here once the enhanced pricing system starts analyzing items.</p>';
        html +=
          '<p style="color: #666;">Make sure Market Analyzer is enabled in <a href="/settings" style="color: #007cba;">Settings</a>.</p>';
        html += '</div>';
      }

      // Navigation
      html += '<div style="text-align: center; margin-top: 30px;">';
      html +=
        '<a href="/" style="background: #007cba; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; margin-right: 10px;">🏠 Dashboard</a>';
      html +=
        '<a href="/settings" style="background: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; margin-right: 10px;">⚙️ Settings</a>';
      html +=
        '<a href="/pricelist" style="background: #fd7e14; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">📝 Pricelist</a>';
      html += '</div>';

      html += '</div>';

      res.send(renderPage('Market Analysis', html));
    } catch (error) {
      console.error('Market Analysis page error:', error);
      res.status(500).send(renderPage('Error', '<div>Error loading market analysis page</div>'));
    }
  });
};

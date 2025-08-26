// routes/pnl.js
const path = require('path');
const fs = require('fs');
const express = require('express');
const { loadJson } = require('../utils');
const renderPage = require('../layout');

module.exports = function (app, config, configManager) {
  const router = express.Router();

  // Helper function to get current bot paths
  function getBotPaths() {
    const selectedBot = configManager.getSelectedBot();
    if (!selectedBot) {
      throw new Error('No bot selected. Please configure a bot first.');
    }

    return {
      pollDataPath: path.resolve(
        selectedBot.tf2autobotPath || selectedBot.tf2AutobotDir,
        selectedBot.botDirectory || selectedBot.botTradingDir,
        'polldata.json'
      ),
      pricelistPath: path.resolve(__dirname, '../../files/pricelist.json'),
    };
  }

  router.get('/pnl', (req, res) => {
    try {
      // Check if bot is configured
      const selectedBot = configManager.getSelectedBot();
      if (!selectedBot) {
        let html = '<div style="max-width: 800px; margin: 0 auto; padding: 20px;">';
        html +=
          '<div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 20px; border-radius: 8px; text-align: center;">';
        html += '<h2>⚠️ No Bot Configuration Found</h2>';
        html += '<p>You need to configure a bot before viewing profit and loss data.</p>';
        html += "<p>The P&L dashboard requires access to your bot's trade history files.</p>";
        html +=
          '<p><a href="/bot-config" style="background: #007cba; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">🤖 Configure Bot</a></p>';
        html += '</div>';
        html += '</div>';
        return res.send(renderPage('P&L Dashboard - No Bot Configured', html));
      }

      const paths = getBotPaths();
      const keyPrice = loadJson(paths.pricelistPath).items.find((i) => i.sku === '5021;6')?.sell
        ?.metal;

      let parsed;
      try {
        const raw = fs.readFileSync(paths.pollDataPath, 'utf8');
        parsed = JSON.parse(raw);
      } catch {
        let html = '<div style="max-width: 800px; margin: 0 auto; padding: 20px;">';
        html +=
          '<div style="background: #f8d7da; border: 1px solid #f5c6cb; padding: 20px; border-radius: 8px; text-align: center;">';
        html += '<h2>❌ Error Loading Trade Data</h2>';
        html += "<p>Unable to load trade history from the bot's polldata.json file.</p>";
        html += `<p><strong>Expected file location:</strong><br><code>${paths.pollDataPath}</code></p>`;
        html += '<p>This could indicate:</p>';
        html += '<ul style="text-align: left; display: inline-block;">';
        html += '<li>The bot has not processed any trades yet</li>';
        html += '<li>The polldata.json file is missing or corrupted</li>';
        html += '<li>Incorrect bot configuration paths</li>';
        html += '</ul>';
        html +=
          '<p><a href="/bot-config" style="background: #007cba; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">🤖 Check Bot Config</a></p>';
        html += '</div>';
        html += '</div>';
        return res.status(500).send(renderPage('P&L Dashboard - Error', html));
      }

      const history = Object.values(parsed.offerData || {}).filter((t) => t.isAccepted);
      const summary = {};
      const profitPoints = [];
      let totalProfit = 0;

      // Sort history by timestamp ascending
      history.sort((a, b) => {
        let ta = a.time || a.actionTimestamp;
        let tb = b.time || b.actionTimestamp;
        if (typeof ta === 'number' && ta < 1e12) {
          ta *= 1000;
        }
        if (typeof tb === 'number' && tb < 1e12) {
          tb *= 1000;
        }
        return (ta || 0) - (tb || 0);
      });

      let lastTimestamp = 0;
      for (const t of history) {
        let timestamp = t.time || t.actionTimestamp;
        if (typeof timestamp === 'number' && timestamp < 1e12) {
          timestamp *= 1000;
        }
        if (!timestamp || isNaN(timestamp)) {
          continue;
        } // skip if missing

        // Ensure strictly increasing timestamps
        if (timestamp <= lastTimestamp) {
          timestamp = lastTimestamp + 1;
        }
        lastTimestamp = timestamp;

        const date = new Date(timestamp);
        if (isNaN(date.getTime())) {
          continue;
        }

        const timeISO = date.toISOString();

        const skuList = Object.entries(t.dict?.our || {}).concat(
          Object.entries(t.dict?.their || {})
        );
        const valueOur = t.value?.our || { keys: 0, metal: 0 };
        const valueTheir = t.value?.their || { keys: 0, metal: 0 };
        const profit =
          valueTheir.keys * keyPrice +
          valueTheir.metal -
          (valueOur.keys * keyPrice + valueOur.metal);
        totalProfit += profit;

        profitPoints.push({ x: timeISO, y: parseFloat(totalProfit.toFixed(2)) });

        for (const [sku, qty] of skuList) {
          if (!summary[sku]) {
            summary[sku] = { qty: 0, profit: 0 };
          }
          summary[sku].qty += qty;
          summary[sku].profit += profit;
        }
      }

      const sortedByProfit = Object.entries(summary)
        .sort(([, a], [, b]) => b.profit - a.profit)
        .slice(0, 10);

      let html = '<div style="max-width: 1200px; margin: 0 auto; padding: 20px;">';

      // Header
      html +=
        '<div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 20px;">';
      html += '<h2>💰 Profit & Loss Dashboard</h2>';
      html +=
        '<p>Track your trading performance with detailed profit analysis and trend visualization.</p>';
      html += '</div>';

      // Summary Statistics
      html += '<div style="display: flex; gap: 20px; margin-bottom: 20px; flex-wrap: wrap;">';

      // Total Profit Card
      const profitColor = totalProfit >= 0 ? '#28a745' : '#dc3545';
      const profitIcon = totalProfit >= 0 ? '📈' : '📉';
      html +=
        '<div style="flex: 1; min-width: 250px; background: #e8f4fd; padding: 15px; border-radius: 8px;">';
      html += `<h3 style="color: ${profitColor}; margin-top: 0;">${profitIcon} Total Net Profit</h3>`;
      html += `<p style="font-size: 24px; font-weight: bold; color: ${profitColor}; margin: 10px 0;">${totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)} Refined</p>`;
      html += `<p><strong>Trades Analyzed:</strong> ${history.length}</p>`;
      html += '</div>';

      // Key Price Card
      html +=
        '<div style="flex: 1; min-width: 250px; background: #fff3cd; padding: 15px; border-radius: 8px;">';
      html += '<h3 style="margin-top: 0;">🔑 Key Price Used</h3>';
      html += `<p style="font-size: 18px; font-weight: bold; margin: 10px 0;">${keyPrice ? keyPrice.toFixed(2) : 'N/A'} Refined</p>`;
      html += '<p>Used for profit calculations</p>';
      html += '</div>';

      html += '</div>';

      // Chart Container
      html +=
        '<div style="background: white; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; margin-bottom: 20px;">';
      html += '<div style="background: #f8f9fa; padding: 15px; border-bottom: 1px solid #ddd;">';
      html += '<h3 style="margin: 0;">📊 Cumulative Profit Over Time</h3>';
      html +=
        '<p style="margin: 5px 0 0 0; color: #666;">Track your profit growth across all completed trades</p>';
      html += '</div>';
      html +=
        '<div class="chart-fullscreen" style="position: relative; height: 400px; padding: 20px;">';
      html += '<canvas id="profitOverTime" style="width: 100%; height: 100%;"></canvas>';
      html += '</div>';
      html += '</div>';

      // Top Items by Profit
      if (sortedByProfit.length > 0) {
        html +=
          '<div style="background: white; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">';
        html += '<div style="background: #f8f9fa; padding: 15px; border-bottom: 1px solid #ddd;">';
        html += '<h3 style="margin: 0;">🏆 Top Items by Profit Contribution</h3>';
        html +=
          '<p style="margin: 5px 0 0 0; color: #666;">Items that contributed most to your overall profit</p>';
        html += '</div>';
        html += '<div style="padding: 20px;">';
        html += '<table style="width: 100%; border-collapse: collapse;">';
        html += '<thead>';
        html += '<tr style="background: #f8f9fa;">';
        html +=
          '<th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd;">SKU</th>';
        html +=
          '<th style="padding: 12px; text-align: center; border-bottom: 1px solid #ddd;">Quantity Traded</th>';
        html +=
          '<th style="padding: 12px; text-align: center; border-bottom: 1px solid #ddd;">Profit Contribution</th>';
        html += '</tr>';
        html += '</thead>';
        html += '<tbody>';

        sortedByProfit.forEach(([sku, data], index) => {
          const rowStyle = index % 2 === 0 ? 'background: #f9f9f9;' : '';
          const profitColor = data.profit >= 0 ? '#28a745' : '#dc3545';
          html += `<tr style="${rowStyle}">`;
          html += `<td style="padding: 12px; border-bottom: 1px solid #eee;"><code>${sku}</code></td>`;
          html += `<td style="padding: 12px; text-align: center; border-bottom: 1px solid #eee;">${data.qty}</td>`;
          html += `<td style="padding: 12px; text-align: center; border-bottom: 1px solid #eee; color: ${profitColor}; font-weight: bold;">${data.profit >= 0 ? '+' : ''}${data.profit.toFixed(2)} Ref</td>`;
          html += '</tr>';
        });

        html += '</tbody>';
        html += '</table>';
        html += '</div>';
        html += '</div>';
      }

      html += '</div>';

      // Chart.js scripts
      html += `
        <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/luxon@3.4.3/build/global/luxon.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/chartjs-adapter-luxon@1.3.1/dist/chartjs-adapter-luxon.umd.min.js"></script>

        <script>
          const ctxProfit = document.getElementById('profitOverTime').getContext('2d');
          new Chart(ctxProfit, {
            type: 'line',
            data: {
              datasets: [{
                label: 'Cumulative Profit (Refined Metal)',
                data: ${JSON.stringify(profitPoints)},
                borderColor: '${totalProfit >= 0 ? '#28a745' : '#dc3545'}',
                backgroundColor: '${totalProfit >= 0 ? 'rgba(40, 167, 69, 0.1)' : 'rgba(220, 53, 69, 0.1)'}',
                fill: true,
                parsing: {
                  xAxisKey: 'x',
                  yAxisKey: 'y'
                },
                tension: 0.2,
                pointBackgroundColor: '${totalProfit >= 0 ? '#28a745' : '#dc3545'}',
                pointBorderColor: '#fff',
                pointBorderWidth: 2
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              scales: {
                x: {
                  type: 'time',
                  time: { unit: 'day' },
                  title: { 
                    display: true, 
                    text: 'Date',
                    font: { weight: 'bold' }
                  }
                },
                y: {
                  title: { 
                    display: true, 
                    text: 'Cumulative Profit (Refined Metal)',
                    font: { weight: 'bold' }
                  }
                }
              },
              plugins: {
                legend: { 
                  display: true, 
                  position: 'top' 
                },
                title: {
                  display: true,
                  text: 'Profit Growth Over Time',
                  font: {
                    size: 16,
                    weight: 'bold'
                  }
                }
              },
              interaction: {
                intersect: false,
                mode: 'index'
              }
            }
          });
        </script>
      `;

      res.send(renderPage('Profit & Loss Dashboard', html));
    } catch (error) {
      console.error('Error in PnL route:', error);
      let html = '<div style="max-width: 800px; margin: 0 auto; padding: 20px;">';
      html +=
        '<div style="background: #f8d7da; border: 1px solid #f5c6cb; padding: 20px; border-radius: 8px; text-align: center;">';
      html += '<h2>⚠️ Error Loading P&L Data</h2>';
      html += '<p>There was an error loading the profit and loss data.</p>';
      html += `<p><strong>Error details:</strong> ${error.message}</p>`;
      html += '<p>Please check that your bot configuration is correct and try again.</p>';
      html +=
        '<p><a href="/bot-config" style="background: #007cba; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">🤖 Check Bot Config</a></p>';
      html += '</div>';
      html += '</div>';
      res.status(500).send(renderPage('P&L Dashboard - Error', html));
    }
  });

  app.use('/', router);
};

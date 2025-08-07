// eslint-disable-next-line spellcheck/spell-checker
/* eslint-disable no-unused-vars */
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
        selectedBot.tf2AutobotDir,
        selectedBot.botTradingDir,
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
        const html = `
          <div style="text-align: center; margin-top: 50px;">
            <h2>⚠️ No Bot Configuration Found</h2>
            <p>You need to configure a bot before viewing P&L data.</p>
            <p><a href="/bot-config" style="background: #007cba; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">🤖 Configure Bot</a></p>
          </div>
        `;
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
        return res
          .status(500)
          .send(renderPage('P&L Dashboard', '<p>Error loading trade data.</p>'));
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

      const sortedByQty = Object.entries(summary)
        .sort(([, a], [, b]) => b.qty - a.qty)
        .slice(0, 10);

      const breakdownTable = sortedByProfit
        .map(
          ([sku, data]) =>
            `<tr><td>${sku}</td><td>${data.qty}</td><td>${data.profit.toFixed(2)} Ref</td></tr>`
        )
        .join('');

      const html = `
        <h1>Profit & Loss Dashboard</h1>
        <div class="chart-fullscreen">
            <canvas id="profitOverTime"></canvas>
        </div>
        <!-- Load correct versions -->
        <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/luxon@3.4.3/build/global/luxon.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/chartjs-adapter-luxon@1.3.1/dist/chartjs-adapter-luxon.umd.min.js"></script>

        <script>
        // ✅ Don't re-register the adapter manually at all.
        // Chart.js will pick it up automatically with correct script order.

        const ctxProfit = document.getElementById('profitOverTime').getContext('2d');
        new Chart(ctxProfit, {
            type: 'line',
            data: {
            datasets: [{
                label: 'Cumulative Profit',
                data: ${JSON.stringify(profitPoints)},
                borderColor: 'green',
                backgroundColor: 'rgba(0,255,0,0.1)',
                fill: true,
                parsing: {
                xAxisKey: 'x',
                yAxisKey: 'y'
                },
                tension: 0.2
            }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                x: {
                    type: 'time',
                    time: { unit: 'day' },
                    title: { display: true, text: 'Date' }
                },
                y: {
                    title: { display: true, text: 'Refined Metal' }
                }
                },
                plugins: {
                legend: { display: true, position: 'top' }
                }
            }
        });
        </script>
    `;

      res.send(renderPage('P&L Dashboard', html));
    } catch (error) {
      console.error('Error in PnL route:', error);
      const errorHtml = `
        <div style="text-align: center; margin-top: 50px;">
          <h2>⚠️ Error Loading P&L Data</h2>
          <p>There was an error loading the profit and loss data.</p>
          <p>Please check that your bot configuration is correct and try again.</p>
          <p><a href="/bot-config" style="background: #007cba; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">🤖 Check Bot Config</a></p>
        </div>
      `;
      res.status(500).send(renderPage('P&L Dashboard - Error', errorHtml));
    }
  });

  app.use('/', router);
};

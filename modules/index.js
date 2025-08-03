// index.js
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const ConfigManager = require('./configManager');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const CONFIG_PATH = path.resolve(__dirname, '../pricerConfig.json');
const configManager = new ConfigManager(CONFIG_PATH);

// Get legacy config for backward compatibility with existing routes
let config;
try {
  config = configManager.getLegacyConfig();
} catch (err) {
  console.error('❌ No bot selected or configuration error:', err.message);
  console.log('🔧 Please run the bot configuration setup first');
  console.log('📋 Configuration Summary:');
  console.log(JSON.stringify(configManager.getSummary(), null, 2));

  // Provide default config to prevent crashes
  config = {
    pm2ProcessName: 'tf2autobot',
    tf2AutobotDir: '../../tf2autobot-5.13.0',
    botTradingDir: 'files/bot',
    port: process.env.PRICE_WATCHER_PORT || 3000,
    ageThresholdSec: 7200,
  };
}

const PORT = config.port;

function mountRoutes() {
  require('./routes/pricelist')(app, config);
  require('./routes/trades')(app, config);
  require('./routes/key-prices')(app, config);
  require('./routes/actions')(app, config);
  require('./routes/logs')(app, config);
  require('./routes/pnl')(app, config);
  require('./routes/bounds')(app, config);

  // Add bot management routes
  require('./routes/bot-config')(app, configManager);
}

function startPriceWatcher() {
  mountRoutes();
  app.listen(PORT, () => {
    console.log(`PriceWatcher web server running on http://localhost:${PORT}`);
  });
}

if (require.main === module) {
  startPriceWatcher();
}

module.exports = { startPriceWatcher };

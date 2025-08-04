#!/usr/bin/env node

const path = require('path');
const ConfigManager = require('./modules/configManager');

console.log('🤖 BPTF Autopricer Bot Configuration Setup');
console.log('==========================================');

const CONFIG_PATH = path.resolve(__dirname, 'pricerConfig.json');
const configManager = new ConfigManager(CONFIG_PATH);

async function runSetup() {
  try {
    console.log('\n🔍 Scanning for tf2autobot installations and bot configurations...\n');

    const results = configManager.rediscover();

    console.log('📊 Discovery Results:');
    console.log(`  • tf2autobot installations found: ${results.installations.length}`);
    console.log(`  • Bot configurations found: ${results.bots.length}`);
    console.log(`  • Running processes found: ${results.processes.length}`);

    if (results.installations.length > 0) {
      console.log('\n🏠 tf2autobot Installations:');
      results.installations.forEach((installation, i) => {
        console.log(`  ${i + 1}. ${installation}`);
      });
    }

    if (results.bots.length > 0) {
      console.log('\n🤖 Bot Configurations Found:');
      results.bots.forEach((bot, i) => {
        console.log(`  ${i + 1}. ${bot.name} (${bot.id})`);
        console.log(`     Path: ${bot.botPath}`);
        console.log(`     Steam ID: ${bot.steamId || 'Unknown'}`);
        console.log(`     Source: ${bot.source}`);
        console.log();
      });

      const selectedBot = configManager.getSelectedBot();
      if (selectedBot) {
        console.log(`✅ Active Bot: ${selectedBot.name} (${selectedBot.id})`);
      } else {
        console.log('⚠️  No bot currently selected');
      }

      console.log('\n🌐 Web Interface:');
      console.log(`   Visit: http://localhost:${configManager.config.port}/bot-config`);
      console.log('   Use the web interface to select and manage bots');
    } else {
      console.log('\n❌ No bot configurations found automatically.');
      console.log('\nThis could mean:');
      console.log('  • tf2autobot is not installed in common locations');
      console.log('  • Bot configurations are in non-standard directories');
      console.log('  • Permissions prevent access to bot directories');

      console.log('\n🔧 Solutions:');
      console.log('  1. Install tf2autobot in a standard location');
      console.log('  2. Use the web interface to add bots manually:');
      console.log(`     http://localhost:${configManager.config.port}/bot-config/add`);
      console.log('  3. Check file permissions for bot directories');
    }

    console.log('\n📋 Configuration Summary:');
    const summary = configManager.getSummary();
    console.log(`  • Configuration version: ${summary.version}`);
    console.log(`  • Total bots: ${summary.totalBots}`);
    console.log(`  • Active bots: ${summary.activeBots}`);
    console.log(`  • Web interface port: ${configManager.config.port}`);

    if (configManager.config.migration) {
      console.log('\n📝 Migration Info:');
      console.log(`  • Migrated from: ${configManager.config.migration.migratedFrom}`);
      console.log(
        `  • Migration date: ${new Date(configManager.config.migration.migratedAt).toLocaleString()}`
      );
      console.log('  • Old config backed up');
    }

    console.log('\n🚀 Next Steps:');
    console.log('  1. Configure API keys in config.json (if not done already)');
    console.log('  2. Start the Price Watcher: npm start');
    console.log(`  3. Visit web interface: http://localhost:${configManager.config.port}`);
    console.log(`  4. Manage bots: http://localhost:${configManager.config.port}/bot-config`);
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  }
}

// Run setup if called directly
if (require.main === module) {
  runSetup();
}

module.exports = { runSetup };

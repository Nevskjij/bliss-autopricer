const express = require('express');
const renderPage = require('../layout');

module.exports = function (app, configManager) {
  const router = express.Router();

  // Bot Configuration Dashboard
  router.get('/', (req, res) => {
    const summary = configManager.getSummary();
    const allBots = configManager.getAllBots();
    const selectedBot = configManager.getSelectedBot();

    let html = '<div style="max-width: 1200px; margin: 0 auto; padding: 20px;">';

    // Header
    html +=
      '<div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 20px;">';
    html += '<h2>🤖 Bot Configuration Manager</h2>';
    html += '<p>Manage your tf2autobot configurations and switch between multiple bots.</p>';
    html += '</div>';

    // Summary Card
    html +=
      '<div style="background: #e8f4fd; padding: 15px; border-radius: 8px; margin-bottom: 20px;">';
    html += '<h3>📊 Configuration Summary</h3>';
    html += `<p><strong>Configuration Version:</strong> ${summary.version || 'Unknown'}</p>`;
    html += `<p><strong>Total Bots Found:</strong> ${summary.totalBots}</p>`;
    html += `<p><strong>Active Bots:</strong> ${summary.activeBots}</p>`;
    if (summary.selectedBot) {
      html += `<p><strong>Selected Bot:</strong> ${summary.selectedBot.name} (${summary.selectedBot.id})</p>`;
      html += `<p><strong>Bot Path:</strong> <code>${summary.selectedBot.path}</code></p>`;
    } else {
      html +=
        '<p><strong>Selected Bot:</strong> <span style="color: red;">❌ No bot selected</span></p>';
    }
    html += `<p><strong>Last Discovery:</strong> ${summary.lastDiscovery ? new Date(summary.lastDiscovery).toLocaleString() : 'Never'}</p>`;
    html += '</div>';

    // Action Buttons
    html += '<div style="margin-bottom: 20px;">';
    html +=
      '<a href="/bot-config/discover" style="background: #007cba; color: white; padding: 10px 15px; text-decoration: none; border-radius: 4px; margin-right: 10px;">🔍 Re-scan for Bots</a>';
    html +=
      '<a href="/bot-config/add" style="background: #28a745; color: white; padding: 10px 15px; text-decoration: none; border-radius: 4px; margin-right: 10px;">➕ Add Bot Manually</a>';
    html +=
      '<a href="/bot-config/export" style="background: #6c757d; color: white; padding: 10px 15px; text-decoration: none; border-radius: 4px;">📤 Export Config</a>';
    html += '</div>';

    if (allBots.length === 0) {
      // No bots found
      html +=
        '<div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 20px; border-radius: 8px; text-align: center;">';
      html += '<h3>⚠️ No Bots Found</h3>';
      html += '<p>No tf2autobot installations were discovered automatically.</p>';
      html += '<p>This could mean:</p>';
      html += '<ul style="text-align: left; display: inline-block;">';
      html += '<li>tf2autobot is not installed in common locations</li>';
      html += '<li>Bot configurations are in non-standard directories</li>';
      html += '<li>Permissions prevent access to bot directories</li>';
      html += '</ul>';
      html += '<p><strong>Solutions:</strong></p>';
      html +=
        '<p><a href="/bot-config/add" style="background: #28a745; color: white; padding: 10px 15px; text-decoration: none; border-radius: 4px;">Add Bot Manually</a></p>';
      html +=
        '<p><a href="/bot-config/discover" style="background: #007cba; color: white; padding: 10px 15px; text-decoration: none; border-radius: 4px;">Re-run Discovery</a></p>';
      html += '</div>';
    } else {
      // Show bot list
      html +=
        '<div style="background: white; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">';
      html +=
        '<h3 style="background: #f8f9fa; margin: 0; padding: 15px; border-bottom: 1px solid #ddd;">🤖 Available Bots</h3>';

      html += '<table style="width: 100%; border-collapse: collapse;">';
      html += '<thead style="background: #f8f9fa;">';
      html += '<tr>';
      html +=
        '<th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd;">Status</th>';
      html +=
        '<th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd;">Bot Name</th>';
      html +=
        '<th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd;">Steam ID</th>';
      html +=
        '<th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd;">Path</th>';
      html +=
        '<th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd;">Source</th>';
      html +=
        '<th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd;">Actions</th>';
      html += '</tr>';
      html += '</thead>';
      html += '<tbody>';

      allBots.forEach((bot, index) => {
        const isSelected = selectedBot && selectedBot.id === bot.id;
        const rowStyle = isSelected
          ? 'background: #e8f4fd;'
          : index % 2 === 0
            ? 'background: #f9f9f9;'
            : '';

        html += `<tr style="${rowStyle}">`;
        html += `<td style="padding: 12px; border-bottom: 1px solid #eee;">${isSelected ? '✅ Active' : '⭕ Available'}</td>`;
        html += `<td style="padding: 12px; border-bottom: 1px solid #eee;"><strong>${bot.name || 'Unnamed Bot'}</strong></td>`;
        html += `<td style="padding: 12px; border-bottom: 1px solid #eee;"><code>${bot.steamId || 'Unknown'}</code></td>`;
        html += `<td style="padding: 12px; border-bottom: 1px solid #eee;"><small><code>${bot.botPath}</code></small></td>`;
        html += `<td style="padding: 12px; border-bottom: 1px solid #eee;">${bot.source || 'unknown'}</td>`;
        html += '<td style="padding: 12px; border-bottom: 1px solid #eee;">';

        if (!isSelected) {
          html += `<a href="/bot-config/select?id=${encodeURIComponent(bot.id)}" style="background: #007cba; color: white; padding: 5px 10px; text-decoration: none; border-radius: 3px; font-size: 12px; margin-right: 5px;">Select</a>`;
        }

        if (bot.source === 'manual') {
          html += `<a href="/bot-config/remove?id=${encodeURIComponent(bot.id)}" style="background: #dc3545; color: white; padding: 5px 10px; text-decoration: none; border-radius: 3px; font-size: 12px;" onclick="return confirm('Remove this bot configuration?')">Remove</a>`;
        }

        html += '</td>';
        html += '</tr>';
      });

      html += '</tbody>';
      html += '</table>';
      html += '</div>';
    }

    // Migration Notice
    if (configManager.config.migration) {
      html +=
        '<div style="background: #d1ecf1; border: 1px solid #bee5eb; padding: 15px; border-radius: 8px; margin-top: 20px;">';
      html += '<h4>📋 Migration Notice</h4>';
      html += `<p>Your configuration was automatically migrated from version ${configManager.config.migration.migratedFrom} on ${new Date(configManager.config.migration.migratedAt).toLocaleString()}.</p>`;
      html +=
        '<p>The old configuration has been backed up. The new format supports multiple bots and easier management.</p>';
      html += '</div>';
    }

    html += '</div>';

    res.send(renderPage('Bot Configuration', html));
  });

  // Discover/Re-scan for bots
  router.get('/discover', (req, res) => {
    try {
      const results = configManager.rediscover();
      const newBots = results.bots.length;

      let html = '<div style="max-width: 800px; margin: 0 auto; padding: 20px;">';
      html +=
        '<div style="background: #d4edda; border: 1px solid #c3e6cb; padding: 20px; border-radius: 8px; text-align: center;">';
      html += '<h2>🔍 Bot Discovery Complete</h2>';
      html += `<p><strong>Found ${results.installations.length} tf2autobot installation(s)</strong></p>`;
      html += `<p><strong>Found ${newBots} bot configuration(s)</strong></p>`;
      html += `<p><strong>Found ${results.processes.length} running process(es)</strong></p>`;
      html +=
        '<p><a href="/bot-config" style="background: #007cba; color: white; padding: 10px 15px; text-decoration: none; border-radius: 4px;">← Back to Bot Configuration</a></p>';
      html += '</div>';
      html += '</div>';

      res.send(renderPage('Discovery Complete', html));
    } catch (err) {
      res.status(500).send(renderPage('Error', `<p>Discovery failed: ${err.message}</p>`));
    }
  });

  // Select a bot
  router.get('/select', (req, res) => {
    try {
      const botId = req.query.id;
      if (!botId) {
        return res.status(400).send(renderPage('Error', '<p>Bot ID is required</p>'));
      }

      const bot = configManager.selectBot(botId);

      let html = '<div style="max-width: 800px; margin: 0 auto; padding: 20px;">';
      html +=
        '<div style="background: #d4edda; border: 1px solid #c3e6cb; padding: 20px; border-radius: 8px; text-align: center;">';
      html += '<h2>✅ Bot Selected</h2>';
      html += `<p><strong>${bot.name}</strong> is now the active bot.</p>`;
      html += `<p>Path: <code>${bot.botPath}</code></p>`;
      html +=
        '<p><a href="/bot-config" style="background: #007cba; color: white; padding: 10px 15px; text-decoration: none; border-radius: 4px;">← Back to Bot Configuration</a></p>';
      html += '</div>';
      html += '</div>';

      res.send(renderPage('Bot Selected', html));
    } catch (err) {
      res.status(500).send(renderPage('Error', `<p>Failed to select bot: ${err.message}</p>`));
    }
  });

  // Add bot manually form
  router.get('/add', (req, res) => {
    let html = '<div style="max-width: 800px; margin: 0 auto; padding: 20px;">';
    html += '<h2>➕ Add Bot Manually</h2>';
    html += '<p>If auto-discovery did not find your bot, you can add it manually here.</p>';

    html +=
      '<form method="POST" style="background: white; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">';
    html += '<div style="margin-bottom: 15px;">';
    html +=
      '<label for="name" style="display: block; margin-bottom: 5px; font-weight: bold;">Bot Name:</label>';
    html +=
      '<input type="text" id="name" name="name" required style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;" placeholder="My Trading Bot">';
    html += '</div>';

    html += '<div style="margin-bottom: 15px;">';
    html +=
      '<label for="tf2autobotPath" style="display: block; margin-bottom: 5px; font-weight: bold;">tf2autobot Installation Path:</label>';
    html +=
      '<input type="text" id="tf2autobotPath" name="tf2autobotPath" required style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;" placeholder="C:\\tf2autobot-5.13.2">';
    html +=
      '<small style="color: #666;">Full path to your tf2autobot installation directory</small>';
    html += '</div>';

    html += '<div style="margin-bottom: 15px;">';
    html +=
      '<label for="botDirectory" style="display: block; margin-bottom: 5px; font-weight: bold;">Bot Directory:</label>';
    html +=
      '<input type="text" id="botDirectory" name="botDirectory" required style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;" placeholder="files/mybot">';
    html +=
      '<small style="color: #666;">Relative path from tf2autobot directory to your bot\'s files (e.g., files/mybot)</small>';
    html += '</div>';

    html += '<div style="margin-bottom: 15px;">';
    html +=
      '<label for="steamId" style="display: block; margin-bottom: 5px; font-weight: bold;">Steam ID (optional):</label>';
    html +=
      '<input type="text" id="steamId" name="steamId" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;" placeholder="76561198012345678">';
    html += '</div>';

    html += '<div style="margin-top: 20px;">';
    html +=
      '<button type="submit" style="background: #28a745; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px;">Add Bot</button>';
    html +=
      '<a href="/bot-config" style="background: #6c757d; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Cancel</a>';
    html += '</div>';
    html += '</form>';
    html += '</div>';

    res.send(renderPage('Add Bot Manually', html));
  });

  // Add bot manually POST
  router.post('/add', (req, res) => {
    try {
      const { name, tf2autobotPath, botDirectory, steamId } = req.body;

      if (!name || !tf2autobotPath || !botDirectory) {
        return res
          .status(400)
          .send(
            renderPage('Error', '<p>Name, tf2autobot path, and bot directory are required</p>')
          );
      }

      const bot = configManager.addBot({
        name,
        tf2autobotPath,
        botDirectory,
        steamId: steamId || undefined,
      });

      let html = '<div style="max-width: 800px; margin: 0 auto; padding: 20px;">';
      html +=
        '<div style="background: #d4edda; border: 1px solid #c3e6cb; padding: 20px; border-radius: 8px; text-align: center;">';
      html += '<h2>✅ Bot Added Successfully</h2>';
      html += `<p><strong>${bot.name}</strong> has been added to your configuration.</p>`;
      html +=
        '<p><a href="/bot-config" style="background: #007cba; color: white; padding: 10px 15px; text-decoration: none; border-radius: 4px;">← Back to Bot Configuration</a></p>';
      html += '</div>';
      html += '</div>';

      res.send(renderPage('Bot Added', html));
    } catch (err) {
      res.status(500).send(renderPage('Error', `<p>Failed to add bot: ${err.message}</p>`));
    }
  });

  // Export configuration
  router.get('/export', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="bot-config-export.json"');
    res.send(JSON.stringify(configManager.config, null, 2));
  });

  app.use('/bot-config', router);
};

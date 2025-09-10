# 🤖 Multi-Bot Setup Guide

**Updated for the new ConfigManager system - Manage multiple TF2Autobot instances effortlessly.**

## 🎯 Overview

The enhanced multi-bot system allows you to:

- **Auto-discover** TF2Autobot installations across your system
- **Switch bots seamlessly** via web interface
- **Configure different strategies** per bot
- **Monitor all bots** from a unified dashboard
- **Manage configurations** without editing JSON files

## 🚀 Quick Setup

The easiest way to set up multiple bots:

```bash
npm run setup
```

This will automatically:

1. **Scan your system** for TF2Autobot installations
2. **Detect bot configurations** in standard locations
3. **Create bot entries** in `pricerConfig.json`
4. **Set up the web interface** for easy management

## 🔍 Auto-Discovery

The autopricer scans these locations:

- Current directory and subdirectories
- Parent directories (up to 3 levels)
- Common installation paths:
  - `~/tf2autobot/`
  - `~/bots/*/`
  - `./tf2autobot*/`
  - `/opt/tf2autobot/`

### Discovery Process

1. **Finds TF2Autobot installations** by looking for:

   - `package.json` with tf2autobot dependency
   - Valid directory structure with `files/` folder
   - Readable configuration files

2. **Identifies bot configurations** by scanning:

   - `files/*/config.json` files
   - Valid Steam ID configurations
   - Accessible bot directories

3. **Creates bot entries** automatically with:
   - Descriptive names based on directory structure
   - Proper path configurations
   - Source tracking for management

## 🌐 Web Interface Management

### Bot Selection Dashboard

Visit: `http://localhost:3000/bot-config`

Features:

- **Current Active Bot** display with status
- **Bot List** showing all discovered bots
- **Quick Switch** buttons for each bot
- **Health Indicators** for connection status
- **Add New Bot** manual configuration option

### Switching Between Bots

1. Go to the bot configuration page
2. Click **"Switch to this bot"** on your desired bot
3. Confirm the switch in the popup
4. All pricing operations now use the selected bot

The switch is instant and doesn't require restarting the autopricer.

## 🗂️ Configuration Structure

### New Multi-Bot Config (`pricerConfig.json`)

```json
{
  "version": "2.0",
  "selectedBot": "main-trading-bot",
  "bots": {
    "main-trading-bot": {
      "id": "main-trading-bot",
      "name": "Main Trading Bot",
      "tf2autobotPath": "/home/user/tf2autobot",
      "botPath": "/home/user/tf2autobot/files/bot1",
      "botDirectory": "bot1",
      "steamId": "76561198123456789",
      "description": "Primary trading bot for general items",
      "source": "auto-discovered",
      "configPath": "/home/user/tf2autobot/files/bot1/config.json"
    },
    "unusual-specialist": {
      "id": "unusual-specialist",
      "name": "Unusual Specialist",
      "tf2autobotPath": "/home/user/tf2autobot-unusual",
      "botPath": "/home/user/tf2autobot-unusual/files/unusual-bot",
      "botDirectory": "unusual-bot",
      "steamId": "76561198987654321",
      "description": "Specialized unusual trading bot",
      "source": "manually-added"
    }
  },
  "database": {
    "host": "localhost",
    "port": 5432,
    "database": "tf2autopricer",
    "user": "autopricer",
    "password": "secure_password"
  },
  "port": 3000,
  "ageThresholdSec": 7200
}
```

### Individual Bot Configs

Each bot maintains its own `config.json` with specific settings:

**Main Bot** (`/path/to/tf2autobot/files/bot1/config.json`):

```json
{
  "steamAccountName": "mainbot",
  "steamPassword": "password",
  "bptfAccessToken": "main_bot_bptf_token",
  "bptfApiKey": "main_bot_api_key",
  "steamApiKey": "steam_api_key",
  "profitOptimizer": {
    "enabled": true,
    "targetMargin": 0.15,
    "dynamicAdjustment": true
  },
  "marketAnalyzer": {
    "enabled": true,
    "regimeDetection": {
      "enabled": true,
      "sensitivity": 0.7
    }
  }
}
```

**Unusual Bot** (`/path/to/tf2autobot-unusual/files/unusual-bot/config.json`):

```json
{
  "steamAccountName": "unusualbot",
  "steamPassword": "password",
  "bptfAccessToken": "unusual_bot_bptf_token",
  "bptfApiKey": "unusual_bot_api_key",
  "steamApiKey": "steam_api_key",
  "profitOptimizer": {
    "enabled": true,
    "targetMargin": 0.25,
    "dynamicAdjustment": false
  },
  "marketAnalyzer": {
    "enabled": false
  }
}
```

}

````

## 🔧 Manual Bot Addition

If auto-discovery misses a bot, add it manually via the web interface:

1. **Go to**: `http://localhost:3000/bot-config/add`
2. **Fill in the form**:
   - Bot Name: Descriptive name for the bot
   - TF2Autobot Path: Path to the tf2autobot installation
   - Bot Directory: Subdirectory in `files/` folder
   - Steam ID: Bot's Steam ID (optional)
   - Description: Purpose/role of the bot

3. **Validate**: The system will check paths and configuration
4. **Save**: Bot is added to your configuration

## 🛠️ Advanced Configuration

### Bot-Specific Pricing Strategies

Different bots can use different pricing approaches:

```json
{
  "bots": {
    "aggressive-trader": {
      "name": "Aggressive Trader",
      "profitOptimizer": {
        "enabled": true,
        "targetMargin": 0.25,
        "dynamicAdjustment": true,
        "riskTolerance": "high"
      }
    },
    "safe-trader": {
      "name": "Conservative Trader",
      "profitOptimizer": {
        "enabled": true,
        "targetMargin": 0.10,
        "dynamicAdjustment": false,
        "riskTolerance": "low"
      }
    }
  }
}
````

### Environment-Based Configuration

Use different configurations for development vs production:

```json
{
  "bots": {
    "production-bot": {
      "name": "Production Bot",
      "environment": "production",
      "marketAnalyzer": {
        "enabled": true,
        "regimeDetection": {
          "enabled": true,
          "sensitivity": 0.8
        }
      }
    },
    "test-bot": {
      "name": "Test Bot",
      "environment": "development",
      "marketAnalyzer": {
        "enabled": false
      }
    }
  }
}
```

## 🚨 Troubleshooting Multi-Bot Issues

### Bot Not Found During Discovery

**Symptoms**: Expected bot doesn't appear in discovery results

**Solutions**:

1. **Check TF2Autobot installation**:

   - Verify `package.json` exists with tf2autobot dependency
   - Confirm `files/` directory is present
   - Ensure bot config files are valid JSON

2. **Check file permissions**:

   ```bash
   # Make sure autopricer can read bot directories
   chmod -R 755 /path/to/tf2autobot/files/
   ```

3. **Run discovery with verbose output**:
   ```bash
   npm run setup-bots -- --verbose
   ```

### Bot Switch Not Working

**Symptoms**: Web interface shows "switched" but pricing still uses old bot

**Solutions**:

1. **Verify bot configuration**: Check that the target bot's config.json is valid
2. **Restart autopricer**: Sometimes a restart is needed after major config changes
3. **Check logs**: Look for error messages in the console output
4. **Validate paths**: Ensure all file paths in the bot configuration are correct

### Configuration Conflicts

**Symptoms**: Settings from one bot affecting another

**Solutions**:

1. **Check `selectedBot`** in `pricerConfig.json`
2. **Verify bot isolation**: Each bot should have separate directories
3. **Clear cache**: Delete any cached configuration files
4. **Restart with clean config**: Backup and regenerate `pricerConfig.json`

### Permission Errors

**Symptoms**: Cannot read/write bot configuration files

**Solutions**:

1. **Fix directory permissions**:

   ```bash
   chmod -R 755 ./files/
   chown -R $USER:$USER ./files/
   ```

2. **Run with appropriate user**: Ensure autopricer runs as user with bot access
3. **Check SELinux/AppArmor**: Security policies might block access

## 🔄 Migration from Single-Bot Setup

If you're upgrading from an older single-bot configuration:

### Automatic Migration

1. **Backup existing configuration**:

   ```bash
   cp config.json config.json.backup
   ```

2. **Run the migration**:

   ```bash
   npm run setup
   ```

3. **Verify the migration**:
   - Check that `pricerConfig.json` was created
   - Confirm your old bot appears in the web interface
   - Test switching and pricing functionality

### Manual Migration

If automatic migration fails:

1. **Create new configuration structure** following the examples above
2. **Copy bot-specific settings** from old `config.json` to individual bot configs
3. **Update paths** to reflect new structure
4. **Test each bot** individually before production use

## 📊 Bot Management Dashboard

### Features

The bot configuration dashboard (`/bot-config`) provides:

- **Real-time status** for each configured bot
- **Quick switching** between active bots
- **Configuration validation** and health checks
- **Usage statistics** and performance metrics
- **Log viewing** for individual bots

### Status Indicators

- 🟢 **Online**: Bot is connected and functioning
- 🟡 **Warning**: Bot has minor issues but is operational
- 🔴 **Error**: Bot has critical issues and needs attention
- ⚫ **Offline**: Bot is not running or unreachable

## 🎯 Best Practices

### Organization

- **Use descriptive names**: "Main-General-Items" vs "Bot1"
- **Group related bots**: Keep similar bots in same directory structure
- **Document purposes**: Use descriptions to explain each bot's role
- **Tag appropriately**: Use consistent tagging for filtering

### Security

- **Separate API keys**: Each bot should have its own backpack.tf tokens
- **Isolate configurations**: Keep bot configs in separate directories
- **Monitor access**: Log who switches between bots and when
- **Regular backups**: Back up configurations before major changes

### Performance

- **Limit concurrent bots**: Don't run more bots than your system can handle
- **Stagger operations**: Avoid all bots updating simultaneously
- **Monitor resources**: Watch CPU, memory, and network usage
- **Database optimization**: Use connection pooling for multiple bots

## 🔌 API Integration

### Current Bot Information

```javascript
// Get the currently active bot
fetch('/api/bot/current')
  .then((res) => res.json())
  .then((bot) => {
    console.log('Active bot:', bot.name);
    console.log('Steam ID:', bot.steamId);
  });
```

### Switch Bot Programmatically

```javascript
// Switch to a different bot
fetch('/api/bot/switch', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ botId: 'unusual-specialist' }),
})
  .then((res) => res.json())
  .then((result) => {
    if (result.success) {
      console.log('Switched to:', result.bot.name);
    }
  });
```

### List All Available Bots

```javascript
// Get list of all configured bots
fetch('/api/bots')
  .then((res) => res.json())
  .then((bots) => {
    bots.forEach((bot) => {
      console.log(`${bot.name}: ${bot.status}`);
    });
  });
```

## 📈 Monitoring and Analytics

### Bot Performance Tracking

Each bot's performance is tracked separately:

- **Pricing accuracy**: How often prices are within market range
- **Response time**: Speed of price updates and API calls
- **Error rates**: Frequency of failed operations
- **Profit metrics**: Calculated margins and optimization effectiveness

### Health Monitoring

The system continuously monitors:

- **Configuration validity**: Ensures all bot configs are proper
- **API connectivity**: Tests backpack.tf and Steam API access
- **File accessibility**: Verifies all paths and permissions
- **Database connectivity**: Confirms database access for each bot

## 🚀 Next Steps

- **[Configuration Reference](CONFIGURATION.md)** - Detailed settings for all modules
- **[API Documentation](API.md)** - Complete REST API reference
- **[Troubleshooting](TROUBLESHOOTING.md)** - Solutions for common issues
- **[Installation Guide](INSTALLATION.md)** - Basic setup instructions

---

**Pro Tip**: Use the web interface for most bot management tasks - it's safer and easier than editing JSON files manually!

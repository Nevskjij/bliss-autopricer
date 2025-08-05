# 🤖 Multi-Bot Setup Guide

Complete guide to managing multiple TF2Autobot instances with Bliss Autopricer.

## Overview

The multi-bot system allows you to:
- Manage multiple TF2Autobot instances from one interface
- Switch between bots seamlessly
- Configure different pricing strategies per bot
- Monitor all bots from a unified dashboard

## Auto-Discovery

The autopricer can automatically find your TF2Autobot installations:

```bash
npm run setup
```

This will scan common locations:
- Current directory and subdirectories
- Parent directories
- Common installation paths

## Manual Bot Configuration

### 1. Basic Bot Setup

Edit `pricerConfig.json`:

```json
{
  "selectedBot": "main-bot",
  "bots": {
    "main-bot": {
      "name": "Main Trading Bot",
      "tf2autobotPath": "/path/to/tf2autobot",
      "botDirectory": "files/main-bot",
      "description": "Primary trading bot with general items"
    },
    "unusual-bot": {
      "name": "Unusual Specialist",
      "tf2autobotPath": "/path/to/tf2autobot-unusual",
      "botDirectory": "files/unusual-bot", 
      "description": "Specialized bot for unusual trading"
    },
    "key-bot": {
      "name": "Key Trading Bot",
      "tf2autobotPath": "/path/to/tf2autobot-keys",
      "botDirectory": "files/key-bot",
      "description": "High-volume key trading bot"
    }
  }
}
```

### 2. Bot-Specific Configuration

Each bot can have different settings in their respective `config.json` files:

#### Main Bot (`/path/to/tf2autobot/files/main-bot/config.json`)
```json
{
  "bptfAccessToken": "main_bot_token",
  "bptfApiKey": "main_bot_api_key",
  "pricingStrategy": {
    "scmFallback": true,
    "scmMarginBuy": 0.10,
    "scmMarginSell": 0.15
  }
}
```

#### Unusual Bot (`/path/to/tf2autobot-unusual/files/unusual-bot/config.json`)
```json
{
  "bptfAccessToken": "unusual_bot_token", 
  "bptfApiKey": "unusual_bot_api_key",
  "pricingStrategy": {
    "scmFallback": false,
    "minListings": 2,
    "unusualPricing": true
  }
}
```

## Web Interface Management

### Switching Between Bots

1. Visit `http://localhost:3000/bot-config`
2. Select your desired bot from the dropdown
3. Click "Switch Bot"
4. All pricing operations will now use the selected bot

### Bot Status Dashboard

The bot config page shows:
- **Active Bot**: Currently selected bot
- **Bot List**: All configured bots with status
- **Health Checks**: Connection status for each bot
- **Quick Actions**: Switch, edit, or remove bots

## Configuration Files Structure

```
your-project/
├── pricerConfig.json          # Main autopricer config
├── tf2autobot-main/
│   └── files/
│       └── main-bot/
│           ├── config.json    # Bot-specific config
│           └── pricelist.json # Bot's pricelist
├── tf2autobot-unusual/
│   └── files/
│       └── unusual-bot/
│           ├── config.json
│           └── pricelist.json
└── tf2autobot-keys/
    └── files/
        └── key-bot/
            ├── config.json
            └── pricelist.json
```

## Bot Discovery Algorithm

The auto-discovery process:

1. **Scans directories** for TF2Autobot installations
2. **Identifies bot configurations** by looking for:
   - `package.json` with tf2autobot dependency
   - `files/` directory structure
   - Valid `config.json` files
3. **Validates configurations** for required fields
4. **Creates bot entries** in `pricerConfig.json`

## Advanced Multi-Bot Features

### Bot-Specific Pricing Strategies

```json
{
  "bots": {
    "aggressive-bot": {
      "pricingStrategy": {
        "scmMarginBuy": 0.05,
        "scmMarginSell": 0.20,
        "aggressivePricing": true
      }
    },
    "conservative-bot": {
      "pricingStrategy": {
        "scmMarginBuy": 0.15,
        "scmMarginSell": 0.10,
        "safetyMargins": true
      }
    }
  }
}
```

### Bot Groups and Tags

```json
{
  "bots": {
    "main-bot": {
      "name": "Main Bot",
      "tags": ["general", "high-volume"],
      "group": "production"
    },
    "test-bot": {
      "name": "Test Bot", 
      "tags": ["testing", "development"],
      "group": "development"
    }
  }
}
```

## Troubleshooting Multi-Bot Setup

### Bot Not Detected

**Symptoms**: Bot doesn't appear in auto-discovery

**Solutions**:
1. Verify TF2Autobot installation is complete
2. Check `files/` directory exists
3. Ensure `config.json` is valid JSON
4. Run discovery with verbose logging: `npm run setup -- --verbose`

### Configuration Conflicts

**Symptoms**: Settings not applying to correct bot

**Solutions**:
1. Check `selectedBot` in `pricerConfig.json`
2. Verify bot paths are correct
3. Restart autopricer after configuration changes
4. Use web interface to verify active bot

### Permission Issues

**Symptoms**: Cannot read/write bot files

**Solutions**:
1. Check file permissions on bot directories
2. Ensure autopricer has read/write access
3. Run with appropriate user permissions
4. Verify paths use forward slashes on Windows

## Migration from Single Bot

If you're upgrading from a single-bot setup:

1. **Backup existing configuration**:
   ```bash
   cp config.json config.json.backup
   ```

2. **Run migration**:
   ```bash
   npm run setup
   ```

3. **Verify migration**:
   - Check `pricerConfig.json` was created
   - Confirm bot appears in web interface
   - Test switching between configurations

## Best Practices

### Organization
- Use descriptive bot names
- Group related bots together
- Tag bots by function or strategy
- Document bot purposes in descriptions

### Security
- Use separate API keys for each bot
- Limit file permissions appropriately
- Monitor bot access logs
- Regular configuration backups

### Performance
- Don't run too many bots simultaneously
- Monitor system resources
- Use different databases for isolation
- Schedule intensive operations during off-peak hours

## API Integration

### Get Current Bot
```javascript
fetch('/api/bot/current')
  .then(res => res.json())
  .then(bot => console.log('Active bot:', bot));
```

### Switch Bot
```javascript
fetch('/api/bot/switch', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ botId: 'unusual-bot' })
});
```

### List All Bots
```javascript
fetch('/api/bots')
  .then(res => res.json())
  .then(bots => console.log('Available bots:', bots));
```

## Next Steps

- **[Configuration Reference](CONFIGURATION.md)** - Detailed configuration options
- **[API Documentation](API.md)** - REST API and WebSocket usage
- **[Troubleshooting](TROUBLESHOOTING.md)** - Common issues and solutions

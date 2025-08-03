# Enhanced Bot Configuration System

## Overview

The BPTF Autopricer now includes an enhanced configuration system that:

- **Auto-discovers** tf2autobot installations and bot configurations
- **Supports multiple bots** with easy switching between them
- **Migrates old configurations** automatically
- **Provides a web interface** for easy bot management
- **Eliminates manual path configuration** in most cases

## Quick Setup

### 1. Automatic Setup (Recommended)

Run the auto-configuration command:

```bash
npm run setup
```

This will:

- Scan for tf2autobot installations
- Find all bot configurations automatically
- Set up the configuration file
- Show you which bots were found
- Provide next steps

### 2. Manual Setup (If Auto-Discovery Fails)

If the auto-discovery doesn't find your bots:

1. Start the Price Watcher: `npm start`
2. Visit: `http://localhost:3000/bot-config`
3. Click "Add Bot Manually"
4. Fill in your bot details

## Configuration Files

### Old Format (Automatically Migrated)

```json
{
  "pm2ProcessName": "tf2autobot",
  "tf2AutobotDir": "../../tf2autobot-5.13.0",
  "botTradingDir": "files/bot",
  "port": 3000,
  "ageThresholdSec": 7200
}
```

### New Format (Multi-Bot Support)

```json
{
  "version": "2.0",
  "port": 3000,
  "ageThresholdSec": 7200,
  "pm2ProcessName": "tf2autobot",
  "selectedBot": "bot_123",
  "bots": [
    {
      "id": "bot_123",
      "name": "Main Trading Bot",
      "tf2autobotPath": "/path/to/tf2autobot",
      "botDirectory": "files/mainbot",
      "botPath": "/path/to/tf2autobot/files/mainbot",
      "pricelistPath": "/path/to/tf2autobot/files/mainbot/pricelist.json",
      "steamId": "76561198012345678",
      "enabled": true,
      "source": "discovery"
    }
  ]
}
```

## Web Interface

### Bot Configuration Dashboard

Visit: `http://localhost:3000/bot-config`

Features:

- View all discovered bots
- Switch between bots easily
- Add bots manually
- Remove manually added bots
- Re-scan for new bot installations
- Export configuration

### Bot Management

- **Select Active Bot**: Choose which bot's pricelist to manage
- **Multiple Bot Support**: Easily switch between different bot configurations
- **Auto-Discovery**: Automatically finds new bot installations
- **Migration**: Old configurations are automatically upgraded

## Supported Bot Discovery

The system automatically searches for:

### tf2autobot Installation Locations

- `../../tf2autobot*`
- `../../../tf2autobot*`
- `$HOME/tf2autobot`
- `$USERPROFILE/tf2autobot`
- Environment variable: `$TF2AUTOBOT_DIR`

### Bot Configuration Detection

- Looks for `config.json` or `pricelist.json` in bot directories
- Extracts bot names and Steam IDs from configuration files
- Supports any directory structure within `files/` folder

## Migration from Old Configuration

If you have an existing `pricerConfig.json`, the system will:

1. **Automatically migrate** your configuration to the new format
2. **Backup** your old configuration to `pricerConfig.json.v1.backup`
3. **Convert** your single bot setup to the new multi-bot format
4. **Preserve** all your existing settings

## Troubleshooting

### No Bots Found

If auto-discovery finds no bots:

1. **Check tf2autobot installation**: Ensure tf2autobot is installed
2. **Verify bot directories**: Look for `files/` folder with bot subdirectories
3. **Check permissions**: Ensure the autopricer can read bot directories
4. **Use manual setup**: Add bots manually via the web interface

### Configuration Issues

- **Old config not working**: The system will migrate automatically
- **Bot not found**: Use "Re-scan for Bots" to refresh discovery
- **Path errors**: Add bots manually with correct paths
- **Permission errors**: Check file system permissions

### Web Interface Issues

- **Can't access dashboard**: Ensure the Price Watcher is running
- **No bots in list**: Run discovery or add bots manually
- **Selection not working**: Check bot configuration validity

## Commands

```bash
# Auto-setup and discovery
npm run setup

# Alternative setup command
npm run setup-bots

# Start the autopricer
npm start

# Start Price Watcher only
npm run dev
```

## Benefits

### For Users

- **No more manual path configuration** in most cases
- **Easy multiple bot management**
- **Visual web interface** for configuration
- **Automatic migration** from old setups

### For Developers

- **Backward compatible** with existing setups
- **Extensible discovery system**
- **Clean separation** between autopricer and Price Watcher configs
- **Better error handling** and user feedback

## Advanced Usage

### Environment Variables

- `TF2AUTOBOT_DIR`: Custom tf2autobot installation path
- `PRICE_WATCHER_PORT`: Custom port for Price Watcher

### API Integration

The configuration system exposes methods for:

- Programmatic bot selection
- Configuration updates
- Discovery integration
- Legacy compatibility

### Custom Discovery

You can extend the discovery system by:

- Adding custom search paths
- Implementing custom detection logic
- Integrating with external configuration systems

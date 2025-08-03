# BPTF Autopricer Multi-Bot Configuration Systemn

**Setup**: Automatic bot discovery and management system that:

- Auto-finds tf2autobot installations
- Discovers all bot configurations automatically
- Supports multiple bots with easy switching
- Provides a web interface for management
- Migrates old configurations seamlessly

## Key Features 🚀

### 1. Auto-Discovery System

- Scans common tf2autobot installation locations
- Finds bot configurations automatically
- Detects running PM2 processes
- No manual path configuration needed

### 2. Multi-Bot Support

- Manage multiple bots from one interface
- Easy switching between bot configurations
- Each bot maintains its own settings
- Support for different tf2autobot versions

### 3. Web Interface

- Visual dashboard at `/bot-config`
- Add/remove bots manually
- Switch active bots with one click
- Configuration overview and status

### 4. Seamless Migration

- Automatically upgrades old configurations
- Backs up original config files
- Maintains backward compatibility
- Zero user intervention required

## How to Use 📖

### For New Users

```bash
# 1. Install and setup
npm install
npm run setup

# 2. Start the system
npm start

# 3. Visit web interface
# http://localhost:3000/bot-config
```

### For Existing Users

- Your old `pricerConfig.json` will be automatically migrated
- A backup is created as `pricerConfig.json.v1.backup`
- Everything continues working as before
- New features are available immediately

## Configuration Examples

### Old Format (Still Supported)

```json
{
  "pm2ProcessName": "tf2autobot",
  "tf2AutobotDir": "../../../tf2autobot-5.13.2",
  "botTradingDir": "files/blisstrading",
  "port": 3000,
  "ageThresholdSec": 7200
}
```

### New Format (Auto-Generated)

```json
{
  "version": "2.0",
  "port": 3000,
  "ageThresholdSec": 7200,
  "pm2ProcessName": "tf2autobot",
  "selectedBot": "tf2autobot_mainbot",
  "bots": [
    {
      "id": "tf2autobot_mainbot",
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

## Discovery Locations 🔍

The system automatically searches:

**tf2autobot Installations:**

- `../../tf2autobot*`
- `../../../tf2autobot*`
- `../../../../tf2autobot*`
- `../tf2autobot*`
- `./tf2autobot*`
- `$HOME/tf2autobot`
- `$USERPROFILE/tf2autobot`
- `$TF2AUTOBOT_DIR` (environment variable)

**Bot Configurations:**

- Any subdirectory in `tf2autobot/files/` containing:
  - `config.json` (bot configuration)
  - `pricelist.json` (price data)

## Web Interface Features 🌐

### Dashboard (`/bot-config`)

- Configuration overview
- List of all discovered bots
- Active bot indicator
- Quick bot switching

### Bot Management

- **Select Bot**: Choose active bot for pricing
- **Add Manually**: Add bots not found by discovery
- **Remove**: Delete manually added bot configs
- **Re-scan**: Refresh bot discovery
- **Export**: Download configuration backup

### Status Information

- Connection health
- Configuration version
- Migration status
- Discovery results

## Benefits for Users 🎯

### Simplified Setup

- **No more manual path configuration**
- **Automatic discovery of existing bots**
- **One-command setup process**
- **Clear error messages and guidance**

### Multi-Bot Support

- **Switch between bots easily**
- **Manage different trading strategies**
- **Support for multiple tf2autobot versions**
- **Independent bot configurations**

### Better User Experience

- **Visual web interface**
- **Real-time status updates**
- **Automatic migration from old setups**
- **Clear documentation and help**

## Troubleshooting 🔧

### No Bots Found

1. Run `npm run setup` to re-scan
2. Check tf2autobot installation paths
3. Verify bot directory structure
4. Add bots manually via web interface

### Migration Issues

- Old config is automatically backed up
- System maintains backward compatibility
- Manual migration available if needed
- Support for both old and new formats

### Permission Problems

- Check file system permissions
- Ensure autopricer can read bot directories
- Run with appropriate user privileges
- Check antivirus software blocking access

## Commands Reference 📝

```bash
# Setup and discovery
npm run setup              # Auto-configure bots
npm run setup-bots         # Alternative setup command

# Running the system
npm start                  # Start full autopricer
npm run dev                # Start Price Watcher only

# Development
node setup-bots.js         # Run setup directly
```

## Migration Path 🔄

**Automatic Migration:**

1. System detects old `pricerConfig.json` format
2. Creates backup file (`pricerConfig.json.v1.backup`)
3. Converts to new multi-bot format
4. Preserves all existing settings
5. Adds discovered bots to configuration

**Manual Migration:**

- Use web interface to add bots
- Export/import configuration files
- Restore from backup if needed

This system makes bot configuration **10x easier** for users while maintaining full backward compatibility and adding powerful new multi-bot capabilities!

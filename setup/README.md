# Setup Scripts

This directory contains the setup and maintenance scripts for the Bliss Autopricer.

## Scripts

### `setup.js`

**Main setup script for first-time installation**

Features:

- Automated PostgreSQL detection and installation
- Database setup and user creation
- Bot discovery and configuration
- Interactive configuration wizard
- Comprehensive logging to `../logs/setup-*.log`
- Windows-specific PostgreSQL path detection
- Cross-platform package manager support

Usage:

```bash
npm run setup
```

### `setup-bots.js`

**Bot discovery and configuration script**

Features:

- Scans for tf2autobot installations
- Discovers bot configurations
- Updates the autopricer configuration
- Web interface integration

Usage:

```bash
npm run setup-bots
```

### `update.js`

**Update script for keeping the autopricer current**

Features:

- Git repository update checking
- Automatic backup creation
- Dependency updates
- Database migration support
- Configuration validation
- Rollback support via backups

Usage:

```bash
npm run update
```

### `validate-config.js`

**Configuration validation script**

Features:

- Validates API key configuration
- Checks database settings
- Identifies placeholder values
- Provides setup guidance
- Detailed error reporting

Usage:

```bash
npm run validate-config
```

## Directory Structure

```
setup/
├── README.md              # This documentation
├── setup.js               # Main setup script
├── setup-bots.js          # Bot discovery script
├── update.js              # Update script
├── validate-config.js     # Configuration validator
└── sql/                   # Database scripts
    ├── initialize-db.sql   # Initial schema creation
    └── update-listing-stats.sql  # Migration script
```

## SQL Scripts

### `sql/initialize-db.sql`

**Database schema initialization script**

Creates the initial database structure:

- `tf2` schema
- Core tables: `listings`, `key_prices`, `listing_stats`, `price_history`
- Indexes and constraints
- Used automatically during setup

### `sql/update-listing-stats.sql`

**Database migration script**

Adds buy/sell statistics columns to existing installations:

- Extends `listing_stats` table
- Backward compatibility updates
- Run manually for existing databases

## Logging

All setup scripts create detailed logs in the `../logs/` directory:

- `setup-YYYY-MM-DDTHH-MM-SS.log` - Setup process logs
- Logs include system information, command execution, and error details
- Share log files when reporting issues

## Backup System

The update script automatically creates backups in `../backups/`:

- Configuration files (`pricerConfig.json`, `config.json`)
- Pricelist data (`files/pricelist.json`)
- Package files (`package.json`, `package-lock.json`)
- Timestamped backup directories

## Windows Support

Special handling for Windows includes:

- PostgreSQL detection in common installation paths
- PowerShell integration for PATH management
- Chocolatey/Scoop/Winget package manager support
- Administrator privilege handling

## Troubleshooting

### PostgreSQL Issues

- Check `../docs/POSTGRESQL_FIX.md` for Windows-specific solutions
- Logs show exact detection paths and errors
- Manual installation options provided

### Configuration Issues

- Use `npm run validate-config` to check configuration
- Backup files available for rollback
- Web interface provides manual configuration options

### Update Issues

- Automatic backups prevent data loss
- Git status checks before updates
- Dependency conflict resolution

## Development

To modify the setup scripts:

1. Test changes thoroughly on different platforms
2. Update logging for new features
3. Maintain backward compatibility
4. Update documentation

## Dependencies

Setup scripts require:

- Node.js 22.0.0+
- npm or compatible package manager
- Git (for updates)
- PostgreSQL (installed automatically if needed)

## Related Documentation

- `../docs/INSTALLATION.md` - Installation guide
- `../docs/MULTI-BOT.md` - Multi-bot setup
- `../docs/TROUBLESHOOTING.md` - General troubleshooting
- `../docs/POSTGRESQL_FIX.md` - PostgreSQL-specific fixes

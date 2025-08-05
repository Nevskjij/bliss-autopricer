# 📦 Installation Guide

Complete setup instructions for Bliss Autopricer.

## Prerequisites

- **Node.js** v22.0.0+ (required for built-in fetch support)
- **PostgreSQL** v12+
- **TF2Autobot** (any recent version)
- **API Keys**: backpack.tf API key and Steam API key

## 1. Clone and Install

```bash
git clone https://github.com/OliverPerring/bliss-autopricer.git
cd bliss-autopricer
npm install
```

## 2. Install PostgreSQL

### Windows (Recommended: Scoop)

```bash
scoop install postgresql
```

Or download from: https://www.postgresql.org/download/windows/

### Ubuntu/Debian

```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### macOS (using Homebrew)

```bash
brew install postgresql@16
brew services start postgresql@16
```

## 3. Database Setup

### Create Database User and Schema

```sql
-- Connect to PostgreSQL as admin user (usually 'postgres')
psql -U postgres

-- Create user and database
CREATE USER autopricer WITH PASSWORD 'your_secure_password';
CREATE DATABASE tf2autopricer OWNER autopricer;

-- Connect to the new database
\c tf2autopricer

-- Create schema and grant permissions
CREATE SCHEMA tf2;
GRANT ALL PRIVILEGES ON SCHEMA tf2 TO autopricer;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA tf2 TO autopricer;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA tf2 TO autopricer;
ALTER DEFAULT PRIVILEGES IN SCHEMA tf2 GRANT ALL ON TABLES TO autopricer;
ALTER DEFAULT PRIVILEGES IN SCHEMA tf2 GRANT ALL ON SEQUENCES TO autopricer;

-- Exit psql
\q
```

## 4. Bot Configuration Setup

### Option A: Automated Setup (Recommended)

```bash
npm run setup
```

This command will:
- Auto-discover your tf2autobot installations
- Create and configure multi-bot support
- Set up database connections
- Validate your configuration

### Option B: Manual Configuration

1. Copy the example configuration:
```bash
cp pricerConfig.json.example pricerConfig.json
```

2. Edit `pricerConfig.json` with your settings:
```json
{
  "selectedBot": "main-bot",
  "bots": {
    "main-bot": {
      "name": "Main Bot",
      "tf2autobotPath": "/path/to/tf2autobot",
      "botDirectory": "files/bot1",
      "description": "Primary trading bot"
    }
  },
  "database": {
    "host": "localhost",
    "port": 5432,
    "database": "tf2autopricer",
    "user": "autopricer",
    "password": "your_secure_password"
  },
  "port": 3000,
  "ageThresholdSec": 7200
}
```

## 5. API Keys Configuration

Edit your bot's `config.json` file and ensure you have:

```json
{
  "bptfAccessToken": "your_bptf_access_token",
  "bptfApiKey": "your_bptf_api_key",
  "steamApiKey": "your_steam_api_key"
}
```

**Get your API keys:**
- **Backpack.tf API**: [backpack.tf/api/register](https://backpack.tf/api/register)
- **Steam API Key**: [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey)

## 6. Validate Configuration

```bash
npm run validate-config
```

This will check:
- Database connectivity
- API key validity
- Bot configuration
- File permissions

## 7. Initialize Database Tables

The database tables will be automatically created when you first run the autopricer. You can also manually initialize them using the SQL file:

```bash
psql -U autopricer -d tf2autopricer -f initialize-db.sql
```

## 8. Start the Autopricer

```bash
# Development mode
npm run dev

# Production mode
npm start
```

## 9. Access Web Interface

Visit: `http://localhost:3000`

The web interface provides:
- Bot selection and management
- Price monitoring dashboard
- Configuration management
- WebSocket health status

## Environment Variables

You can also use environment variables:

```bash
export PRICE_WATCHER_PORT=3000
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=tf2autopricer
export DB_USER=autopricer
export DB_PASSWORD=your_password
```

## Next Steps

- **[Multi-Bot Setup](MULTI-BOT.md)** - Configure multiple bots
- **[Configuration Reference](CONFIGURATION.md)** - Detailed configuration options
- **[Troubleshooting](TROUBLESHOOTING.md)** - Common issues and solutions

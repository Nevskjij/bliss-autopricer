# 📦 Installation Guide

**Quick and easy setup for Bliss Autopricer with automated PostgreSQL installation.**

## 🚀 Quick Start (Recommended)

The fastest way to get started is with our automated setup script:

```bash
git clone https://github.com/OliverPerring/bliss-autopricer.git
cd bliss-autopricer
npm install
npm run setup
```

This will:

- ✅ Check and install PostgreSQL if needed
- ✅ Create database and user automatically
- ✅ Auto-discover your TF2Autobot installations
- ✅ Configure multi-bot support
- ✅ Set up the web interface
- ✅ Walk you through API key configuration

## 📋 Prerequisites

- **Node.js** v22.0.0+ (required for built-in fetch support)
- **TF2Autobot** installed somewhere on your system
- **API Keys**: [Backpack.tf API key](https://backpack.tf/api/register) and [Steam API key](https://steamcommunity.com/dev/apikey)

PostgreSQL will be installed automatically if not present.

## 🔧 Manual Installation (Advanced Users)

If you prefer manual setup or the automated script doesn't work for your system:

### 1. Install PostgreSQL

**Windows:**

```bash
# Using Scoop (recommended)
scoop install postgresql

# Using Chocolatey
choco install postgresql -y

# Using Winget
winget install PostgreSQL.PostgreSQL
```

**macOS:**

```bash
brew install postgresql@16
brew services start postgresql@16
```

**Ubuntu/Debian:**

```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### 2. Create Database

```sql
-- Connect as admin user
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

\q
```

### 3. Configure Manually

Create `pricerConfig.json`:

````json
{
  "version": "2.0",
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
### 3. Configure Manually

Create `pricerConfig.json`:

```json
{
  "version": "2.0",
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
````

## 🔑 API Keys Setup

Configure your API keys in your bot's `config.json` file:

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

## 🚀 Start the Autopricer

```bash
npm start
```

Visit: `http://localhost:3000`

## 🌐 Web Interface

The web interface provides:

- **Dashboard**: Overview of pricing data and market trends
- **Bot Management**: Switch between multiple bots seamlessly
- **Settings**: Configure all pricing algorithms and parameters
- **Market Analysis**: Real-time market insights and profit optimization
- **Price Lists**: View and manage bot pricelists
- **Logs**: Monitor system activity and debug issues

## 🔧 Configuration Validation

Validate your setup:

```bash
npm run validate-config
```

This checks:

- Database connectivity
- API key validity
- Bot configuration
- File permissions
- Module dependencies

## 🐛 Troubleshooting

### PostgreSQL Connection Issues

If you get database connection errors:

1. **Check if PostgreSQL is running:**

```bash
# Windows
sc query postgresql

# macOS/Linux
sudo systemctl status postgresql
```

2. **Verify connection details in `pricerConfig.json`**
3. **Test manual connection:**

```bash
psql -U autopricer -d tf2autopricer -h localhost
```

### Bot Discovery Issues

If no bots are found:

1. **Ensure TF2Autobot is properly installed**
2. **Check bot directory structure has `files/` folder**
3. **Verify `config.json` files are valid JSON**
4. **Use manual bot addition via web interface**

### Permission Errors

On Linux/macOS, you may need to fix permissions:

```bash
chmod +x setup.js
chmod -R 755 ./modules
```

## 📚 Next Steps

- **[Multi-Bot Setup](MULTI-BOT.md)** - Configure multiple bots
- **[Configuration Reference](CONFIGURATION.md)** - Detailed settings
- **[API Documentation](API.md)** - REST API usage
- **[Troubleshooting](TROUBLESHOOTING.md)** - Common issues

## 🆘 Getting Help

- **Issues**: [GitHub Issues](https://github.com/OliverPerring/bliss-autopricer/issues)
- **Documentation**: Check the `docs/` folder
- **Discord**: Join the TF2Autobot community
- **Wiki**: See project wiki for advanced topics

---

**Need help?** Run `npm run setup` again or check the troubleshooting guide.

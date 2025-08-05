# bliss-autopricer

[![npm version](https://img.shields.io/npm/v/pg-promise?label=pg-promise)](https://www.npmjs.com/package/pg-promise)
[![Node.js](https://img.shields.io/badge/node-%3E=18.0.0-brightgreen)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-%3E=12-blue)](https://www.postgresql.org/)
[![ESLint](https://img.shields.io/badge/code_style-ESLint-blueviolet)](https://eslint.org/)
[![Prettier](https://img.shields.io/badge/code_style-Prettier-ff69b4)](https://prettier.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

### Notes

- All changes to your bot's pricelist are applied atomically and will trigger a PM2 restart of your TF2Autobot process.
- The web interface reads/writes to `files/item_list.json` and your bot's `pricelist.json` as configured in `pricerConfig.json`.
- Outdated prices are detected using the `ageThresholdSec` setting.

**📚 Learn more about the enhanced configuration system:**
- **[Multi-Bot System Guide](MULTI-BOT-SYSTEM.md)** - Complete feature overview
- **[Bot Configuration Documentation](BOT-CONFIGURATION.md)** - Setup and troubleshooting

<div align="center">
  <img src="https://github.com/jack-richards/bptf-autopricer/assets/58331725/203fe808-30ff-4d7d-868c-a3ef6d31497d" alt="logo" style="width: 280px; height: 320px; display: block; margin-left: auto; margin-right: auto;">
</div>

A custom pricer that generates item prices by analysing live and snapshot data from [backpack.tf](https://backpack.tf), applies sanity checks, and integrates seamlessly with TF2 Autobot. Modified and forked from Jack's Auto Pricer!

---

## 🎉 What's New in This Fork

### Enhanced Multi-Bot Configuration System
- **🔍 Auto-Discovery:** Automatically finds tf2autobot installations and bot configurations
- **🤖 Multi-Bot Support:** Easily switch between multiple bots with a visual web interface
- **⚡ One-Command Setup:** `npm run setup` handles everything automatically
- **🔄 Seamless Migration:** Old configurations are automatically upgraded

### Improved WebSocket Reliability
- **🔧 Enhanced Connection Monitoring:** Automatic detection and recovery from connection issues
- **📊 Health Dashboard:** Real-time websocket status at `/websocket-status`
- **🚨 Proactive Alerts:** Warning system for connection problems
- **♻️ Auto-Recovery:** Automatic reconnection when connections become stale

**📚 Learn More:**
- **[Multi-Bot System Guide](MULTI-BOT-SYSTEM.md)** - Complete overview of the new bot management system
- **[Bot Configuration Documentation](BOT-CONFIGURATION.md)** - Detailed setup and troubleshooting guide
- **[WebSocket Monitoring Fix](WEBSOCKET-MONITORING-FIX.md)** - Technical details of the connection improvements

---

## Features

- **🤖 Enhanced Multi-Bot Configuration:** Auto-discovery and management of multiple tf2autobot instances with visual web interface.
- **🔧 Improved WebSocket Reliability:** Enhanced connection monitoring with automatic recovery from connection issues.
- **Automated Pricing:** Generates item prices using real-time and snapshot [backpack.tf](https://backpack.tf/) listing data, ensuring a profit margin and performing various sanity checks.
- **Robust Fallback Pricing:** If an item cannot be priced from listings, the pricer will attempt to fetch and convert Steam Community Market (SCM) prices (with configurable margin and rounding), and only fall back to Backpack.tf (BPTF) prices as a last resort. This fallback system supports all item types, including unusuals, killstreakers, and special attributes.
- **Baseline Comparison:** Compares generated prices against [Prices.tf](https://github.com/prices-tf) and disregards prices that exceed configured percentage thresholds.
- **Trusted/Blacklisted Steam IDs:** Prioritises listings from trusted bots and filters out untrusted bots when calculating prices. Fully configurable.
- **Excluded Listing Descriptions:** Filters out listings with descriptions containing configured keywords (e.g., spells).
- **Outlier Filtering:** Removes listings with prices that deviate too much from the average.
- **API Functionality:** Add/delete items for auto-pricing and retrieve prices via the API.
- **Socket.IO Server:** Emits item prices to listeners in a format compatible with [TF2 Auto Bot](https://github.com/TF2Autobot/tf2autobot).
- **Price Watcher Web Interface:** Dashboard to monitor item data freshness, view outdated entries, and manage your bot's selling pricelist.

---

## Pricing Logic & Fallback System

The pricer uses a robust multi-stage fallback system to ensure all items (including rare, unusual, and illiquid items) are priced as reliably as possible:

1. **Own Listings:** Attempt to price using live buy/sell listings from trusted sources.
2. **Steam Community Market (SCM) Fallback:** If not enough listings are available, the pricer fetches the item's SCM price, converts it to keys/metal (using the current key price), applies configurable margins (`scmMarginBuy`, `scmMarginSell`), and always rounds to the nearest scrap. This fallback is robust for all item types, including unusuals, killstreakers, australium, and special attributes.
3. **Backpack.tf (BPTF) Fallback:** If SCM pricing is unavailable, the pricer falls back to BPTF prices as a last resort.

- **Batching & Rate Limiting:** SCM fallback requests are batched and rate-limited using [`p-limit`](https://www.npmjs.com/package/p-limit) to avoid Steam rate limits and ensure stability, even with large numbers of unpriced items.
- **Rounding:** All fallback prices (SCM or BPTF) are always rounded to the nearest scrap for consistency.
- **Source:** All fallback prices use `source: 'bptf'` for compatibility with TF2Autobot and other bots.

---

## Requirements

- **Node.js** (v22.0.0 or newer - required for built-in fetch support)
- **npm**
- **PostgreSQL** (v12 or newer)
- **TF2 Auto Bot**

---

## Setup & Installation

### 1. Clone and Install Dependencies

```sh
git clone https://github.com/OliverPerring/bliss-autopricer.git
cd bliss-autopricer
npm install
```

**📋 Included Files Check:**
The following required files should be present after cloning:
- ✅ `config.json` - Main configuration file (needs your API keys)
- ✅ `pricerConfig.json` - Bot configuration (auto-managed by setup)
- ✅ `initialize-db.sql` - Database setup script
- ✅ `setup-bots.js` - Auto-discovery setup script
- ✅ `files/item_list.json` - Example item list
- ✅ `files/pricelist.json` - Example pricelist
- ✅ All required modules in `modules/` directory

**📦 Dependencies:**
- All required Node.js packages are listed in `package.json`
- `node-fetch` is included for compatibility (but uses built-in fetch when available)
- Run `npm install` to install all dependencies automatically

If any files are missing, re-clone the repository.

### 2. Configure Application

**🚀 NEW: Enhanced Bot Configuration System**

We've made bot setup **10x easier** with automatic discovery and multi-bot support!

#### Step 1: Configure API Keys and Database

**⚠️ CRITICAL:** Before running the setup, you MUST configure your API keys and database connection in `config.json`. The autopricer will fail with a 403 error if you skip this step.

**📝 Required API Keys:**
1. **Backpack.tf API Key:** Get from [backpack.tf](https://backpack.tf/developer)
2. **Backpack.tf Token:** Get from [backpack.tf](https://backpack.tf/developer) 
3. **Steam API Key:** Get from [steamcommunity.com](https://steamcommunity.com/dev/apikey)

Edit `config.json` and replace ALL placeholder values:

```json
{
  "bptfAPIKey": "your_actual_bptf_api_key_here",
  "bptfToken": "your_actual_bptf_token_here", 
  "steamAPIKey": "your_actual_steam_api_key_here",
  "database": {
    "schema": "tf2",
    "host": "localhost",
    "port": 5432,
    "name": "bptf-autopricer",
    "user": "postgres",
    "password": "your_actual_database_password"
  },
  // ... rest of configuration
}
```

**🚨 Common Error:** If you get `ERR_BAD_REQUEST` with status 403, you haven't configured your API keys correctly.

**✅ Validation Tool:** Run `npm run validate-config` to check if your configuration is correct before starting the autopricer.

#### Step 2: Quick Bot Setup (Recommended)

```sh
npm run setup
```

This command will:
- Automatically find your tf2autobot installations
- Discover all bot configurations
- Set up the configuration file for you
- Show you which bots were found
- Provide clear next steps

#### Alternative: Manual Configuration

If auto-discovery doesn't find your bots, you can:
1. Start the Price Watcher: `npm start`
2. Visit: `http://localhost:3000/bot-config`
3. Add your bots manually through the web interface

#### Traditional Setup

You can still manually configure `pricerConfig.json` if preferred (see Configuration section below).
The new system handles this automatically.

**📚 For detailed information about the new bot configuration system, see:**
- **[Multi-Bot System Guide](MULTI-BOT-SYSTEM.md)** - Complete overview
- **[Bot Configuration Documentation](BOT-CONFIGURATION.md)** - Detailed setup guide

---

## PostgreSQL Setup

### 1. Install PostgreSQL

- Download and install from [postgresql.org](https://www.postgresql.org/download/).
- Ensure the PostgreSQL service is running.

### 2. Create Database and Schema

Open a terminal and run:

```sh
psql -U postgres
```

Then, in the psql prompt:

```sql
CREATE DATABASE "bptf-autopricer";
\c bptf-autopricer
CREATE SCHEMA tf2 AUTHORIZATION postgres;
```

### 3. Create Tables

You can use the provided [`initialize-db.sql`](initialize-db.sql):

```sh
psql -U postgres -d bptf-autopricer -f initialize-db.sql
```

Or run the following SQL manually:

```sql
CREATE TABLE tf2.listings (
  name character varying NOT NULL,
  sku character varying NOT NULL,
  currencies json NOT NULL,
  intent character varying NOT NULL,
  updated bigint NOT NULL,
  steamid character varying NOT NULL,
  PRIMARY KEY (name, sku, intent, steamid)
);

CREATE TABLE tf2.key_prices (
  id SERIAL PRIMARY KEY,
  sku TEXT NOT NULL,
  buy_price_metal DECIMAL NOT NULL,
  sell_price_metal DECIMAL NOT NULL,
  timestamp INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tf2.listing_stats (
  sku TEXT PRIMARY KEY,
  current_count INTEGER DEFAULT 0,
  moving_avg_count REAL DEFAULT 0,
  last_updated TIMESTAMP DEFAULT NOW (),
  current_buy_count integer DEFAULT 0,
  moving_avg_buy_count real DEFAULT 0,
  current_sell_count integer DEFAULT 0,
  moving_avg_sell_count real DEFAULT 0
);
```

### 4. Test Database Connection and Permissions

In psql, run:

```sql
\dt tf2.*
```

You should see the three tables listed.  
Test permissions by inserting a test row (replace values as needed):

```sql
INSERT INTO
  tf2.listings (name, sku, currencies, intent, updated, steamid)
VALUES
  (
    'Test Item',
    '123;6',
    '{"keys":1,"metal":10}',
    'buy',
    1700000000,
    '12345678901234567'
  );
```

If you get no errors, your user has the correct permissions.

---

## Configuration

### `config.json`

Holds core pricer settings:

```json
{
  "bptfAPIKey": "<your backpack.tf API key>",
  "bptfToken": "<your backpack.tf token>",
  "steamAPIKey": "<your Steam API key>",
  "database": {
    "schema": "tf2",
    "host": "localhost",
    "port": 5432,
    "name": "bptf-autopricer",
    "user": "postgres",
    "password": "<db password>"
  },
  "pricerPort": 3456,
  "maxPercentageDifferences": {
    "buy": 5,
    "sell": -8
  },
  "alwaysQuerySnapshotAPI": true,
  "fallbackOntoPricesTf": false,
  "excludedSteamIDs": ["76561199384015307", "..."],
  "trustedSteamIDs": ["76561199110778355", "..."],
  "excludedListingDescriptions": ["exorcism", "spell", "spelled"],
  "blockedAttributes": {
    "Australium Gold": 15185211,
    "Team Spirit": 12073019,
    "..."
  },
  "scmMarginBuy": 0.05, // (optional) Margin to subtract from SCM price when buying (e.g., 0.05 = 5% below SCM)
  "scmMarginSell": 0.05 // (optional) Margin to add to SCM price when selling (e.g., 0.05 = 5% above SCM)
}
```

- `scmMarginBuy` and `scmMarginSell` control the buy/sell margins applied to fallback SCM prices. If omitted, margins default to 0 (no adjustment).
- All fallback prices are always rounded to the nearest scrap for consistency.
- See the [Pricing Logic & Fallback System](#pricing-logic--fallback-system) section for details.

### `pricerConfig.json` - Bot Configuration

**🆕 Enhanced Multi-Bot Configuration System**

The autopricer now features an advanced bot configuration system that:
- **Auto-discovers** tf2autobot installations and bot configurations
- **Supports multiple bots** with easy switching between them
- **Migrates old configurations** automatically
- **Provides a web interface** for easy bot management

#### Quick Setup
```sh
npm run setup
```

#### Web Management Interface
Visit: `http://localhost:3000/bot-config` to:
- View all discovered bots
- Switch between bot configurations
- Add bots manually
- Export/import configurations

#### Traditional Format (Still Supported)
```json
{
  "pm2ProcessName": "tf2autobot",
  "tf2AutobotDir": "../../tf2autobot-5.13.0",
  "botTradingDir": "files/bot",
  "port": 3000,
  "ageThresholdSec": 7200
}
```

**📚 For complete setup instructions and troubleshooting:**
- **[Multi-Bot System Guide](MULTI-BOT-SYSTEM.md)** - Overview and benefits
- **[Bot Configuration Documentation](BOT-CONFIGURATION.md)** - Detailed setup guide

---

## API Routes & Socket.IO

The Socket.IO server emits events called `price` with an item object as the value.  
The item objects are structured as follows:

```json
{
  "name": "Strange Australium Minigun",
  "sku": "202;11;australium",
  "source": "bptf",
  "time": 1700403492,
  "buy": { "keys": 25, "metal": 21.33 },
  "sell": { "keys": 26, "metal": 61.77 }
}
```

This format is compatible with [TF2 Auto Bot](https://github.com/TF2Autobot/tf2autobot) custom pricer interface.

### Example API Endpoints

- `GET /items/:sku` — Retrieve a particular item object from the pricelist.
- `GET /items/` — Retrieve the entire pricelist.
- `POST /items/:sku` — Endpoint for integration with TF2 Auto Bot.
- `POST /items/add/:name` — Add an item to be auto-priced.
- `POST /items/delete/:name` — Remove an item from auto-pricing.

See the full API documentation in this README for request/response details.

---

## Running

After completing the setup and configuration steps above:

**Start the autopricer:**

```sh
npm start
```

**Alternative methods:**

```sh
# Direct execution
node bptf-autopricer.js

# Development mode (same as npm start)
npm run dev
```

**Tip:** Run under PM2 to keep alive:

```sh
npm install -g pm2
pm2 start bptf-autopricer.js --name bptf-autopricer
```

**⚠️ Before running:** Make sure you have:
1. ✅ Configured API keys in `config.json`
2. ✅ Set up PostgreSQL database (see PostgreSQL Setup section)
3. ✅ Run `npm run setup` to configure your bots

---

## Web Interface

The bliss-autopricer includes a built-in web dashboard for managing and monitoring your pricing bot.  
Visit: `http://localhost:<pricerConfig.port>` (default: 3000).

### Main Features

- **🤖 Bot Configuration Manager:** New multi-bot management system at `/bot-config`
  - Auto-discover and switch between multiple bots
  - Visual bot selection and configuration
  - Migration from old configuration format
- **Dashboard Overview:** View and filter items by status: Outdated, Current, and Unpriced.
- **Pricelist Management:** Add, remove, and edit items and bounds directly in the table.
- **Queue System:** Review and apply pending actions, which will trigger a PM2 restart for changes to take effect.
- **Navigation Bar:** Access price list, bounds editing, key price graphs, profit/loss, trade history, and logs.

### How to Use

1. **Configure your bots** (new!):
   ```sh
   npm run setup  # Auto-discover bots
   ```
   Or visit: `http://localhost:3000/bot-config` for manual setup
2. **Start the pricer** (see "Running" section).
3. **Open your browser** to `http://localhost:<pricerConfig.port>`.
4. **Interact with the dashboard** to manage items and review pending actions.
5. **Explore additional pages** for advanced features.

### Bot Management (New!)

- **Multiple Bot Support:** Easily switch between different bot configurations
- **Auto-Discovery:** Automatically finds tf2autobot installations
- **Web Interface:** Visual bot management at `/bot-config`
- **Migration Support:** Old configurations are automatically upgraded

### Notes

- All changes to your bot’s pricelist are applied atomically and will trigger a PM2 restart of your TF2Autobot process.
- The web interface reads/writes to `files/item_list.json` and your bot’s `pricelist.json` as configured in `pricerConfig.json`.
- Outdated prices are detected using the `ageThresholdSec` setting.

---

## Quick Start Summary

For first-time users, follow these steps in order:

**Prerequisites:**
- Node.js v22.0.0 or newer
- PostgreSQL v12 or newer

**Setup Steps:**
1. **Install dependencies:** `npm install`
2. **Set up PostgreSQL database** (see PostgreSQL Setup section)
3. **⚠️ CRITICAL: Configure API keys** in `config.json` (replace ALL placeholder values!)
4. **Validate configuration:** `npm run validate-config` (optional but recommended)
5. **Run bot setup:** `npm run setup`
6. **Start the autopricer:** `npm start`
7. **Access web interface:** `http://localhost:3000`

**🔑 Required API Keys (MUST configure before running):**
- Backpack.tf API key and token from [backpack.tf/developer](https://backpack.tf/developer)
- Steam API key from [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey)
- PostgreSQL database credentials

**📚 For detailed setup help:**
- **[Multi-Bot System Guide](MULTI-BOT-SYSTEM.md)** - Bot configuration
- **[Bot Configuration Documentation](BOT-CONFIGURATION.md)** - Detailed setup guide

---

## Development & Code Quality

- **Linting:** Uses [ESLint](https://eslint.org/) with plugins for best practices, security, promises, imports, JSDoc, and spellchecking.
- **Formatting:** Uses [Prettier](https://prettier.io/) with plugins for SQL and package.json sorting.
- **CI:** See [`.github/workflows/Lint and Format.yml`](.github/workflows/Lint%20and%20Format.yml) for automated lint/format checks.

---

## FAQ

- **🚨 I'm getting 'ERR_BAD_REQUEST' with status code 403 when starting the autopricer. What's wrong?**  
  This error means your API keys are not configured correctly in `config.json`. Make sure you have:
  - Replaced `"your bptf api key"` with your actual backpack.tf API key
  - Replaced `"your bptf token"` with your actual backpack.tf token  
  - Replaced `"your steam api key"` with your actual Steam API key
  - Set up your database credentials correctly
  
  Get your API keys from [backpack.tf/developer](https://backpack.tf/developer) and [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey).

- **🤖 How do I set up multiple bots or switch between bot configurations?**  
  Use the new multi-bot system! Run `npm run setup` to auto-discover your bots, or visit `http://localhost:3000/bot-config` to manage them manually. See the [Multi-Bot System Guide](MULTI-BOT-SYSTEM.md) for details.

- **🔧 The autopricer stopped receiving price updates from backpack.tf. What's wrong?**  
  This has been fixed! The enhanced websocket monitoring system now automatically detects and recovers from connection issues. Check `http://localhost:3456/websocket-status` for real-time connection health.

- **📁 I'm having trouble configuring the tf2autobot directory paths.**  
  You no longer need to configure paths manually! The auto-discovery system finds your tf2autobot installations automatically. Run `npm run setup` or use the web interface at `/bot-config`.

- **How do I connect this to TF2AutoBot?**  
  See: [jack-richards#11](https://github.com/jack-richards/bptf-autopricer/issues/11)

- **I am getting a 429 error in the console, what does this mean?**  
  See: [jack-richards#17](https://github.com/jack-richards/bptf-autopricer/issues/17)

- **I am being shown 'error: relation "listings" does not exist' when running the pricer.**  
  See: [jack-richards#14](https://github.com/jack-richards/bptf-autopricer/issues/14)

- **Why is the pricer giving a 'Not valid JSON error'?**  
  Your JSON isn't valid—check that `item_list.json` matches [this example](https://github.com/jack-richards/bptf-autopricer/blob/main/files/item_list.json).

- **There are loads of 'Couldn't price item' errors, is everything broken?!**  
  No! The pricer is protecting you by discarding prices that deviate too much from the baseline. Over time, most items will be priced and updated regularly.

---

_Built with ❤️ for TF2 trading_

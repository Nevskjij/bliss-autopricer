const fs = require('fs');
const path = require('path');
const { loadJson, saveJson } = require('./utils');

/**
 * Base Configuration Manager
 * Handles main application configuration (config.json)
 * Provides centralized access to API keys, database settings, bot owners, etc.
 */
class BaseConfigManager {
  constructor(configPath = null) {
    this.configPath = configPath || path.resolve(__dirname, '../config.json');
    this._config = null;
    this._watchers = new Set();
  }

  /**
   * Load configuration from file
   */
  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        this._config = loadJson(this.configPath);
        return this._config;
      }
    } catch (error) {
      console.warn('Error loading main config:', error.message);
    }

    // Create default config if not exists
    this._config = this.createDefaultConfig();
    this.saveConfig();
    return this._config;
  }

  /**
   * Get current configuration (loads if not already loaded)
   */
  getConfig() {
    if (!this._config) {
      this.loadConfig();
    }
    return this._config;
  }

  /**
   * Get a specific config value with optional default
   * @param key
   * @param defaultValue
   */
  get(key, defaultValue = undefined) {
    const config = this.getConfig();
    return this.getNestedValue(config, key, defaultValue);
  }

  /**
   * Set a specific config value
   * @param key
   * @param value
   */
  set(key, value) {
    const config = this.getConfig();
    this.setNestedValue(config, key, value);
    this.saveConfig();
    this.notifyWatchers(key, value);
  }

  /**
   * Update multiple config values at once
   * @param updates
   */
  update(updates) {
    const config = this.getConfig();

    for (const [key, value] of Object.entries(updates)) {
      this.setNestedValue(config, key, value);
    }

    this.saveConfig();
    this.notifyWatchers('bulk_update', updates);
  }

  /**
   * Save configuration to file
   */
  saveConfig() {
    if (this._config) {
      saveJson(this.configPath, this._config);
    }
  }

  /**
   * Create default configuration
   */
  createDefaultConfig() {
    return {
      bptfAPIKey: '',
      bptfToken: '',
      steamAPIKey: '',
      database: {
        schema: 'tf2',
        host: 'localhost',
        port: 5432,
        name: 'bptf-autopricer',
        user: 'postgres',
        password: '',
      },
      pricerPort: 3456,
      maxPercentageDifferences: {
        buy: 5,
        sell: -8,
      },
      minSellMargin: 0.11,
      priceSwingLimits: {
        maxBuyIncrease: 0.1,
        maxSellDecrease: 0.1,
      },
      alwaysQuerySnapshotAPI: true,
      fallbackOntoPricesTf: false,
      priceAllItems: false,
      excludedSteamIDs: [],
      trustedSteamIDs: [],
      excludedListingDescriptions: [],
      blockedAttributes: {},
      botOwnerSteamIDs: [],
    };
  }

  /**
   * Get nested value using dot notation (e.g., 'database.host')
   * @param obj
   * @param path
   * @param defaultValue
   */
  getNestedValue(obj, path, defaultValue) {
    const keys = path.split('.');
    let current = obj;

    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return defaultValue;
      }
    }

    return current;
  }

  /**
   * Set nested value using dot notation
   * @param obj
   * @param path
   * @param value
   */
  setNestedValue(obj, path, value) {
    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }

    current[keys[keys.length - 1]] = value;
  }

  /**
   * Watch for config changes
   * @param callback
   */
  watch(callback) {
    this._watchers.add(callback);
    return () => this._watchers.delete(callback);
  }

  /**
   * Notify watchers of config changes
   * @param key
   * @param value
   */
  notifyWatchers(key, value) {
    for (const callback of this._watchers) {
      try {
        callback(key, value, this._config);
      } catch (error) {
        console.error('Error in config watcher:', error);
      }
    }
  }

  // Convenience methods for common config access patterns

  /**
   * Get API configuration
   */
  getApiConfig() {
    return {
      bptfAPIKey: this.get('bptfAPIKey'),
      bptfToken: this.get('bptfToken'),
      steamAPIKey: this.get('steamAPIKey'),
    };
  }

  /**
   * Get database configuration
   */
  getDatabaseConfig() {
    return this.get('database', {});
  }

  /**
   * Get trading configuration
   */
  getTradingConfig() {
    return {
      minSellMargin: this.get('minSellMargin', 0.11),
      maxPercentageDifferences: this.get('maxPercentageDifferences', {}),
      priceSwingLimits: this.get('priceSwingLimits', {}),
      alwaysQuerySnapshotAPI: this.get('alwaysQuerySnapshotAPI', true),
      fallbackOntoPricesTf: this.get('fallbackOntoPricesTf', false),
      priceAllItems: this.get('priceAllItems', false),
    };
  }

  /**
   * Get bot owner Steam IDs for P&L exclusion
   */
  getBotOwnerSteamIDs() {
    return this.get('botOwnerSteamIDs', []);
  }

  /**
   * Add bot owner Steam ID
   * @param steamId
   */
  addBotOwner(steamId) {
    const owners = this.getBotOwnerSteamIDs();
    if (!owners.includes(steamId)) {
      owners.push(steamId);
      this.set('botOwnerSteamIDs', owners);
    }
  }

  /**
   * Remove bot owner Steam ID
   * @param steamId
   */
  removeBotOwner(steamId) {
    const owners = this.getBotOwnerSteamIDs();
    const filtered = owners.filter((id) => id !== steamId);
    this.set('botOwnerSteamIDs', filtered);
  }

  /**
   * Get Steam ID lists
   */
  getSteamIDLists() {
    return {
      excluded: this.get('excludedSteamIDs', []),
      trusted: this.get('trustedSteamIDs', []),
      botOwners: this.get('botOwnerSteamIDs', []),
    };
  }

  /**
   * Get excluded content filters
   */
  getContentFilters() {
    return {
      excludedListingDescriptions: this.get('excludedListingDescriptions', []),
      blockedAttributes: this.get('blockedAttributes', {}),
    };
  }

  /**
   * Validate configuration
   */
  validate() {
    const config = this.getConfig();
    const errors = [];

    // Validate API keys
    if (!config.steamAPIKey) {
      errors.push('Steam API key is required');
    }

    // Validate database config
    const db = config.database || {};
    if (!db.host) {
      errors.push('Database host is required');
    }
    if (!db.name) {
      errors.push('Database name is required');
    }
    if (!db.user) {
      errors.push('Database user is required');
    }

    // Validate numeric values
    if (config.pricerPort && (config.pricerPort < 1000 || config.pricerPort > 65535)) {
      errors.push('Pricer port must be between 1000 and 65535');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get configuration summary for display
   */
  getSummary() {
    const config = this.getConfig();
    const validation = this.validate();

    return {
      configPath: this.configPath,
      valid: validation.valid,
      errors: validation.errors,
      apiKeysConfigured: {
        steam: !!config.steamAPIKey,
        bptfAPI: !!config.bptfAPIKey,
        bptfToken: !!config.bptfToken,
      },
      database: {
        host: config.database?.host || 'Not configured',
        name: config.database?.name || 'Not configured',
        user: config.database?.user || 'Not configured',
      },
      botOwners: config.botOwnerSteamIDs?.length || 0,
      excludedIds: config.excludedSteamIDs?.length || 0,
      trustedIds: config.trustedSteamIDs?.length || 0,
    };
  }
}

// Singleton instance for global access
let instance = null;

/**
 * Get singleton instance of BaseConfigManager
 * @param configPath
 */
function getBaseConfigManager(configPath = null) {
  if (!instance) {
    instance = new BaseConfigManager(configPath);
  }
  return instance;
}

module.exports = {
  BaseConfigManager,
  getBaseConfigManager,
};

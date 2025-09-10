/**
 * Enhanced Steam Schema Manager with robust error handling and fallbacks
 * Handles the inconsistent behavior of Steam's GetSchemaItems API
 */

const fs = require('fs');
const path = require('path');

class EnhancedSchemaManager {
  constructor(originalSchemaManager, config) {
    this.originalManager = originalSchemaManager;
    this.config = config;
    this.schemaPath = path.resolve(__dirname, '../schema.json');
    this.lastSuccessfulFetch = null;
    this.isRetiring = false;
    this.initAttempted = false;
    this.maxRetries = 20;
    this.retryDelay = 2000; // 2 seconds
  }

  /**
   * Implements the init method to maintain compatibility
   * @param {Function} callback - Callback function
   */
  init(callback) {
    if (this.initAttempted) {
      // Already attempted, just call the callback
      callback(null);
      return;
    }

    this.initAttempted = true;
    console.log('🔄 [Schema] Initializing enhanced schema manager...');

    this.tryInitWithRetries(callback, 1);
  }

  /**
   * Attempts initialization with retry logic
   * @param {Function} callback - Callback function
   * @param {number} attempt - Current attempt number
   */
  async tryInitWithRetries(callback, attempt) {
    console.log(`🔄 [Schema] Attempt ${attempt}/${this.maxRetries}: Fetching Steam schema...`);

    // Try the original init
    this.originalManager.init(async (err) => {
      if (err) {
        console.error(`❌ [Schema] Attempt ${attempt} failed:`, err.message);

        // Check if this is the "retired" error
        if (this.isRetiredError(err)) {
          this.isRetiring = true;
          console.warn('🚨 [Schema] Steam reports GetSchemaItems as retired!');
        }

        // If we haven't reached max retries, try again
        if (attempt < this.maxRetries) {
          console.log(`⏳ [Schema] Waiting ${this.retryDelay / 1000} seconds before retry...`);
          setTimeout(() => {
            this.tryInitWithRetries(callback, attempt + 1);
          }, this.retryDelay);
          return;
        }

        // All retries exhausted, try cached schema as fallback
        console.error(
          `❌ [Schema] All ${this.maxRetries} attempts failed, trying cached schema...`
        );
        try {
          const hasCachedSchema = this.useCachedSchemaFallback();
          if (hasCachedSchema) {
            console.log('✅ [Schema] Using cached schema as fallback');
            this.lastSuccessfulFetch = Date.now();
            callback(null);
            return;
          }
        } catch (cacheError) {
          console.error('❌ [Schema] Cached schema fallback failed:', cacheError.message);
        }

        // All fallbacks failed
        console.error('❌ [Schema] All schema initialization attempts failed');
        callback(err);
      } else {
        console.log(`✅ [Schema] Attempt ${attempt} succeeded!`);
        this.lastSuccessfulFetch = Date.now();
        this.isRetiring = false;
        callback(null);
      }
    });
  }

  /**
   * Uses cached schema as fallback
   */
  useCachedSchemaFallback() {
    try {
      if (fs.existsSync(this.schemaPath)) {
        const cachedData = JSON.parse(fs.readFileSync(this.schemaPath, 'utf8'));

        // Check if cached schema is not too old (e.g., less than 30 days)
        const stats = fs.statSync(this.schemaPath);
        const ageInDays = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);

        if (ageInDays < 30) {
          console.log(`💡 [Schema] Using cached schema (${ageInDays.toFixed(1)} days old)`);
          this.originalManager.setSchema(cachedData);
          return true;
        } else {
          console.warn(
            `⚠️ [Schema] Cached schema is ${ageInDays.toFixed(1)} days old, but using anyway`
          );
          this.originalManager.setSchema(cachedData);
          return true;
        }
      } else {
        console.error('❌ [Schema] No cached schema available');
        return false;
      }
    } catch (error) {
      console.error('❌ [Schema] Failed to use cached schema:', error.message);
      return false;
    }
  }

  /**
   * Checks if error indicates the API has been retired
   * @param error
   */
  isRetiredError(error) {
    const errorMessage = error.message?.toLowerCase() || '';
    const errorResponse = error.response?.data?.toLowerCase() || '';
    const errorString = error.toString().toLowerCase();

    return (
      errorMessage.includes('retired') ||
      errorMessage.includes('not found') ||
      errorResponse.includes('retired') ||
      errorResponse.includes('getschematems') ||
      errorString.includes('403') ||
      errorString.includes('forbidden') ||
      error.response?.status === 404 ||
      error.response?.status === 403
    );
  }

  /**
   * Gets the health status of the schema manager
   */
  getHealthStatus() {
    return {
      isRetiring: this.isRetiring,
      lastSuccessfulFetch: this.lastSuccessfulFetch,
      hasSchema: !!this.originalManager.schema,
      cachedSchemaExists: fs.existsSync(this.schemaPath),
      cachedSchemaAge: this.getCachedSchemaAge(),
    };
  }

  /**
   * Gets the age of the cached schema in hours
   */
  getCachedSchemaAge() {
    try {
      if (fs.existsSync(this.schemaPath)) {
        const stats = fs.statSync(this.schemaPath);
        return (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Proxy method to get schema from original manager
   */
  get schema() {
    return this.originalManager.schema;
  }

  /**
   * Proxy method for events
   * @param {...any} args
   */
  on(...args) {
    return this.originalManager.on(...args);
  }

  once(...args) {
    return this.originalManager.once(...args);
  }

  removeListener(...args) {
    return this.originalManager.removeListener(...args);
  }

  /**
   * Proxy method for setSchema
   * @param {...any} args
   */
  setSchema(...args) {
    return this.originalManager.setSchema(...args);
  }
}

module.exports = EnhancedSchemaManager;

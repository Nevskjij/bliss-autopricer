// This file is part of the BPTF Autopricer project.
// It is a Node.js application that connects to Backpack.tf's WebSocket API,
const fs = require('fs');
const path = require('path');
const pLimit = require('p-limit').default; // For limiting concurrent operations
const Schema = require('@tf2autobot/tf2-schema');
const EnhancedSchemaManager = require('./modules/steamSchemaManager');
const methods = require('./methods');
const Methods = new methods();
const { validateConfig } = require('./modules/configValidation');
const CONFIG_PATH = path.resolve(__dirname, 'config.json');
const config = validateConfig(CONFIG_PATH);
const PriceWatcher = require('./modules/PriceWatcher'); //outdated price logging
const SCHEMA_PATH = './schema.json';
// Paths to the pricelist and item list files.
const PRICELIST_PATH = './files/pricelist.json';
const ITEM_LIST_PATH = './files/item_list.json';
const { listen, socketIO, setSchemaManager } = require('./API/server.js');
const { setWebSocketStatsProvider } = require('./API/routes/websocket-status.js');
const { startPriceWatcher } = require('./modules/index');
const scheduleTasks = require('./modules/scheduler');
const { getBptfPrices, getAllPricedItemNamesWithEffects } = require('./modules/bptfPriceFetcher');
const EmitQueue = require('./modules/emitQueue');
const emitQueue = new EmitQueue(socketIO, 5); // 5ms between emits
emitQueue.start();

const {
  sendPriceAlert,
  cleanupOldKeyPrices,
  insertKeyPrice,
  adjustPrice,
  checkKeyPriceStability,
} = require('./modules/keyPriceUtils');

const { updateMovingAverages, updateListingStats } = require('./modules/listingAverages');
const AdvancedPricing = require('./modules/advancedPricing');
const MLPricePrediction = require('./modules/mlPricePrediction');
const DynamicBounds = require('./modules/dynamicBounds');
const PriceValidator = require('./modules/priceValidator');
const PriceDiscoveryEngine = require('./modules/priceDiscoveryEngine');
const RobustEstimators = require('./modules/robustEstimators');
const ProfitOptimizer = require('./modules/profitOptimizer');
const ArbitrageDetector = require('./modules/arbitrageDetector');
const CompetitionAnalyzer = require('./modules/competitionAnalyzer');

const {
  getListings,
  insertListing,
  insertListingsBatch,
  deleteRemovedListing,
  deleteOldListings,
} = require('./modules/listings');
const logDir = path.join(__dirname, 'logs');
const logFile = path.join(logDir, 'websocket.log');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  // Optionally: process.exit(1); // Only if you want to force a restart
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  // Optionally: process.exit(1); // Only if you want to force a restart
});

// Steam API key is required for the schema manager to work.
const originalSchemaManager = new Schema({
  apiKey: config.steamAPIKey,
});

// Enhanced schema manager with retry logic and fallbacks
const schemaManager = new EnhancedSchemaManager(originalSchemaManager, config);

// Connect schema manager to API for monitoring
setSchemaManager(schemaManager);

// Steam IDs of bots that we want to ignore listings from.
const excludedSteamIds = config.excludedSteamIDs;

// Steam IDs of bots that we want to prioritize listings from.
const prioritySteamIds = config.trustedSteamIDs;

// Listing descriptions that we want to ignore.
const excludedListingDescriptions = config.excludedListingDescriptions;

// Blocked attributes that we want to ignore. (Paints, parts, etc.)
const blockedAttributes = config.blockedAttributes;

const fallbackOntoPricesTf = config.fallbackOntoPricesTf;

const updatedSkus = new Set();

// Initialize advanced pricing modules
let advancedPricing, mlPredictor, dynamicBounds, priceValidator, priceDiscoveryEngine;
let profitOptimizer, arbitrageDetector, competitionAnalyzer;

// Create database instance for pg-promise.
const { db, pgp } = require('./modules/dbInstance');

if (fs.existsSync(SCHEMA_PATH)) {
  // A cached schema exists.

  // Read and parse the cached schema.
  const cachedData = JSON.parse(fs.readFileSync(SCHEMA_PATH), 'utf8');

  // Set the schema data.
  schemaManager.setSchema(cachedData);
}

// Pricelist doesn't exist.
if (!fs.existsSync(PRICELIST_PATH)) {
  try {
    fs.writeFileSync(PRICELIST_PATH, '{"items": []}', 'utf8');
  } catch (err) {
    console.error(err);
  }
}

// Item list doesn't exist.
if (!fs.existsSync(ITEM_LIST_PATH)) {
  try {
    fs.writeFileSync(ITEM_LIST_PATH, '{"items": []}', 'utf8');
  } catch (err) {
    console.error(err);
  }
}

// This event is emitted when the schema has been fetched.
schemaManager.on('schema', function (schema) {
  // Writes the schema data to disk.
  fs.writeFileSync(SCHEMA_PATH, JSON.stringify(schema.toJSON()));
});

var keyobj;
var external_pricelist;

const updateKeyObject = async () => {
  // Always use backpack.tf for key price
  const key_item = await Methods.getKeyFromExternalAPI(
    external_pricelist,
    external_pricelist['5021;6']?.value || 0,
    schemaManager
  );

  console.log(`Key item fetched: ${JSON.stringify(key_item)}`);

  await new Promise((res) => setTimeout(res, 1000)); // Wait 1 second

  Methods.addToPricelist(key_item, PRICELIST_PATH);

  keyobj = {
    metal: key_item.sell.metal,
  };

  // Initialize advanced pricing modules after keyobj is available
  if (!advancedPricing) {
    advancedPricing = new AdvancedPricing(config.advancedPricing || {});
    mlPredictor = new MLPricePrediction(config.mlPrediction || {});
    dynamicBounds = new DynamicBounds(config.dynamicBounds || {});
    priceValidator = new PriceValidator();
    priceDiscoveryEngine = new PriceDiscoveryEngine({
      robustEstimators: config.robustEstimators || {},
      orderBook: config.orderBook || {},
      confidenceThreshold: config.priceDiscoveryConfidence || 0.7,
    });

    // Initialize profit optimization modules
    profitOptimizer = new ProfitOptimizer(config.profitOptimizer || {});
    arbitrageDetector = new ArbitrageDetector(config.arbitrageDetector || {});
    competitionAnalyzer = new CompetitionAnalyzer(config.competitionAnalyzer || {});

    console.log('Advanced pricing and profit optimization modules initialized');
  }

  socketIO.emit('price', key_item);
};

const { initBptfWebSocket } = require('./websocket/bptfWebSocket');

// Load item names and bounds from item_list.json
const createItemListManager = require('./modules/itemList');
const itemListManager = createItemListManager(ITEM_LIST_PATH, config);
const { watchItemList, getAllowedItemNames, getItemBounds, allowAllItems } = itemListManager;
watchItemList();

async function getPricableItems(db) {
  // Tiered approach: Different thresholds for different scenarios
  const rows = await db.any(`
    SELECT sku, current_buy_count, current_sell_count, moving_avg_buy_count, moving_avg_sell_count
    FROM listing_stats
    WHERE 
      -- Tier 1: Ideal case - sufficient buy and sell listings
      (current_buy_count > 3 AND current_sell_count > 3)
      OR
      -- Tier 2: Asymmetric but usable - one side has good data
      (current_buy_count > 5 AND current_sell_count > 1)
      OR
      (current_sell_count > 5 AND current_buy_count > 1)
      OR
      -- Tier 3: Historical data shows activity
      (moving_avg_buy_count > 3 AND moving_avg_sell_count > 1)
      OR
      (moving_avg_sell_count > 3 AND moving_avg_buy_count > 1)
      OR
      -- Tier 4: Minimum viable data
      (current_buy_count + current_sell_count > 6)
  `);

  return rows.map((r) => ({
    sku: r.sku,
    buyCount: r.current_buy_count,
    sellCount: r.current_sell_count,
    tier: getTierForItem(r),
  }));
}

function getTierForItem(row) {
  if (row.current_buy_count > 3 && row.current_sell_count > 3) {
    return 1;
  }
  if (
    (row.current_buy_count > 5 && row.current_sell_count > 1) ||
    (row.current_sell_count > 5 && row.current_buy_count > 1)
  ) {
    return 2;
  }
  if (
    (row.moving_avg_buy_count > 3 && row.moving_avg_sell_count > 1) ||
    (row.moving_avg_sell_count > 3 && row.moving_avg_buy_count > 1)
  ) {
    return 3;
  }
  return 4;
}

const KILLSTREAK_TIERS = {
  1: 'Killstreak',
  2: 'Specialized Killstreak',
  3: 'Professional Killstreak',
};

async function getKsItemNamesToPrice(db, allItemNames) {
  console.log(`Getting killstreak items with enough listings...`);
  const rows = await db.any(`
    SELECT sku FROM listing_stats
    WHERE (sku LIKE '%;kt-1' OR sku LIKE '%;kt-2' OR sku LIKE '%;kt-3')
      AND current_buy_count > 3 AND current_sell_count > 3
  `);
  console.log(`Found ${rows.length} killstreak items with enough listings.`);

  // Build a map from baseSku (defindex + qualities except kt/effect) to name
  const baseSkuToName = new Map();
  for (const name of allItemNames) {
    const sku = schemaManager.schema.getSkuFromName(name);
    if (!sku) {
      continue;
    }
    // Remove killstreak and effect parts for base matching
    const parts = sku.split(';');
    const baseParts = [
      parts[0],
      ...parts.slice(1).filter((p) => !p.startsWith('kt-') && !p.startsWith('u')),
    ];
    const baseSku = baseParts.join(';');
    baseSkuToName.set(baseSku, name);
  }

  const ksNames = [];
  for (const { sku } of rows) {
    console.log(`Processing SKU: ${sku}`);
    // Parse the SKU
    const parts = sku.split(';');
    const defindex = parts[0];
    let ksTier = null;
    let isStrange = false;
    let isAustralium = false;
    let isFestivized = false;
    let qualities = [];

    for (const part of parts.slice(1)) {
      if (part.startsWith('kt-')) {
        ksTier = Number(part.split('-')[1]);
      } else if (part === '11') {
        isStrange = true;
        qualities.push(part);
      } else if (part === 'australium') {
        isAustralium = true;
        qualities.push(part);
      } else if (part === 'festivized') {
        isFestivized = true;
        qualities.push(part);
      } else if (!part.startsWith('u')) {
        qualities.push(part);
      }
    }

    // Build baseSku for lookup (defindex + all qualities except kt/effect)
    const baseParts = [defindex, ...qualities];
    const baseSku = baseParts.join(';');
    let baseName = baseSkuToName.get(baseSku);

    if (!baseName) {
      console.warn(`Base name not found for baseSku ${baseSku} (from KS SKU ${sku}), skipping.`);
      continue;
    }

    // Remove "Strange" if present for baseName, will re-add if needed
    let displayName = baseName
      .replace(/^Strange\s+/i, '')
      .replace(/^Festivized\s+/i, '')
      .replace(/^Australium\s+/i, '');

    // Compose KS name in correct order
    let ksName = '';
    if (isStrange) {
      ksName += 'Strange ';
    }
    if (isFestivized) {
      ksName += 'Festivized ';
    }
    ksName += KILLSTREAK_TIERS[ksTier] + ' ';
    if (isAustralium) {
      ksName += 'Australium ';
    }
    ksName += displayName;

    ksNames.push(ksName.trim());
    console.log(`Added killstreak item name: ${ksName}`);
  }
  console.log(`Found ${ksNames.length} killstreak item names to price.`);
  return ksNames;
}

const calculateAndEmitPrices = async () => {
  await deleteOldListings(db);

  let itemNames;
  if (config.priceAllItems) {
    const pricableItems = await getPricableItems(db);
    console.log(`Priceable items from DB:`, pricableItems.length);
    console.log(
      `Key (5021;6) is priceable:`,
      pricableItems.some((item) => item.sku === '5021;6')
    );

    const pricableSkuSet = new Set(pricableItems.map((item) => item.sku));
    const skusToPrice = new Set(Array.from(updatedSkus).filter((sku) => pricableSkuSet.has(sku)));
    console.log(`Updated SKUs:`, Array.from(updatedSkus));
    console.log(`SKUs to price (updated + priceable):`, Array.from(skusToPrice));

    // Get all item names as usual
    let allItemNames = getAllPricedItemNamesWithEffects(external_pricelist, schemaManager);

    console.log(`Getting killstreak items`);

    const ksNames = await getKsItemNamesToPrice(db, allItemNames);

    console.log(`Found ${ksNames.length} killstreak items to price.`);

    // Only keep names whose SKU is in the price-able set and has been recently updated
    itemNames = allItemNames.filter((name) =>
      skusToPrice.has(schemaManager.schema.getSkuFromName(name))
    );

    // Always ensure keys are included for pricing regardless of recent updates
    const keyName = 'Mann Co. Supply Crate Key';
    if (
      !itemNames.includes(keyName) &&
      allItemNames.includes(keyName) &&
      pricableSkuSet.has('5021;6')
    ) {
      itemNames.push(keyName);
      console.log('Added keys to pricing queue (sufficient listings, forced inclusion)');
    }

    console.log(`Item names is ${itemNames.length} items before killstreak. `);

    itemNames = [...itemNames, ...ksNames];

    console.log(`Item names is ${itemNames.length} items after killstreak. `);

    updatedSkus.clear();
  } else {
    itemNames = Array.from(getAllowedItemNames());
  }

  const limit = pLimit(15); // Limit concurrency to 15, adjust as needed
  const priceHistoryEntries = [];
  const itemsToWrite = [];

  console.log(`About to price ${itemNames.length} items. `);

  await Promise.allSettled(
    itemNames.map((name) =>
      limit(async () => {
        try {
          let sku = schemaManager.schema.getSkuFromName(name);
          let arr = await determinePrice(name, sku);
          let result = await finalisePrice(arr, name, sku);

          // Special handling for keys - log more details
          if (sku === '5021;6') {
            console.log(`Key processing: name=${name}, sku=${sku}`);
            console.log(`Key arr result:`, arr);
            console.log(`Key finalise result:`, result);
          }

          let item = result?.item;
          if (!result || !result.item) {
            if (sku === '5021;6') {
              console.warn(`Key processing failed: no result or item from finalisePrice`);
            }
            return;
          }
          if (
            (item.buy.keys === 0 && item.buy.metal === 0) ||
            (item.sell.keys === 0 && item.sell.metal === 0)
          ) {
            if (sku === '5021;6') {
              console.warn(
                `Key processing failed: zero prices - buy: ${JSON.stringify(item.buy)}, sell: ${JSON.stringify(item.sell)}`
              );
            }
            return;
          }
          // If the item is key add to the right place and skip it.
          if (sku === '5021;6') {
            const buyPrice = item.buy.metal;
            const sellPrice = item.sell.metal;
            const timestamp = Math.floor(Date.now() / 1000);
            console.log(
              `Inserting key price: buy=${buyPrice}, sell=${sellPrice}, timestamp=${timestamp}`
            );
            await insertKeyPrice(db, keyobj, buyPrice, sellPrice, timestamp);
            console.log(`Key price insertion completed`);
            return;
          }
          itemsToWrite.push(item);
          priceHistoryEntries.push(result.priceHistory);
          emitQueue.enqueue(item);
        } catch (e) {
          console.log("Couldn't create a price for " + name + ' due to: ' + e.message);
        }
      })
    )
  );

  // Batch write pricelist at the end
  try {
    // Read current pricelist
    const pricelist = JSON.parse(fs.readFileSync(PRICELIST_PATH, 'utf8'));
    // Remove items with the same SKU as those we're updating
    const updatedSkus = new Set(itemsToWrite.map((i) => i.sku));
    const filtered = pricelist.items.filter((i) => !updatedSkus.has(i.sku));
    // Add new/updated items
    pricelist.items = [...filtered, ...itemsToWrite];
    // Write back to file
    fs.writeFileSync(PRICELIST_PATH, JSON.stringify(pricelist, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to batch write pricelist:', err);
  }

  // After all items processed, batch insert price history:
  if (priceHistoryEntries.length > 0) {
    const cs = new pgp.helpers.ColumnSet(['sku', 'buy_metal', 'sell_metal'], {
      table: 'price_history',
    });
    const values = priceHistoryEntries.map((e) => ({
      sku: e.sku,
      buy_metal: e.buy,
      sell_metal: e.sell,
    }));
    await db.none(pgp.helpers.insert(values, cs) + ' ON CONFLICT DO NOTHING');
  }
};

// When the schema manager is ready we proceed.
schemaManager.init(async function (err) {
  if (err) {
    console.error('❌ [Schema] All schema initialization attempts failed:', err.message);
    process.exit(1);
  }

  // Start watching pricelist.json for “old” entries
  // pricelist.json lives in ./files/pricelist.json relative to this file:
  const pricelistPath = path.resolve(__dirname, './files/pricelist.json');
  // You can pass a custom ageThresholdSec (default is 2*3600) and intervalSec (default is 300)
  PriceWatcher.watchPrices(pricelistPath /*, ageThresholdSec, intervalSec */);

  // Get external pricelist.
  external_pricelist = await getBptfPrices(); //await Methods.getExternalPricelist();
  // Update key object.
  await updateKeyObject();
  console.log(`Key object initialised to bptf base: ${JSON.stringify(keyobj)}`);
  // Get external pricelist.
  //external_pricelist = await Methods.getExternalPricelist();
  // Calculate and emit prices on start up.
  await calculateAndEmitPrices();
  console.log('Prices calculated and emitted on startup.');
  // Call this once at start-up if needed
  //await initializeListingStats(db);
  //console.log('Listing stats initialized.');
  //InitialKeyPricingContinued
  await checkKeyPriceStability({
    db,
    Methods,
    keyobj,
    adjustPrice,
    sendPriceAlert,
    PRICELIST_PATH,
    socketIO,
  });
  console.log('Key price stability check completed.');

  // Start scheduled tasks after everything is ready
  scheduleTasks({
    updateExternalPricelist: async () => {
      external_pricelist = await getBptfPrices(true); //await Methods.getExternalPricelist();
    },
    calculateAndEmitPrices,
    cleanupOldKeyPrices: async (db) => {
      await cleanupOldKeyPrices(db);
    },
    checkKeyPriceStability: async () => {
      await checkKeyPriceStability({
        db,
        Methods,
        keyobj,
        adjustPrice,
        sendPriceAlert,
        PRICELIST_PATH,
        socketIO,
      });
    },
    updateMovingAverages: async (db, pgp) => {
      await updateMovingAverages(db, pgp);
    },
    // Enhanced profit monitoring
    monitorArbitrage: async () => {
      if (arbitrageDetector && config.arbitrageDetector?.enableArbitrageMonitoring) {
        try {
          const pricelist = JSON.parse(fs.readFileSync(PRICELIST_PATH, 'utf8'));
          const items = pricelist.items
            .filter((item) => item.sku !== '5021;6') // Exclude keys
            .slice(0, 50) // Monitor top 50 items
            .map((item) => ({
              sku: item.sku,
              name: item.name,
              bptfPrice: { buy: item.buy, sell: item.sell },
            }));

          const opportunities = await arbitrageDetector.scanForArbitrage(
            items,
            keyobj.metal,
            schemaManager
          );
          const report = arbitrageDetector.generateArbitrageReport(opportunities);

          if (report.summary.totalOpportunities > 0) {
            console.log(
              `🚀 Arbitrage opportunities found: ${report.summary.totalOpportunities} items, potential profit: ${report.summary.totalPotentialProfit} refined`
            );

            // Emit arbitrage data to connected clients
            socketIO.emit('arbitrage-report', report);
          }
        } catch (error) {
          console.warn('Arbitrage monitoring failed:', error.message);
        }
      }
    },
    db,
    pgp,
  });
  console.log('Scheduled tasks started.');

  startPriceWatcher();
  console.log('PriceWatcher started.');

  // After main pricing, fallback for unpriced items
  async function fallbackForUnpricedItems() {
    const allItemNames = getAllPricedItemNamesWithEffects(external_pricelist, schemaManager);
    const pricelist = JSON.parse(fs.readFileSync(PRICELIST_PATH, 'utf8'));
    const pricedSkus = new Set(pricelist.items.map((i) => i.sku));
    const pricableSkus = new Set(await getPricableItems(db));
    const unpricedNames = allItemNames.filter((name) => {
      const sku = schemaManager.schema.getSkuFromName(name);
      return sku && !pricedSkus.has(sku) && !pricableSkus.has(sku);
    });
    const BATCH_SIZE = 10;
    const RATE_LIMIT_DELAY = 1500; // ms between batches
    const limit = pLimit(3); // Max 3 concurrent SCM requests

    // Process batches sequentially to avoid promise callback issues
    for (let i = 0; i < unpricedNames.length; i += BATCH_SIZE) {
      const batch = unpricedNames.slice(i, i + BATCH_SIZE);

      // Process batch
      await processBatch(batch, limit);

      if (i + BATCH_SIZE < unpricedNames.length) {
        await new Promise((res) => setTimeout(res, RATE_LIMIT_DELAY));
      }
    }

    async function processBatch(batch, limit) {
      const promises = batch.map((name) =>
        limit(async () => {
          const sku = schemaManager.schema.getSkuFromName(name);
          if (!sku) {
            return;
          }
          // Prevent SCM fallback for keys
          if (sku === '5021;6') {
            console.warn(
              `SCM fallback attempted for keys (${name}, ${sku}) in fallbackForUnpricedItems - this is not allowed. Skipping SCM fallback.`
            );
            return;
          }
          // Try SCM fallback
          try {
            const hashName = sku ? toMarketHashName(sku, schemaManager.schema) : name;
            const scmPrice = await getSCMPriceObject({
              name: hashName,
              keyMetal: keyobj.metal,
              currency: 'USD',
              scmMarginBuy: config.scmMarginBuy ?? 0,
              scmMarginSell: config.scmMarginSell ?? 0,
            });
            if (scmPrice && (scmPrice.buy.metal > 0 || scmPrice.sell.metal > 0)) {
              const item = {
                name,
                sku,
                source: 'bptf',
                time: Math.floor(Date.now() / 1000),
                buy: scmPrice.buy,
                sell: scmPrice.sell,
              };
              emitQueue.enqueue(item);
              return;
            }
          } catch (e) {
            console.warn(`SCM fallback failed for ${name} (${sku}): ${e.message}`);
          }
          // Try BPTF fallback
          try {
            const data = Methods.getItemPriceFromExternalPricelist(
              sku,
              external_pricelist,
              keyobj.metal,
              schemaManager
            );
            const pricetfItem = data.pricetfItem;
            if (
              !pricetfItem ||
              (pricetfItem.buy.keys === 0 && pricetfItem.buy.metal === 0) ||
              (pricetfItem.sell.keys === 0 && pricetfItem.sell.metal === 0)
            ) {
              return; // skip if no valid price
            }

            // Adjust prices: +25% sell, -25% buy
            const adjust = (val, percent) =>
              Math.max(0, Math.round((val + percent * val) * 100) / 100);

            const buy = {
              keys: pricetfItem.buy.keys,
              metal: adjust(pricetfItem.buy.metal, -0.25),
            };
            const sell = {
              keys: pricetfItem.sell.keys,
              metal: adjust(pricetfItem.sell.metal, 0.25),
            };
            if (
              pricetfItem &&
              (pricetfItem.buy.keys > 0 ||
                pricetfItem.buy.metal > 0 ||
                pricetfItem.sell.keys > 0 ||
                pricetfItem.sell.metal > 0)
            ) {
              const item = {
                name,
                sku,
                source: 'bptf',
                time: Math.floor(Date.now() / 1000),
                buy: buy,
                sell: sell,
              };
              emitQueue.enqueue(item);
            }
          } catch (e) {
            console.warn(`BPTF fallback failed for ${name} (${sku}): ${e.message}`);
          }
        })
      );

      return Promise.all(promises);
    }
    console.log(
      `Fallback pass: emitted fallback prices for ${unpricedNames.length} items not in pricelist and with <3 buy/sell listings.`
    );
  }

  // Only run fallbackForUnpricedItems if both initialSeedUnpriced and priceAllItems are true
  if (config.initialSeedUnpriced && config.priceAllItems) {
    // eslint-disable-next-line spellcheck/spell-checker
    // Note: fallbackForUnpricedItems and emitDefaultBptfPricesForUnpriceableItems have overlapping logic.
    // Consider refactoring to avoid duplication.
    await fallbackForUnpricedItems();
    console.log('Fallback pass for unpriced items complete.');
  }
});

async function isPriceSwingAcceptable(prev, next, sku) {
  // Fetch last 5 prices from DB
  const history = await db.any(
    'SELECT buy_metal, sell_metal FROM price_history WHERE sku = $1 ORDER BY timestamp DESC LIMIT 5',
    [sku]
  );
  if (history.length === 0) {
    return true;
  } // No history, allow

  // Use robust statistical methods for historical analysis
  let avgBuy, avgSell;
  if (priceDiscoveryEngine && priceDiscoveryEngine.robustEstimators) {
    const robustEstimators = priceDiscoveryEngine.robustEstimators;
    const buyPrices = history.map((p) => Number(p.buy_metal)).filter((p) => p > 0);
    const sellPrices = history.map((p) => Number(p.sell_metal)).filter((p) => p > 0);

    avgBuy =
      buyPrices.length > 0 ? robustEstimators.calculateAdaptiveRobustMean(buyPrices).value : 0;
    avgSell =
      sellPrices.length > 0 ? robustEstimators.calculateAdaptiveRobustMean(sellPrices).value : 0;
  } else {
    // Fallback to arithmetic mean if robust estimators not available
    avgBuy = history.reduce((sum, p) => sum + Number(p.buy_metal), 0) / history.length;
    avgSell = history.reduce((sum, p) => sum + Number(p.sell_metal), 0) / history.length;
  }

  const nextBuy = Methods.toMetal(next.buy, keyobj.metal);
  const nextSell = Methods.toMetal(next.sell, keyobj.metal);

  const maxBuyIncrease = config.priceSwingLimits?.maxBuyIncrease ?? 0.1;
  const maxSellDecrease = config.priceSwingLimits?.maxSellDecrease ?? 0.1;

  if (nextBuy > avgBuy && (nextBuy - avgBuy) / avgBuy > maxBuyIncrease) {
    return false;
  }
  if (nextSell < avgSell && (avgSell - nextSell) / avgSell > maxSellDecrease) {
    return false;
  }
  return true;
}

const determinePrice = async (name, sku) => {
  // Delete listings based on moving averages.
  await deleteOldListings(db);

  // Try fetching listings for both name and 'The ' + name if needed
  var buyListings = await getListings(db, name, 'buy');
  var sellListings = await getListings(db, name, 'sell');

  // If not enough listings, try with 'The ' prefix (if not already present)
  if ((!buyListings || buyListings.rowCount === 0) && !name.startsWith('The ')) {
    buyListings = await getListings(db, 'The ' + name, 'buy');
  }
  if ((!sellListings || sellListings.rowCount === 0) && !name.startsWith('The ')) {
    sellListings = await getListings(db, 'The ' + name, 'sell');
  }

  // Get the price of the item from the in-memory external pricelist.
  var data;
  try {
    data = Methods.getItemPriceFromExternalPricelist(
      sku,
      external_pricelist,
      keyobj.metal,
      schemaManager
    );
  } catch {
    throw new Error(`| UPDATING PRICES |: Couldn't price ${name}. Issue with BPTF baseline`);
  }

  var pricetfItem = data.pricetfItem;

  if (
    (pricetfItem.buy.keys === 0 && pricetfItem.buy.metal === 0) ||
    (pricetfItem.sell.keys === 0 && pricetfItem.sell.metal === 0)
  ) {
    // Prevent SCM fallback for keys
    if (sku === '5021;6') {
      console.warn(
        `SCM fallback attempted for keys (${name}, ${sku}) - this is not allowed. Skipping SCM fallback.`
      );
      throw new Error(
        `| UPDATING PRICES |: SCM fallback attempted for keys (${name}, ${sku}) - not allowed.`
      );
    }
    // Try SCM fallback before BPTF fallback
    try {
      // Prefer SKU if available for hash name
      const hashName = sku ? toMarketHashName(sku, schemaManager.schema) : name;
      const marketData = {
        buyCount: buyListings?.rowCount || 0,
        sellCount: sellListings?.rowCount || 0,
        volatility: 0.2, // Default volatility
      };

      const scmPrice = await getSCMPriceObject({
        name: hashName,
        keyMetal: keyobj.metal,
        currency: 'USD',
        scmMarginBuy: config.scmMarginBuy || 0.08,
        scmMarginSell: config.scmMarginSell || 0.12,
        marketData: marketData,
      });

      if (scmPrice && (scmPrice.buy.metal > 0 || scmPrice.sell.metal > 0)) {
        console.log(
          `Enhanced SCM pricing used for ${name} with dynamic margins: buy ${scmPrice.margins.buy.toFixed(3)}, sell ${scmPrice.margins.sell.toFixed(3)}`
        );
        return [scmPrice.buy, scmPrice.sell];
      }
    } catch (e) {
      // SCM fallback failed, continue to BPTF fallback
      console.warn(`Enhanced SCM fallback failed for ${name} (${sku}): ${e.message}`);
    }
    throw new Error(
      `| UPDATING PRICES |: Couldn't price ${name}. Item is not priced on bptf or SCM yet, make a suggestion!, therefore we can't compare our average price to its average price.`
    );
  }

  try {
    // Enhanced logic: Try pricing with asymmetric data
    const buyCount = buyListings?.rowCount || 0;
    const sellCount = sellListings?.rowCount || 0;

    // Minimum viable threshold - at least 2 total listings
    if (buyCount + sellCount < 2) {
      throw new Error(
        `| UPDATING PRICES |: ${name} insufficient total listings (${buyCount + sellCount})...`
      );
    }

    // If we have no buy listings but sell listings, synthesize buy from sell
    if (buyCount === 0 && sellCount > 0) {
      console.log(`${name}: No buy listings, synthesizing from ${sellCount} sell listings`);
      // Create synthetic buy listings at 85% of lowest sell prices
      const sellPrices = sellListings.rows
        .map((listing) => Methods.toMetal(listing.currencies, keyobj.metal))
        .sort((a, b) => a - b);
      const avgLowSell =
        sellPrices.slice(0, Math.min(3, sellPrices.length)).reduce((sum, price) => sum + price, 0) /
        Math.min(3, sellPrices.length);
      const syntheticBuyMetal = avgLowSell * 0.85;

      buyListings = {
        rowCount: 1,
        rows: [
          {
            currencies: Methods.fromMetal(syntheticBuyMetal, keyobj.metal),
            steamid: 'synthetic',
          },
        ],
      };
    }

    // If we have no sell listings but buy listings, synthesize sell from buy
    if (sellCount === 0 && buyCount > 0) {
      console.log(`${name}: No sell listings, synthesizing from ${buyCount} buy listings`);
      // Create synthetic sell listings at 115% of highest buy prices
      const buyPrices = buyListings.rows
        .map((listing) => Methods.toMetal(listing.currencies, keyobj.metal))
        .sort((a, b) => b - a);
      const avgHighBuy =
        buyPrices.slice(0, Math.min(3, buyPrices.length)).reduce((sum, price) => sum + price, 0) /
        Math.min(3, buyPrices.length);
      const syntheticSellMetal = avgHighBuy * 1.15;

      sellListings = {
        rowCount: 1,
        rows: [
          {
            currencies: Methods.fromMetal(syntheticSellMetal, keyobj.metal),
            steamid: 'synthetic',
          },
        ],
      };
    }
  } catch (e) {
    // Prevent SCM fallback for keys
    if (sku === '5021;6') {
      console.warn(
        `SCM fallback attempted for keys (${name}, ${sku}) - this is not allowed. Skipping SCM fallback.`
      );
      throw new Error(
        `| UPDATING PRICES |: SCM fallback attempted for keys (${name}, ${sku}) - not allowed.`
      );
    }
    // Try SCM fallback before BPTF fallback
    try {
      const hashName = sku ? toMarketHashName(sku, schemaManager.schema) : name;
      const scmPrice = await getSCMPriceObject({
        name: hashName,
        keyMetal: keyobj.metal,
        currency: 'USD',
      });
      if (scmPrice && (scmPrice.buy.metal > 0 || scmPrice.sell.metal > 0)) {
        console.log(`SCM fallback used for ${name} (${sku}) due to insufficient listings.`);
        return [scmPrice.buy, scmPrice.sell];
      }
    } catch (scmErr) {
      console.warn(`SCM fallback failed for ${name} (${sku}): ${scmErr.message}`);
    }
    if (fallbackOntoPricesTf) {
      const final_buyObj = {
        keys: pricetfItem.buy.keys,
        metal: pricetfItem.buy.metal,
      };
      const final_sellObj = {
        keys: pricetfItem.sell.keys,
        metal: pricetfItem.sell.metal,
      };
      // Return prices.tf price.
      return [final_buyObj, final_sellObj];
    }
    // If we don't fallback onto bptf, re-throw the error.
    throw e;
  }

  // Sort buyListings into descending order of price.
  var buyFiltered = buyListings.rows.sort((a, b) => {
    let valueA = Methods.toMetal(a.currencies, keyobj.metal);
    let valueB = Methods.toMetal(b.currencies, keyobj.metal);

    return valueB - valueA;
  });

  // Sort sellListings into ascending order of price.
  var sellFiltered = sellListings.rows.sort((a, b) => {
    let valueA = Methods.toMetal(a.currencies, keyobj.metal);
    let valueB = Methods.toMetal(b.currencies, keyobj.metal);

    return valueA - valueB;
  });

  // We prioritise using listings from bots in our prioritySteamIds list.
  // I.e., we move listings by those trusted steam ids to the front of the
  // array, to be used as a priority over any others.

  buyFiltered = buyListings.rows.sort((a, b) => {
    // Custom sorting logic to prioritize specific Steam IDs
    const aIsPrioritized = prioritySteamIds.includes(a.steamid);
    const bIsPrioritized = prioritySteamIds.includes(b.steamid);

    if (aIsPrioritized && !bIsPrioritized) {
      return -1; // a comes first
    } else if (!aIsPrioritized && bIsPrioritized) {
      return 1; // b comes first
    } else {
      return 0; // maintain the original order (no priority)
    }
  });

  sellFiltered = sellListings.rows.sort((a, b) => {
    // Custom sorting logic to prioritize specific Steam IDs
    const aIsPrioritized = prioritySteamIds.includes(a.steamid);
    const bIsPrioritized = prioritySteamIds.includes(b.steamid);

    if (aIsPrioritized && !bIsPrioritized) {
      return -1; // a comes first
    } else if (!aIsPrioritized && bIsPrioritized) {
      return 1; // b comes first
    } else {
      return 0; // maintain the original order (no priority)
    }
  });

  try {
    // If the buyFiltered or sellFiltered arrays are empty, we throw an error.
    let arr = await getAverages(name, buyFiltered, sellFiltered, sku, pricetfItem);
    return arr;
  } catch (e) {
    throw new Error(e);
  }
};

// Function to calculate the Z-score for a given value.
// The Z-score is a measure of how many standard deviations a value is from the mean.
const calculateZScore = (value, mean, stdDev) => {
  if (stdDev === 0) {
    throw new Error('Standard deviation cannot be zero.');
  }
  return (value - mean) / stdDev;
};

const filterOutliers = (listingsArray) => {
  // Use robust statistical methods instead of basic z-score
  let robustEstimators = null;

  // Try to get robust estimators from price discovery engine
  if (priceDiscoveryEngine && priceDiscoveryEngine.robustEstimators) {
    robustEstimators = priceDiscoveryEngine.robustEstimators;
  } else {
    // Create a temporary instance if price discovery engine isn't available yet
    try {
      robustEstimators = new RobustEstimators();
    } catch {
      // If we can't create robust estimators, fall back to original method
      robustEstimators = null;
    }
  }

  if (robustEstimators) {
    try {
      const prices = listingsArray.map((listing) =>
        Methods.toMetal(listing.currencies, keyobj.metal)
      );

      // Detect outliers using multiple robust methods
      const outliers = robustEstimators.detectRobustOutliers(prices);
      const outlierIndices = new Set(outliers.map((o) => o.index));

      // Filter out detected outliers
      const filteredListings = listingsArray.filter((_, index) => !outlierIndices.has(index));

      if (filteredListings.length < 3) {
        throw new Error('Not enough listings after robust outlier filtering.');
      }

      // Use adaptive robust mean instead of simple mean
      const filteredPrices = filteredListings.map((l) =>
        Methods.toMetal(l.currencies, keyobj.metal)
      );
      const robustResult = robustEstimators.calculateAdaptiveRobustMean(filteredPrices);

      console.log(
        `Robust filtering: ${outliers.length} outliers removed, method: ${robustResult.method}, confidence: ${robustResult.confidence.toFixed(2)}`
      );

      return robustResult.value;
    } catch (robustError) {
      console.warn(
        'Robust filtering failed, falling back to original method:',
        robustError.message
      );
      // Fall through to original method
    }
  }

  // Fallback to original method if robust estimators not available
  const prices = listingsArray.map((listing) => Methods.toMetal(listing.currencies, keyobj.metal));
  const mean = Methods.getRight(prices.reduce((acc, curr) => acc + curr, 0) / prices.length);
  const stdDev = Math.sqrt(
    prices.reduce((acc, curr) => acc + Math.pow(curr - mean, 2), 0) / prices.length
  );

  const filteredListings = listingsArray.filter((listing) => {
    const zScore = calculateZScore(Methods.toMetal(listing.currencies, keyobj.metal), mean, stdDev);
    return zScore <= 3 && zScore >= -3;
  });

  if (filteredListings.length < 3) {
    throw new Error('Not enough listings after filtering outliers.');
  }

  var filteredMean = 0;
  for (var i = 0; i <= 2; i++) {
    filteredMean += +Methods.toMetal(filteredListings[i].currencies, keyobj.metal);
  }
  filteredMean /= 3;

  if (!filteredMean || isNaN(filteredMean) || filteredMean === 0) {
    throw new Error('Mean calculated is invalid.');
  }

  return filteredMean;
};

async function isSellPriceOutlier(sku, candidateSellMetal, threshold = 3) {
  // Fetch last 10 sell prices from history
  const history = await db.any(
    'SELECT sell_metal FROM price_history WHERE sku = $1 ORDER BY timestamp DESC LIMIT 10',
    [sku]
  );
  if (history.length < 3) {
    return false;
  } // Not enough data to judge

  const prices = history.map((p) => Number(p.sell_metal));
  const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
  const stdDev = Math.sqrt(prices.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / prices.length);

  // If stddev is 0 (all prices the same), only allow exact match
  if (stdDev === 0) {
    return candidateSellMetal !== mean;
  }

  const zScore = (candidateSellMetal - mean) / stdDev;
  return Math.abs(zScore) > threshold;
}

const getAverages = async (name, buyFiltered, sellFiltered, sku, pricetfItem) => {
  // Enhanced pricing logic with advanced algorithms
  return await getEnhancedAverages(name, buyFiltered, sellFiltered, sku, pricetfItem);
};

const getEnhancedAverages = async (name, buyFiltered, sellFiltered, sku, pricetfItem) => {
  // Initialise two objects to contain the items final buy and sell prices.
  var final_buyObj = {
    keys: 0,
    metal: 0,
  };
  var final_sellObj = {
    keys: 0,
    metal: 0,
  };

  try {
    // Get historical price data for advanced analysis
    const priceHistory = await db.any(
      `SELECT buy_metal as value, 'buy' as side, timestamp FROM price_history 
       WHERE sku = $1 AND timestamp > $2
       UNION ALL
       SELECT sell_metal as value, 'sell' as side, timestamp FROM price_history 
       WHERE sku = $1 AND timestamp > $2
       ORDER BY timestamp DESC LIMIT 100`,
      [sku, Math.floor(Date.now() / 1000) - 7 * 24 * 3600] // Last 7 days
    );

    // Try enhanced pricing first
    try {
      // Use advanced price discovery engine for comprehensive analysis
      if (priceDiscoveryEngine && (buyFiltered.length > 0 || sellFiltered.length > 0)) {
        console.log(`Using advanced price discovery for ${name} (${sku})`);

        const discoveryResult = await priceDiscoveryEngine.discoverPrice(
          buyFiltered,
          sellFiltered,
          priceHistory,
          keyobj.metal,
          { sku, name }
        );

        if (discoveryResult.consensus && discoveryResult.confidence >= 0.6) {
          console.log(
            `Price discovery successful - Method consensus: ${discoveryResult.consensus.methodsUsed} methods, Confidence: ${discoveryResult.confidence.toFixed(2)}`
          );

          final_buyObj = Methods.fromMetal(discoveryResult.consensus.buyPrice, keyobj.metal);
          final_sellObj = Methods.fromMetal(discoveryResult.consensus.sellPrice, keyobj.metal);

          // Validate with price validator if available
          if (priceValidator) {
            const validation = priceValidator.validatePriceIntegrity({
              buyPrice: discoveryResult.consensus.buyPrice,
              sellPrice: discoveryResult.consensus.sellPrice,
              confidence: discoveryResult.confidence,
              spread: discoveryResult.consensus.sellPrice - discoveryResult.consensus.buyPrice,
              sampleSize: buyFiltered.length + sellFiltered.length,
              sku,
              name,
            });

            if (validation.valid && validation.confidence.grade !== 'F') {
              console.log(
                `Price discovery validation passed - Grade: ${validation.confidence.grade}`
              );
              return [final_buyObj, final_sellObj];
            } else {
              console.log(`Price discovery validation failed - ${validation.issues.join(', ')}`);
            }
          } else {
            return [final_buyObj, final_sellObj];
          }
        } else {
          console.log(
            `Price discovery confidence too low: ${discoveryResult.confidence.toFixed(2)}, falling back to tier system`
          );
        }
      }
      // Implement 4-tier pricing system
      const totalListings = buyFiltered.length + sellFiltered.length;
      const hasBuyData = buyFiltered.length >= 3;
      const hasSellData = sellFiltered.length >= 3;
      const hasAsymmetricData =
        (buyFiltered.length >= 5 && sellFiltered.length >= 1) ||
        (sellFiltered.length >= 5 && buyFiltered.length >= 1);
      const hasMinimalData = totalListings >= 2;

      // TIER 1: Ideal conditions (≥3 buy AND ≥3 sell) - Use full advanced analysis
      if (hasBuyData && hasSellData && advancedPricing) {
        console.log(`Tier 1 pricing for ${name} (${sku}) - Ideal conditions`);

        // Enhanced with competition analysis
        let competitionAnalysis = null;
        if (competitionAnalyzer) {
          competitionAnalysis = competitionAnalyzer.analyzeCompetition(
            buyFiltered,
            sellFiltered,
            config.trustedSteamIDs || [],
            config.excludedSteamIDs || []
          );
        }

        const estimationResult = await advancedPricing.estimatePrice(
          sku,
          buyFiltered,
          sellFiltered,
          priceHistory,
          { keyPrice: keyobj.metal }
        );

        // Apply profit optimization
        if (profitOptimizer && estimationResult.buyPrice && estimationResult.sellPrice) {
          const marketData = {
            buyCount: buyFiltered.length,
            sellCount: sellFiltered.length,
            spread: estimationResult.sellPrice - estimationResult.buyPrice,
          };

          const itemMetadata = {
            sku,
            quality: sku.split(';')[1],
            effect: sku.includes('u-') ? parseInt(sku.split('u-')[1]) : null,
            killstreak: sku.includes('kt-') ? parseInt(sku.split('kt-')[1]) : null,
            australium: sku.includes('australium'),
            festive: sku.includes('festive'),
          };

          const profitAnalysis = profitOptimizer.analyzeProfitPotential(
            marketData,
            priceHistory,
            (estimationResult.buyPrice + estimationResult.sellPrice) / 2,
            itemMetadata
          );

          if (profitAnalysis && profitAnalysis.margins.confidence > 0.6) {
            const optimizedPrices = profitOptimizer.applyOptimizedMargins(
              (estimationResult.buyPrice + estimationResult.sellPrice) / 2,
              profitAnalysis.margins
            );

            estimationResult.buyPrice = optimizedPrices.buy;
            estimationResult.sellPrice = optimizedPrices.sell;

            console.log(
              `Profit optimization applied - Potential daily profit: ${profitAnalysis.profit.estimatedDaily.toFixed(2)} refined`
            );
          }
        }

        // Apply competition-based adjustments
        if (competitionAnalysis && competitionAnalysis.recommendations) {
          const rec = competitionAnalysis.recommendations;

          if (rec.buyPrice && rec.buyPrice.suggested) {
            // Blend competition recommendation with our estimate
            const weight = Math.min(0.4, rec.confidence); // Max 40% weight to competition
            estimationResult.buyPrice =
              estimationResult.buyPrice * (1 - weight) + rec.buyPrice.suggested * weight;
          }

          if (rec.sellPrice && rec.sellPrice.suggested) {
            const weight = Math.min(0.3, rec.confidence); // Max 30% weight to competition
            estimationResult.sellPrice =
              estimationResult.sellPrice * (1 - weight) + rec.sellPrice.suggested * weight;
          }

          console.log(
            `Competition analysis applied - Strategy: ${rec.strategy}, Competitive advantage: ${competitionAnalysis.competitiveAdvantage.toFixed(2)}`
          );
        }

        // Use ML predictions to enhance the estimates
        if (mlPredictor && priceHistory.length >= 10) {
          const mlPrediction = await mlPredictor.predictPrice(sku, priceHistory);
          if (mlPrediction && mlPrediction.confidence > 0.5) {
            // Blend advanced pricing with ML prediction
            const weight = Math.min(mlPrediction.confidence, 0.7); // Cap ML influence
            estimationResult.buyPrice =
              estimationResult.buyPrice * (1 - weight) + mlPrediction.buyPrice * weight;
            estimationResult.sellPrice =
              estimationResult.sellPrice * (1 - weight) + mlPrediction.sellPrice * weight;
            console.log(
              `ML prediction blended with confidence ${mlPrediction.confidence.toFixed(2)}`
            );
          }

          // Use anomaly detection to filter out suspicious prices
          const anomalies = mlPredictor.detectAnomalies(priceHistory);
          if (anomalies.anomalies.length > priceHistory.length * 0.3) {
            console.log(`High anomaly rate detected for ${name}, applying conservative pricing`);
            estimationResult.confidence.confidence *= 0.8; // Reduce confidence
          }

          // Use momentum analysis for trend-aware adjustments
          const momentum = mlPredictor.calculateMomentum(priceHistory);
          if (momentum.rsi < 30) {
            // Oversold condition - slightly favor buy side
            estimationResult.buyPrice *= 0.98;
            console.log(`Oversold momentum detected for ${name}, favoring buy side`);
          } else if (momentum.rsi > 70) {
            // Overbought condition - slightly favor sell side
            estimationResult.sellPrice *= 1.02;
            console.log(`Overbought momentum detected for ${name}, favoring sell side`);
          }
        }

        if (
          estimationResult.buyPrice &&
          estimationResult.sellPrice &&
          estimationResult.confidence.confidence > 0.4
        ) {
          // Apply dynamic bounds
          if (dynamicBounds) {
            const bounds = dynamicBounds.calculateDynamicBounds(
              estimationResult.buyPrice,
              estimationResult.sellPrice,
              { priceHistory, buyListings: buyFiltered, sellListings: sellFiltered }
            );

            estimationResult.buyPrice = Math.max(estimationResult.buyPrice, bounds.minBuy);
            estimationResult.sellPrice = Math.min(estimationResult.sellPrice, bounds.maxSell);
          }

          final_buyObj = Methods.fromMetal(estimationResult.buyPrice, keyobj.metal);
          final_sellObj = Methods.fromMetal(estimationResult.sellPrice, keyobj.metal);

          const buyMetal = Methods.toMetal(final_buyObj, keyobj.metal);
          const sellMetal = Methods.toMetal(final_sellObj, keyobj.metal);

          if (buyMetal < sellMetal) {
            console.log(
              `Tier 1 success - Buy: ${estimationResult.buyPrice}, Sell: ${estimationResult.sellPrice}, Confidence: ${estimationResult.confidence.grade}`
            );
            return [final_buyObj, final_sellObj];
          }
        }
      }

      // TIER 2: Asymmetric conditions - Strong one side, weak other
      if (hasAsymmetricData && advancedPricing) {
        console.log(`Tier 2 pricing for ${name} (${sku}) - Asymmetric conditions`);

        try {
          // Use available pricing data with synthetic generation for missing side
          let buyPrice = null;
          let sellPrice = null;

          if (buyFiltered.length >= 3) {
            // Calculate strong buy side
            const buyVWAP = advancedPricing.calculateVWAP(
              buyFiltered.map((listing) => ({
                price: Methods.toMetal(listing.currencies, keyobj.metal),
                volume: 1, // Proxy volume
              }))
            );
            buyPrice = buyVWAP;
          }

          if (sellFiltered.length >= 3) {
            // Calculate strong sell side
            const sellVWAP = advancedPricing.calculateVWAP(
              sellFiltered.map((listing) => ({
                price: Methods.toMetal(listing.currencies, keyobj.metal),
                volume: 1, // Proxy volume
              }))
            );
            sellPrice = sellVWAP;
          }

          // Generate missing side using synthetic pricing
          if (buyPrice && !sellPrice && sellFiltered.length > 0) {
            // Use available sell data plus synthetic generation
            const availableSellPrice = Methods.toMetal(sellFiltered[0].currencies, keyobj.metal);
            const historicalSpread = Math.abs(buyPrice - availableSellPrice) / buyPrice;

            const syntheticResult = advancedPricing.generateSyntheticPrice(
              buyPrice,
              'sell',
              { historicalSpread: Math.max(0.1, historicalSpread) },
              0.6
            );
            sellPrice = syntheticResult.price;
          } else if (sellPrice && !buyPrice && buyFiltered.length > 0) {
            // Use available buy data plus synthetic generation
            const availableBuyPrice = Methods.toMetal(buyFiltered[0].currencies, keyobj.metal);
            const historicalSpread = Math.abs(sellPrice - availableBuyPrice) / sellPrice;

            const syntheticResult = advancedPricing.generateSyntheticPrice(
              sellPrice,
              'buy',
              { historicalSpread: Math.max(0.1, historicalSpread) },
              0.6
            );
            buyPrice = syntheticResult.price;
          }

          if (buyPrice && sellPrice && buyPrice < sellPrice) {
            final_buyObj = Methods.fromMetal(buyPrice, keyobj.metal);
            final_sellObj = Methods.fromMetal(sellPrice, keyobj.metal);

            console.log(
              `Tier 2 success - Asymmetric pricing, buy: ${buyPrice.toFixed(2)}, sell: ${sellPrice.toFixed(2)}`
            );
            return [final_buyObj, final_sellObj];
          }
        } catch (e) {
          console.log(`Tier 2 asymmetric pricing failed: ${e.message}`);
        }
      }

      // TIER 3: Historical/trend-based pricing for limited data
      if (hasMinimalData && mlPredictor && priceHistory.length >= 5) {
        console.log(`Tier 3 pricing for ${name} (${sku}) - Historical trend analysis`);

        try {
          const trendAnalysis = mlPredictor.linearRegression(
            priceHistory.map((p) => ({
              x: p.timestamp,
              y: p.value,
            }))
          );

          if (trendAnalysis && Math.abs(trendAnalysis.r2) > 0.3) {
            // Use trend to predict current prices
            const currentTime = Math.floor(Date.now() / 1000);
            let trendPrice = trendAnalysis.slope * currentTime + trendAnalysis.intercept;

            // Apply seasonal adjustments if enough data
            if (priceHistory.length >= 48) {
              // 48 hours for daily patterns
              const seasonal = mlPredictor.seasonalDecomposition(priceHistory, 24);
              if (seasonal.seasonal && seasonal.seasonal.length > 0) {
                const currentHour = new Date().getHours();
                const seasonalIndex = currentHour % seasonal.seasonal.length;
                const seasonalAdjustment = seasonal.seasonal[seasonalIndex] || 1;
                trendPrice *= seasonalAdjustment;
                console.log(
                  `Applied seasonal adjustment for hour ${currentHour}: ${seasonalAdjustment.toFixed(3)}`
                );
              }
            }

            // Apply conservative margins for trend-based pricing
            const margin = 0.15; // 15% margin
            const buyPrice = trendPrice * (1 - margin);
            const sellPrice = trendPrice * (1 + margin);

            final_buyObj = Methods.fromMetal(buyPrice, keyobj.metal);
            final_sellObj = Methods.fromMetal(sellPrice, keyobj.metal);

            console.log(`Tier 3 success - Trend-based pricing, R²: ${trendAnalysis.r2.toFixed(3)}`);
            return [final_buyObj, final_sellObj];
          }
        } catch (e) {
          console.log(`Tier 3 trend analysis failed: ${e.message}`);
        }
      }

      // TIER 4: Minimum viable pricing - Use any available data with synthetic generation
      if (hasMinimalData) {
        console.log(`Tier 4 pricing for ${name} (${sku}) - Minimum viable data`);

        // Use whatever data we have and generate missing prices
        let buyPrice = null;
        let sellPrice = null;

        if (buyFiltered.length > 0) {
          // Calculate average of available buy listings
          const totalMetal = buyFiltered
            .slice(0, Math.min(3, buyFiltered.length))
            .reduce((sum, listing) => sum + Methods.toMetal(listing.currencies, keyobj.metal), 0);
          buyPrice = totalMetal / Math.min(3, buyFiltered.length);
        }

        if (sellFiltered.length > 0) {
          // Use lowest sell price
          sellPrice = Methods.toMetal(sellFiltered[0].currencies, keyobj.metal);
        }

        // Generate missing prices
        if (!buyPrice && sellPrice) {
          buyPrice = sellPrice * 0.85; // 15% below sell price
        } else if (buyPrice && !sellPrice) {
          sellPrice = buyPrice * 1.18; // 18% above buy price
        } else if (!buyPrice && !sellPrice) {
          // Use historical data if available
          if (priceHistory.length > 0) {
            const avgHistorical =
              priceHistory.slice(0, 10).reduce((sum, p) => sum + p.value, 0) /
              Math.min(10, priceHistory.length);
            buyPrice = avgHistorical * 0.92;
            sellPrice = avgHistorical * 1.08;
          } else {
            throw new Error(`Insufficient data for pricing ${name}`);
          }
        }

        final_buyObj = Methods.fromMetal(buyPrice, keyobj.metal);
        final_sellObj = Methods.fromMetal(sellPrice, keyobj.metal);

        console.log(`Tier 4 success - Minimum viable pricing used`);
        return [final_buyObj, final_sellObj];
      }
    } catch (enhancedError) {
      console.log(`Enhanced pricing failed for ${name}: ${enhancedError.message}`);
    }

    // Traditional pricing method fallback
    if (buyFiltered.length < 3) {
      throw new Error(`| UPDATING PRICES |: ${name} not enough buy listings...`);
    } else if (buyFiltered.length > 3 && buyFiltered.length < 10) {
      // For keys (5021;6), we need to handle the averaging differently
      if (sku === '5021;6') {
        // Convert each listing to pure metal first, then average
        let totalMetal = 0;
        for (let i = 0; i <= 2; i++) {
          totalMetal += Methods.toMetal(buyFiltered[i].currencies, keyobj.metal);
        }
        final_buyObj = {
          keys: 0,
          metal: totalMetal / 3,
        };
        console.log(`DEBUG: Key buy price (3-9 listings) - keys: 0, metal: ${totalMetal / 3}`);
      } else {
        // For other items, average keys and metal separately
        var totalValue = {
          keys: 0,
          metal: 0,
        };
        // If there are more than 3 buy listings, we take the first 3 and calculate the mean average price.
        for (let i = 0; i <= 2; i++) {
          // If the keys or metal value is undefined, we set it to 0.
          totalValue.keys += Object.is(buyFiltered[i].currencies.keys, undefined)
            ? 0
            : buyFiltered[i].currencies.keys;
          // If the metal value is undefined, we set it to 0.
          totalValue.metal += Object.is(buyFiltered[i].currencies.metal, undefined)
            ? 0
            : buyFiltered[i].currencies.metal;
        }
        final_buyObj = {
          keys: Math.trunc(totalValue.keys / 3),
          metal: totalValue.metal / 3,
        };
      }
    } else {
      // Enhanced traditional method - use robust estimation when possible
      if (priceDiscoveryEngine && priceDiscoveryEngine.robustEstimators) {
        const robustEstimators = priceDiscoveryEngine.robustEstimators;
        const filteredPrices = buyFiltered.map((l) => Methods.toMetal(l.currencies, keyobj.metal));
        const robustResult = robustEstimators.calculateAdaptiveRobustMean(filteredPrices);

        console.log(
          `Using robust estimation: method=${robustResult.method}, confidence=${robustResult.confidence.toFixed(2)}`
        );

        // For keys (5021;6), keep the price as pure metal
        if (sku === '5021;6') {
          final_buyObj = {
            keys: 0,
            metal: robustResult.value,
          };
        } else {
          final_buyObj = Methods.fromMetal(robustResult.value, keyobj.metal);
        }
      } else {
        // Original fallback method
        let filteredMean = filterOutliers(buyFiltered);

        // For keys (5021;6), keep the price as pure metal (keys: 0, metal: filteredMean)
        // For other items, convert to key+metal format
        if (sku === '5021;6') {
          final_buyObj = {
            keys: 0,
            metal: filteredMean,
          };
          console.log(`DEBUG: Key buy price (>=10 listings) - keys: 0, metal: ${filteredMean}`);
        } else {
          // Calculate the maximum amount of keys that can be made with the metal value returned.
          let keys = Math.trunc(filteredMean / keyobj.metal);
          // Calculate the remaining metal value after the value of the keys has been removed.
          let metal = Methods.getRight(filteredMean - keys * keyobj.metal);
          // Create the final buy object.
          final_buyObj = {
            keys: keys,
            metal: metal,
          };
        }
      }
    }
    // Decided to pick the very first sell listing as it's ordered by the lowest sell price. I.e., the most competitive.
    // However, I decided to prioritise 'trusted' listings by certain steam ids. This may result in a very high sell price, instead
    // of a competitive one.
    if (sellFiltered.length > 0) {
      // Try trusted listings first, but skip if they're outliers
      let picked = null;
      for (let i = 0; i < sellFiltered.length; i++) {
        const candidate = sellFiltered[i];
        const candidateMetal = Methods.toMetal(candidate.currencies, keyobj.metal);
        // Await the outlier check
        if (!(await isSellPriceOutlier(sku, candidateMetal))) {
          picked = candidate;
          break;
        }
      }
      // If all are outliers, fallback to the lowest price anyway (to avoid not pricing at all)
      if (!picked) {
        picked = sellFiltered[0];
      }

      // For keys, the listing currencies should already be in pure metal format (keys: 0, metal: X)
      // For other items, this preserves the key+metal format from the listing
      final_sellObj.keys = Object.is(picked.currencies.keys, undefined)
        ? 0
        : picked.currencies.keys;
      final_sellObj.metal = Object.is(picked.currencies.metal, undefined)
        ? 0
        : picked.currencies.metal;

      if (sku === '5021;6') {
        console.log(
          `DEBUG: Key sell price from picked listing - keys: ${final_sellObj.keys}, metal: ${final_sellObj.metal}`
        );
      }
    } else {
      throw new Error(`| UPDATING PRICES |: ${name} not enough sell listings...`);
    }

    var usePrices = false;
    try {
      // Will return true or false. True if we are ok with the autopricers price, false if we are not.
      // We use prices.tf as a baseline.
      usePrices = Methods.calculatePricingAPIDifferences(
        pricetfItem,
        final_buyObj,
        final_sellObj,
        keyobj
      );
    } catch (e) {
      // Create an error object with a message detailing this difference.
      throw new Error(`| UPDATING PRICES |: Our autopricer determined that name ${name} should sell for : ${final_sellObj.keys} keys and 
            ${final_sellObj.metal} ref, and buy for ${final_buyObj.keys} keys and ${final_buyObj.metal} ref. Baseline
            determined I should sell for ${pricetfItem.sell.keys} keys and ${pricetfItem.sell.metal} ref, and buy for
            ${pricetfItem.buy.keys} keys and ${pricetfItem.buy.metal} ref. Message returned by the method: ${e.message}`);
    }

    // if-else statement probably isn't needed, but I'm just being cautious.
    if (usePrices) {
      // The final averages are returned here. But work is still needed to be done. We can't assume that the buy average is
      // going to be lower than the sell average price. So we need to check for this later.
      if (sku === '5021;6') {
        console.log(
          `DEBUG: Key final prices from getAverages - buy: {keys: ${final_buyObj.keys}, metal: ${final_buyObj.metal}}, sell: {keys: ${final_sellObj.keys}, metal: ${final_sellObj.metal}}`
        );
      }
      return [final_buyObj, final_sellObj];
    } else {
      throw new Error(`| UPDATING PRICES |: ${name} pricing average generated by autopricer is too dramatically
            different to one returned by bptf`);
    }
  } catch (error) {
    // If configured, we fallback onto bptf for the price.
    if (fallbackOntoPricesTf) {
      const final_buyObj = {
        keys: pricetfItem.buy.keys,
        metal: pricetfItem.buy.metal,
      };
      const final_sellObj = {
        keys: pricetfItem.sell.keys,
        metal: pricetfItem.sell.metal,
      };
      if (sku === '5021;6') {
        console.log(
          `DEBUG: Key fallback prices from bptf - buy: {keys: ${final_buyObj.keys}, metal: ${final_buyObj.metal}}, sell: {keys: ${final_sellObj.keys}, metal: ${final_sellObj.metal}}`
        );
      }
      return [final_buyObj, final_sellObj];
    } else {
      // We re-throw the error.
      throw error;
    }
  }
};

function clamp(val, min, max) {
  // If min is not a number, we don't clamp the value.
  // If max is not a number, we don't clamp the value.
  if (typeof min === 'number' && val < min) {
    return min;
  }
  if (typeof max === 'number' && val > max) {
    return max;
  }
  return val;
}

const finalisePrice = async (arr, name, sku) => {
  let item = {};
  try {
    if (!arr) {
      console.log(
        `| UPDATING PRICES |:${name} couldn't be updated. CRITICAL, something went wrong in the getAverages logic.`
      );
      throw new Error('Something went wrong in the getAverages() logic. DEVELOPER LOOK AT THIS.');
      // Will ensure that neither the buy, nor sell side is completely unpriced. If it is, this means we couldn't get
      // enough listings to create a price, and we also somehow bypassed our prices.tf safety check. So instead, we
      // just skip this item, disregarding the price.
    } else if (
      (arr[0].metal === 0 && arr[0].keys === 0) ||
      (arr[1].metal === 0 && arr[1].keys === 0)
    ) {
      throw new Error('Missing buy and/or sell side.');
    } else {
      // Creating item fields/filling in details.
      // Name of the item. Left as it was.
      item.name = name;
      // Add sku to item object.
      item.sku = sku;
      // If the source isn't provided as bptf it's ignored by tf2autobot.
      item.source = 'bptf';
      // Generates a UNIX timestamp of the present time, used to show a client when the prices were last updated.
      item.time = Math.floor(Date.now() / 1000);

      // We're taking the buy JSON and getting the metal price from it, then rounding down to the nearest .11.
      arr[0].metal = Methods.getRight(arr[0].metal);
      // We're taking the sell JSON and getting the metal price from it, then rounding down to the nearest .11.
      arr[1].metal = Methods.getRight(arr[1].metal);

      // Apply dynamic bounds if available
      if (dynamicBounds) {
        try {
          const priceHistory = await db.any(
            'SELECT sell_metal as value, timestamp FROM price_history WHERE sku = $1 ORDER BY timestamp DESC LIMIT 50',
            [sku]
          );

          const listingStats = await db.oneOrNone(
            'SELECT current_buy_count, current_sell_count FROM listing_stats WHERE sku = $1',
            [sku]
          );

          const basePrice =
            (Methods.toMetal(arr[0], keyobj.metal) + Methods.toMetal(arr[1], keyobj.metal)) / 2;

          const boundsParams = {
            sku,
            priceHistory: priceHistory.map((p) => ({ value: p.value, timestamp: p.timestamp })),
            buyCount: listingStats?.current_buy_count || 0,
            sellCount: listingStats?.current_sell_count || 0,
            basePrice,
          };

          const bounds = dynamicBounds.calculateDynamicBounds(boundsParams);

          // Apply bounds to final prices
          const buyMetal = Methods.toMetal(arr[0], keyobj.metal);
          const sellMetal = Methods.toMetal(arr[1], keyobj.metal);

          // Clamp within calculated bounds
          const clampedBuyMetal = Math.max(bounds.buy.min, Math.min(bounds.buy.max, buyMetal));
          const clampedSellMetal = Math.max(bounds.sell.min, Math.min(bounds.sell.max, sellMetal));

          if (clampedBuyMetal !== buyMetal || clampedSellMetal !== sellMetal) {
            console.log(
              `Dynamic bounds applied to ${name}: Buy ${buyMetal} -> ${clampedBuyMetal}, Sell ${sellMetal} -> ${clampedSellMetal}`
            );
            arr[0] = Methods.fromMetal(clampedBuyMetal, keyobj.metal);
            arr[1] = Methods.fromMetal(clampedSellMetal, keyobj.metal);

            // Re-apply rounding after bounds adjustment
            arr[0].metal = Methods.getRight(arr[0].metal);
            arr[1].metal = Methods.getRight(arr[1].metal);
          }

          // Log bounds info if low confidence
          if (bounds.confidence < 0.6) {
            console.log(
              `Low confidence bounds for ${name} (${bounds.confidence.toFixed(2)}). Data quality: ${bounds.metadata.dataQuality}`
            );
          }
        } catch (boundsError) {
          console.warn(`Dynamic bounds calculation failed for ${name}: ${boundsError.message}`);
        }
      }

      // We are taking the buy array price as a whole, and also passing in the current selling price
      // for a key into the parsePrice method.
      // We are taking the sell array price as a whole, and also passing in the current selling price
      // for a key into the parsePrice method.
      // Skip parsePrice for keys - they should always be in pure metal format
      if (sku !== '5021;6') {
        arr[0] = Methods.parsePrice(arr[0], keyobj.metal);
        arr[1] = Methods.parsePrice(arr[1], keyobj.metal);
      }

      // Clamp prices to bounds if set
      const bounds = getItemBounds().get(name) || {};
      // Clamp the buy and sell prices to the bounds set in the config.
      // If the bounds are not set, it will just use the default values of 0 and Infinity.
      arr[0].keys = clamp(arr[0].keys, bounds.minBuyKeys, bounds.maxBuyKeys);
      arr[0].metal = clamp(arr[0].metal, bounds.minBuyMetal, bounds.maxBuyMetal);
      arr[1].keys = clamp(arr[1].keys, bounds.minSellKeys, bounds.maxSellKeys);
      arr[1].metal = clamp(arr[1].metal, bounds.minSellMetal, bounds.maxSellMetal);

      // Enforce minSellMargin from config
      const minSellMargin = config.minSellMargin ?? 0.11;
      var buyInMetal = Methods.toMetal(arr[0], keyobj.metal);
      var sellInMetal = Methods.toMetal(arr[1], keyobj.metal);

      if (buyInMetal >= sellInMetal) {
        // For keys, always use pure metal format
        if (sku === '5021;6') {
          item.buy = {
            keys: 0,
            metal: Methods.getRight(arr[0].metal),
          };
          item.sell = {
            keys: 0,
            metal: Methods.getRight(arr[0].metal + minSellMargin),
          };
        } else {
          item.buy = {
            keys: arr[0].keys,
            metal: Methods.getRight(arr[0].metal),
          };
          item.sell = {
            keys: arr[0].keys,
            metal: Methods.getRight(arr[0].metal + minSellMargin),
          };
        }
      } else {
        // For keys, always use pure metal format
        if (sku === '5021;6') {
          item.buy = {
            keys: 0,
            metal: Methods.getRight(arr[0].metal),
          };
          item.sell = {
            keys: 0,
            metal: Methods.getRight(arr[1].metal),
          };
        } else {
          item.buy = {
            keys: arr[0].keys,
            metal: Methods.getRight(arr[0].metal),
          };
          item.sell = {
            keys: arr[1].keys,
            metal: Methods.getRight(arr[1].metal),
          };
        }
      }

      // Load previous price from pricelist if available
      const pricelist = JSON.parse(fs.readFileSync(PRICELIST_PATH, 'utf8'));
      const prev = pricelist.items.find((i) => i.sku === sku);

      // Only check if previous price exists (skip price swing check for keys)
      if (prev && sku !== '5021;6') {
        const prevObj = { buy: prev.buy, sell: prev.sell };
        const nextObj = { buy: item.buy, sell: item.sell };
        const swingOk = await isPriceSwingAcceptable(prevObj, nextObj, sku);
        if (!swingOk) {
          console.log(`Price swing too large for ${name} (${sku}), skipping update.`);
          return;
        }
      }

      // Save to price history
      const priceData = {
        sku,
        buy: Methods.toMetal(item.buy, keyobj.metal),
        sell: Methods.toMetal(item.sell, keyobj.metal),
      };

      // Use price validator if available
      if (priceValidator) {
        try {
          const validationResult = await priceValidator.validatePriceIntegrity(item, {
            sku,
            name,
            keyPrice: keyobj.metal,
            priceHistory: await db.any(
              'SELECT sell_metal as value, timestamp FROM price_history WHERE sku = $1 ORDER BY timestamp DESC LIMIT 50',
              [sku]
            ),
          });

          if (validationResult.isValid) {
            console.log(
              `Price validation passed for ${name} - Confidence: ${validationResult.confidence}, Grade: ${validationResult.grade}`
            );

            // Log any recommendations
            if (validationResult.recommendations && validationResult.recommendations.length > 0) {
              console.log(
                `Recommendations for ${name}: ${validationResult.recommendations.join(', ')}`
              );
            }
          } else {
            console.warn(
              `Price validation failed for ${name}: ${validationResult.reasons.join(', ')}`
            );

            // For critical validation failures, we might want to skip pricing
            if (validationResult.confidence < 0.3) {
              console.warn(`Critical validation failure for ${name}, skipping pricing update`);
              return;
            }
          }
        } catch (validationError) {
          console.warn(`Price validation error for ${name}: ${validationError.message}`);
        }
      }

      return {
        item,
        priceHistory: priceData,
      };
    }
  } catch {
    // If the autopricer failed to price the item, we don't update the items price.
    return;
  }
};

// Initialize the websocket and pass in dependencies
const bptfWebSocket = initBptfWebSocket({
  getAllowedItemNames,
  allowAllItems,
  schemaManager,
  Methods,
  onListingUpdate: (sku) => updatedSkus.add(sku),
  insertListing: (...args) => insertListing(db, updateListingStats, ...args),
  insertListingsBatch: (listings) => insertListingsBatch(pgp, db, updateListingStats, listings),
  deleteRemovedListing: (...args) => deleteRemovedListing(db, updateListingStats, ...args),
  excludedSteamIds,
  excludedListingDescriptions,
  blockedAttributes,
  logFile,
});

// Provide websocket stats to the API
setWebSocketStatsProvider(() => bptfWebSocket.getStats());

// Add websocket health monitoring to the periodic tasks
setInterval(() => {
  const stats = bptfWebSocket.getStats();
  const timeSinceLastMessage = Math.round(stats.timeSinceLastMessage / 1000);

  if (timeSinceLastMessage > 300) {
    // 5 minutes
    console.warn(`[HEALTH] WebSocket hasn't received messages for ${timeSinceLastMessage}s`);
  }

  // Log periodic health status
  console.log(
    `[HEALTH] WebSocket: ${stats.messageCount} messages, last ${timeSinceLastMessage}s ago, connected: ${stats.isConnected}`
  );
}, 60000); // Check every minute

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing websocket...');
  bptfWebSocket.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, closing websocket...');
  bptfWebSocket.close();
  process.exit(0);
});

listen();

const { getSCMPriceObject, toMarketHashName } = require('./modules/scmPriceCalculator');

module.exports = { db };

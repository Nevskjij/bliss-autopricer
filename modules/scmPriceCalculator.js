const Methods = require('../methods');
const { getSCMPrice, getSCMKeyPrice } = require('./steamMarketFetcher');
const EFFECTS = require('./unusualEffects');
const methods = new Methods();

function getEffectName(effectId) {
  return EFFECTS[effectId] || `Effect ${effectId}`;
}

/**
 * Converts a SKU or item name to a Steam Market hash name.
 * This is a placeholder; you may want to improve this for unusuals, skins, etc.
 * @param {string} name - The item name.
 * @param nameOrSku
 * @param schema
 * @returns {string} - The market hash name.
 */
function toMarketHashName(nameOrSku, schema) {
  if (nameOrSku.includes(';')) {
    const skuObj = parseSku(nameOrSku);
    return skuToMarketHashName(skuObj, schema);
  }
  return nameOrSku;
}

/**
 * Gets a price object for an item using SCM prices with dynamic margins.
 * @param {object} opts
 * @param {string} opts.name - The item name (market hash name).
 * @param {string} [opts.sku] - The SKU (optional, for future use).
 * @param {number} opts.keyMetal - The current key price in metal.
 * @param {string} [opts.currency] - The currency code (default: 'USD').
 * @param {number} [opts.scmMarginBuy] - Optional buy margin (default: 0).
 * @param {number} [opts.scmMarginSell] - Optional sell margin (default: 0).
 * @param {object} [opts.marketData] - Optional market data for dynamic margins.
 * @returns {Promise<{buy: {keys: number, metal: number}, sell: {keys: number, metal: number}}|null>}
 */
async function getSCMPriceObject({
  name,
  keyMetal,
  currency = 'USD',
  scmMarginBuy = 0,
  scmMarginSell = 0,
  marketData = null,
}) {
  const marketHashName = toMarketHashName(name);
  const [itemSCM, keySCM] = await Promise.all([
    getSCMPrice(marketHashName, currency),
    getSCMKeyPrice(currency),
  ]);
  if (!itemSCM || !keySCM || keySCM === 0) {
    return null;
  }

  let priceInKeys = itemSCM / keySCM;
  let priceInMetal = priceInKeys * keyMetal;

  // Apply dynamic margins if market data is available
  let buyMargin = scmMarginBuy;
  let sellMargin = scmMarginSell;

  if (marketData) {
    const dynamicMargins = calculateDynamicSCMMargins(marketData, priceInMetal);
    buyMargin = Math.max(scmMarginBuy, dynamicMargins.buyMargin);
    sellMargin = Math.max(scmMarginSell, dynamicMargins.sellMargin);
  }

  // Apply margin
  let buyMetal = priceInMetal * (1 - buyMargin);
  let sellMetal = priceInMetal * (1 + sellMargin);

  // Always round to nearest scrap using getRight
  buyMetal = methods.getRight(buyMetal);
  sellMetal = methods.getRight(sellMetal);

  return {
    buy: { keys: 0, metal: buyMetal },
    sell: { keys: 0, metal: sellMetal },
    margins: { buy: buyMargin, sell: sellMargin },
    scmData: { usdPrice: itemSCM, keyPrice: keySCM },
  };
}

/**
 * Calculate dynamic SCM margins based on market conditions
 * @param {object} marketData - Market data including liquidity, volatility
 * @param {number} priceInMetal - Current price in refined metal
 * @returns {object} - Dynamic buy and sell margins
 */
function calculateDynamicSCMMargins(marketData, priceInMetal) {
  let buyMargin = 0.08; // Base 8% buy margin
  let sellMargin = 0.12; // Base 12% sell margin

  // Price-based adjustments
  if (priceInMetal > 50) {
    // High-value items need higher margins
    buyMargin += 0.03;
    sellMargin += 0.05;
  } else if (priceInMetal < 5) {
    // Low-value items can have tighter margins
    buyMargin -= 0.02;
    sellMargin -= 0.03;
  }

  // Liquidity adjustments
  const totalListings = (marketData.buyCount || 0) + (marketData.sellCount || 0);
  if (totalListings < 5) {
    // Low liquidity - increase margins
    buyMargin += 0.05;
    sellMargin += 0.08;
  } else if (totalListings > 20) {
    // High liquidity - can be more aggressive
    buyMargin -= 0.02;
    sellMargin -= 0.03;
  }

  // Volatility adjustments
  if (marketData.volatility && marketData.volatility > 0.3) {
    // High volatility - increase margins for safety
    buyMargin += 0.04;
    sellMargin += 0.06;
  }

  // Ensure margins stay within reasonable bounds
  buyMargin = Math.max(0.02, Math.min(buyMargin, 0.2)); // 2% - 20%
  sellMargin = Math.max(0.05, Math.min(sellMargin, 0.3)); // 5% - 30%

  return { buyMargin, sellMargin };
}

/**
 * Parses a SKU string into its components.
 * @param {string} sku
 * @returns {object}
 */
function parseSku(sku) {
  // Example SKU: 5021;6;kt-3;u-3001;australium;festive
  const parts = sku.split(';');
  const out = { defindex: parts[0], quality: parts[1] };
  for (let i = 2; i < parts.length; i++) {
    if (parts[i].startsWith('kt-')) {
      out.killstreak = parseInt(parts[i].slice(3));
    } else if (parts[i].startsWith('u-')) {
      out.effect = parseInt(parts[i].slice(2));
    } else if (parts[i] === 'australium') {
      out.australium = true;
    } else if (parts[i] === 'festive') {
      out.festivized = true;
    }
    // Add more as needed (paint, wear, etc)
  }
  return out;
}

/**
 * Converts a parsed SKU to a Steam Market hash name.
 * @param {object} skuObj - Output of parseSku
 * @param {object} [schema] - Optional TF2 schema for defindex->name
 * @returns {string}
 */
function skuToMarketHashName(skuObj, schema) {
  // This is a simplified version. For full accuracy, use the schema for defindex->name.
  let name = `Item ${skuObj.defindex}`;
  if (schema && schema.getItemBySKU) {
    // Reconstruct a minimal SKU for lookup
    const minimalSku = `${skuObj.defindex};${skuObj.quality}`;
    const item = schema.getItemBySKU(minimalSku);
    if (item && item.item_name) {
      name = item.item_name;
    }
  }
  // Quality
  if (skuObj.quality === '1') {
    name = `Genuine ${name}`;
  } else if (skuObj.quality === '3') {
    name = `Vintage ${name}`;
  } else if (skuObj.quality === '5') {
    name = `Unusual ${name}`;
  } else if (skuObj.quality === '11') {
    name = `Strange ${name}`;
  } else if (skuObj.quality === '13') {
    name = `Haunted ${name}`;
  } else if (skuObj.quality === '14') {
    name = `Collector's ${name}`;
  }
  // Note: Quality 6 (Unique) and 0 (Normal) don't get prefixes
  // Killstreak
  if (skuObj.killstreak === 1) {
    name = `Killstreak ${name}`;
  } else if (skuObj.killstreak === 2) {
    name = `Specialized Killstreak ${name}`;
  } else if (skuObj.killstreak === 3) {
    name = `Professional Killstreak ${name}`;
  }
  // Australium
  if (skuObj.australium) {
    name = `Australium ${name}`;
  }
  // Festivized
  if (skuObj.festivized) {
    name = `Festivized ${name}`;
  }
  // Unusual effect (SCM: "Unusual Effect Name Item Name")
  if (skuObj.effect) {
    name = `${getEffectName(skuObj.effect)} ${name}`;
  }
  // TODO: handle skins, wear, paint, etc.
  return name;
}

module.exports = {
  getSCMPriceObject,
  toMarketHashName,
};

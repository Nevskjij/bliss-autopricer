const fetch = require('node-fetch');

/**
 * Fetches the lowest Steam Community Market price for a given item.
 * @param {string} marketHashName - The market hash name of the item.
 * @param {string} currency - The currency code (default: 'USD').
 * @returns {Promise<number|null>} - The lowest price in the given currency, or null if unavailable.
 */
async function getSCMPrice(marketHashName, currency = 'USD') {
  // Steam currency codes: 1 = USD, 3 = EUR, etc.
  // See https://wiki.teamfortress.com/wiki/Steam_Web_API#GetAssetPrices_.28v1.29
  const currencyMap = { USD: 1, EUR: 3, GBP: 2 };
  const currencyId = currencyMap[currency] || 1;
  const url = `https://steamcommunity.com/market/priceoverview/?appid=440&currency=${currencyId}&market_hash_name=${encodeURIComponent(marketHashName)}`;
  try {
    const res = await fetch(url, { timeout: 5000 });
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    if (!data.success || !data.lowest_price) {
      return null;
    }
    // Remove currency symbol and commas, convert to float
    const priceStr = data.lowest_price.replace(/[^\d.,]/g, '').replace(',', '.');
    const price = parseFloat(priceStr);
    return isNaN(price) ? null : price;
  } catch (err) {
    return null;
  }
}

/**
 * Fetches the lowest SCM price for a Mann Co. Supply Crate Key.
 * @param {string} currency - The currency code (default: 'USD').
 * @returns {Promise<number|null>} - The lowest key price in the given currency, or null if unavailable.
 */
async function getSCMKeyPrice(currency = 'USD') {
  return getSCMPrice('Mann Co. Supply Crate Key', currency);
}

module.exports = { getSCMPrice, getSCMKeyPrice };

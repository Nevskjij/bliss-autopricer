const ReconnectingWebSocket = require('reconnecting-websocket');
const ws = require('ws');
const fs = require('fs');
const path = require('path');

function logWebSocketEvent(logFile, message) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`);
}

function initBptfWebSocket({
  getAllowedItemNames,
  schemaManager,
  Methods,
  insertListing,
  deleteRemovedListing,
  excludedSteamIds,
  excludedListingDescriptions,
  blockedAttributes,
  logFile,
}) {
  const rws = new ReconnectingWebSocket(
    'wss://ws.backpack.tf/events/',
    undefined,
    {
      WebSocket: ws,
      headers: {
        'batch-test': true,
      },
    },
  );

  function handleEvent(e) {
    if (!e.payload || !e.payload.item || !e.payload.item.name) {
      // Optionally log ignored events for debugging:
      console.log('[WebSocket] Ignored event:', e);
      return;
    }
    if (getAllowedItemNames().has(e.payload.item.name)) {
      let response_item = e.payload.item;
      let steamid = e.payload.steamid;
      let intent = e.payload.intent;
      switch (e.event) {
        case 'listing-update':
          console.log(
            '[WebSocket] Recieved a socket listing update for : ' +
              response_item.name,
          );

          let currencies = e.payload.currencies;
          let listingDetails = e.payload.details;
          let listingItemObject = e.payload.item;

          if (!e.payload.userAgent) {
            return;
          }
          if (!Methods.validateObject(currencies)) {
            return;
          }

          if (
            listingItemObject.attributes &&
            listingItemObject.attributes.some((attribute) => {
              return (
                typeof attribute === 'object' &&
                attribute.float_value &&
                Object.values(blockedAttributes)
                  .map(String)
                  .includes(String(attribute.float_value)) &&
                !Object.keys(blockedAttributes).some((key) =>
                  response_item.name.includes(key),
                )
              );
            })
          ) {
            return;
          }

          currencies = Methods.createCurrencyObject(currencies);

          if (!excludedSteamIds.some((id) => steamid === id)) {
            if (
              listingDetails &&
              !excludedListingDescriptions.some((detail) =>
                new RegExp(`\\b${detail}\\b`, 'i').test(
                  listingDetails.normalize('NFKD').toLowerCase().trim(),
                ),
              )
            ) {
              try {
                var sku = schemaManager.schema.getSkuFromName(
                  response_item.name,
                );
                if (sku === null || sku === undefined) {
                  throw new Error(
                    `| UPDATING PRICES |: Couldn't price ${response_item.name}. Issue with retrieving this items defindex.`,
                  );
                }
                insertListing(response_item, sku, currencies, intent, steamid);
              } catch (e) {
                console.log(e);
                console.log(
                  'Couldn\'t create a price for ' + response_item.name,
                );
              }
            }
          }
          break;
        case 'listing-delete':
          console.log(
            '[WebSocket] Recieved a socket listing delete for : ' +
              response_item.name,
          );

          try {
            deleteRemovedListing(steamid, response_item.name, intent);
          } catch (e) {
            return;
          }
          break;
      }
    }
  }

  rws.addEventListener('open', (event) => {
    const msg = '[WebSocket] Connected to bptf socket.';
    console.log(msg);
    logWebSocketEvent(logFile, msg);
  });

  rws.addEventListener('close', (event) => {
    const msg = `[WebSocket] bptf Socket connection closed. ${event.reason || ''}`;
    console.warn(msg);
    logWebSocketEvent(logFile, msg);
  });

  rws.addEventListener('error', (event) => {
    const msg = `[WebSocket] bptf Socket encountered an error: ${event.message || event}`;
    console.error(msg);
    logWebSocketEvent(logFile, msg);
  });

  rws.addEventListener('message', (event) => {
    var json = JSON.parse(event.data);
    if (json instanceof Array) {
      let updateCount = 0;
      let deleteCount = 0;
      json.forEach((ev) => {
        if (ev.event === 'listing-update') {
          updateCount++;
        } else if (ev.event === 'listing-delete') {
          deleteCount++;
        }
      });
      console.log(
        `[WebSocket] Received batch: ${json.length} events (${updateCount} updates, ${deleteCount} deletions)`,
      );
      json.forEach(handleEvent);
    } else {
      console.log('[WebSocket] Received single bptf event');
      handleEvent(json);
    }
  });

  return rws;
}

module.exports = { initBptfWebSocket };

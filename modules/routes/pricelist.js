const path = require('path');
const express = require('express');
const { loadJson } = require('../utils');
const renderPage = require('../layout');

module.exports = function (app, config, configManager) {
  const router = express.Router();
  const thresholdSec = config.ageThresholdSec;

  // Helper function to get current bot paths
  function getBotPaths() {
    const selectedBot = configManager.getSelectedBot();
    if (!selectedBot) {
      throw new Error('No bot selected. Please configure a bot first.');
    }

    // Use the pre-calculated pricelistPath if available, otherwise construct it
    let sellingPricelistPath;
    if (selectedBot.pricelistPath) {
      sellingPricelistPath = selectedBot.pricelistPath;
    } else {
      const tf2autobotPath = selectedBot.tf2autobotPath || selectedBot.tf2AutobotDir;
      const botDirectory = selectedBot.botDirectory || selectedBot.botTradingDir;

      if (!tf2autobotPath || !botDirectory) {
        throw new Error(
          `Missing bot path configuration. tf2autobotPath: ${tf2autobotPath}, botDirectory: ${botDirectory}`
        );
      }

      sellingPricelistPath = path.resolve(tf2autobotPath, botDirectory, 'pricelist.json');
    }

    return {
      pricelistPath: path.resolve(__dirname, '../../files/pricelist.json'),
      sellingPricelistPath,
      itemListPath: path.resolve(__dirname, '../../files/item_list.json'),
    };
  }

  function buildTable(items, showAge, sell) {
    items.sort((a, b) => a.name.localeCompare(b.name));

    let tbl =
      '<table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">';
    tbl += '<thead style="background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);">';
    tbl += '<tr>';
    tbl +=
      '<th style="padding: 15px 12px; text-align: left; border-bottom: 2px solid #dee2e6; font-weight: 600; font-size: 14px; color: #495057;">Item Name</th>';
    tbl +=
      '<th style="padding: 15px 12px; text-align: left; border-bottom: 2px solid #dee2e6; font-weight: 600; font-size: 14px; color: #495057;">SKU</th>';
    tbl +=
      '<th style="padding: 15px 12px; text-align: center; border-bottom: 2px solid #dee2e6; font-weight: 600; font-size: 14px; color: #495057;">Last Updated</th>';

    if (showAge) {
      tbl +=
        '<th style="padding: 15px 12px; text-align: center; border-bottom: 2px solid #dee2e6; font-weight: 600; font-size: 14px; color: #495057;">Age (hours)</th>';
    }

    tbl +=
      '<th style="padding: 15px 12px; text-align: center; border-bottom: 2px solid #dee2e6; font-weight: 600; font-size: 14px; color: #28a745;">Buy Price</th>';
    tbl +=
      '<th style="padding: 15px 12px; text-align: center; border-bottom: 2px solid #dee2e6; font-weight: 600; font-size: 14px; color: #dc3545;">Sell Price</th>';
    tbl +=
      '<th style="padding: 15px 12px; text-align: center; border-bottom: 2px solid #dee2e6; font-weight: 600; font-size: 14px; color: #495057;">In Bot</th>';
    tbl +=
      '<th style="padding: 15px 12px; text-align: center; border-bottom: 2px solid #dee2e6; font-weight: 600; font-size: 14px; color: #495057;">Actions</th>';
    tbl += '</tr>';
    tbl += '</thead>';
    tbl += '<tbody>';

    items.forEach((item, index) => {
      const last = new Date(item.time * 1000).toLocaleString();
      const ageH = (item.age / 3600).toFixed(2);
      const buyUnit = item.buy.keys === 1 ? 'Key' : 'Keys';
      const sellUnit = item.sell.keys === 1 ? 'Key' : 'Keys';
      const inBot = item.inSelling;
      const sku = item.sku;
      const currentSell = sell[sku];
      const defaultMin = currentSell?.min || 1;
      const defaultMax = currentSell?.max || 1;

      // Determine row background based on age and bot status
      let rowClass = '';
      let rowStyle = '';

      if (showAge) {
        // Age-based styling for outdated items
        if (item.age > 2 * 24 * 3600) {
          rowClass = 'outdated-2d';
          rowStyle = 'background-color: #f8d7da; border-left: 4px solid #dc3545;'; // Light red with red border
        } else if (item.age > 24 * 3600) {
          rowClass = 'outdated-1d';
          rowStyle = 'background-color: #fff3cd; border-left: 4px solid #ffc107;'; // Light yellow with yellow border
        } else {
          rowClass = 'outdated-2h';
          rowStyle = 'background-color: #ffe6e6; border-left: 4px solid #fd7e14;'; // Very light red with orange border
        }
      } else {
        // Current items - all get light green theme since they have fresh prices
        rowClass = 'current-row';
        let baseColor, borderColor;

        if (item.inSelling) {
          // Items in bot - darker green backgrounds
          baseColor = index % 2 === 0 ? '#c3e6cb' : '#b8dacc';
          borderColor = '#28a745';
        } else {
          // Items not in bot - lighter green backgrounds
          baseColor = index % 2 === 0 ? '#d4edda' : '#c8e6c9';
          borderColor = '#495057';
        }

        rowStyle = `background-color: ${baseColor}; border-left: 4px solid ${borderColor};`;
      }

      const actionControls = `
        <div style="display: flex; align-items: center; gap: 5px; justify-content: center;">
          <input type="number" id="min-${sku}" value="${defaultMin}" 
                 style="width: 50px; padding: 4px; border: 1px solid #ddd; border-radius: 3px; text-align: center;" 
                 min="1" title="Minimum quantity">
          <input type="number" id="max-${sku}" value="${defaultMax}" 
                 style="width: 50px; padding: 4px; border: 1px solid #ddd; border-radius: 3px; text-align: center;" 
                 min="1" title="Maximum quantity">
          <div style="display: flex; gap: 3px;">
            ${
              inBot
                ? `<button onclick="queueAction('remove','${sku}')" 
                           style="background: #dc3545; color: white; border: none; padding: 6px 8px; border-radius: 3px; cursor: pointer; font-size: 12px;" 
                           title="Remove from bot">❌</button>
                   <button onclick="queueEdit('${sku}')" 
                           style="background: #ffc107; color: black; border: none; padding: 6px 8px; border-radius: 3px; cursor: pointer; font-size: 12px;" 
                           title="Edit quantities">✏️</button>`
                : `<button onclick="queueAction('add','${sku}')" 
                           style="background: #28a745; color: white; border: none; padding: 6px 8px; border-radius: 3px; cursor: pointer; font-size: 12px;" 
                           title="Add to bot">✅</button>`
            }
          </div>
        </div>
      `;

      tbl += `<tr class="${rowClass}" data-age="${item.age}" data-inbot="${inBot}" style="${rowStyle}">`;
      tbl += `<td class="name" style="padding: 12px; border-bottom: 1px solid #eee; font-weight: bold;">${item.name}</td>`;
      tbl += `<td class="sku" style="padding: 12px; border-bottom: 1px solid #eee;"><code style="background: #f8f9fa; padding: 2px 4px; border-radius: 3px; font-size: 11px;">${sku}</code></td>`;
      tbl += `<td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center; font-size: 12px;">${last}</td>`;

      if (showAge) {
        const ageColor =
          item.age > 2 * 24 * 3600 ? '#721c24' : item.age > 24 * 3600 ? '#856404' : '#155724';
        tbl += `<td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center; font-weight: bold; color: ${ageColor};">${ageH}</td>`;
      }

      tbl += `<td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center; color: #28a745; font-weight: bold;">${item.buy.keys} ${buyUnit} + ${item.buy.metal} Ref</td>`;
      tbl += `<td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center; color: #dc3545; font-weight: bold;">${item.sell.keys} ${sellUnit} + ${item.sell.metal} Ref</td>`;
      tbl += `<td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center; font-size: 16px;">${inBot ? '✅' : '❌'}</td>`;
      tbl += `<td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">${actionControls}</td>`;
      tbl += '</tr>';
    });

    tbl += '</tbody></table>';
    return tbl;
  }

  function buildMissingTable(names) {
    if (names.length === 0) {
      return `
        <div style="text-align: center; padding: 40px; color: #666;">
          <h4>🎉 All Items Have Prices</h4>
          <p>All items in your watchlist have current price data!</p>
        </div>
      `;
    }

    names.sort();
    let tbl =
      '<table style="width: 100%; border-collapse: collapse; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">';
    tbl += '<thead style="background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);">';
    tbl += '<tr>';
    tbl +=
      '<th style="padding: 15px 12px; text-align: left; border-bottom: 2px solid #dee2e6; font-weight: 600; font-size: 14px; color: #495057;">Item Name</th>';
    tbl +=
      '<th style="padding: 15px 12px; text-align: center; border-bottom: 2px solid #dee2e6; font-weight: 600; font-size: 14px; color: #495057;">Action</th>';
    tbl += '</tr>';
    tbl += '</thead>';
    tbl += '<tbody>';

    names.forEach((name, index) => {
      const baseColor = index % 2 === 0 ? '#ffffff' : '#f8f9fa';
      const rowStyle = `background-color: ${baseColor}; border-left: 4px solid #17a2b8;`;
      tbl += `<tr data-age="0" data-inbot="false" style="${rowStyle}">`;
      tbl += `<td class="name" style="padding: 12px; border-bottom: 1px solid #eee; font-weight: bold;">${name}</td>`;
      tbl += `<td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">`;
      tbl += `<button onclick="queueAction('addName', '${encodeURIComponent(name)}')" `;
      tbl += `style="background: #28a745; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-weight: bold;" `;
      tbl += `title="Add ${name} to tracked items">✅ Add to Tracker</button>`;
      tbl += '</td>';
      tbl += '</tr>';
    });

    tbl += '</tbody></table>';
    return tbl;
  }

  function loadData() {
    const paths = getBotPaths();
    const main = loadJson(paths.pricelistPath);
    const sell = loadJson(paths.sellingPricelistPath);
    const itemList = loadJson(paths.itemListPath).items.map((i) => i.name);
    const now = Math.floor(Date.now() / 1000);
    const outdated = [],
      current = [],
      priced = new Set();

    main.items.forEach((item) => {
      const age = now - item.time;
      const inSelling = Boolean(sell[item.sku]);
      priced.add(item.name);
      const annotated = { ...item, age, inSelling };
      (age > thresholdSec ? outdated : current).push(annotated);
    });

    const missing = itemList.filter((n) => !priced.has(n));
    return { outdated, current, missing, sell };
  }

  router.get('/', (req, res) => {
    try {
      // Check if bot is configured
      const selectedBot = configManager.getSelectedBot();
      if (!selectedBot) {
        let html = '<div style="max-width: 800px; margin: 0 auto; padding: 20px;">';
        html +=
          '<div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 20px; border-radius: 8px; text-align: center;">';
        html += '<h2>⚠️ No Bot Configuration Found</h2>';
        html += '<p>You need to configure a bot before viewing pricelist data.</p>';
        html += "<p>The pricelist manager requires access to your bot's pricelist and files.</p>";
        html +=
          '<p><a href="/bot-config" style="background: #007cba; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">🤖 Configure Bot</a></p>';
        html += '</div>';
        html += '</div>';
        return res.send(renderPage('Pricelist Manager - No Bot Configured', html));
      }

      const { outdated, current, missing, sell } = loadData();

      let html = '<div style="max-width: 1400px; margin: 0 auto; padding: 20px;">';

      // Header
      html +=
        '<div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 20px;">';
      html += '<h2>📊 Pricelist Status Dashboard</h2>';
      html +=
        '<p>Monitor price ages, manage bot inventory, and queue item operations all in one place.</p>';
      html += '</div>';

      // Summary Statistics
      html += '<div style="display: flex; gap: 20px; margin-bottom: 20px; flex-wrap: wrap;">';

      // Outdated Items Card
      html +=
        '<div style="flex: 1; min-width: 200px; background: #f8d7da; padding: 15px; border-radius: 8px;">';
      html += '<h3 style="color: #721c24; margin-top: 0;">⏰ Outdated Items</h3>';
      html += `<p style="font-size: 24px; font-weight: bold; color: #721c24; margin: 10px 0;">${outdated.length}</p>`;
      html += `<p>Items older than ${thresholdSec / 3600} hours</p>`;
      html += '</div>';

      // Current Items Card
      html +=
        '<div style="flex: 1; min-width: 200px; background: #d4edda; padding: 15px; border-radius: 8px;">';
      html += '<h3 style="color: #155724; margin-top: 0;">✅ Current Items</h3>';
      html += `<p style="font-size: 24px; font-weight: bold; color: #155724; margin: 10px 0;">${current.length}</p>`;
      html += '<p>Items with recent prices</p>';
      html += '</div>';

      // Missing Items Card
      html +=
        '<div style="flex: 1; min-width: 200px; background: #fff3cd; padding: 15px; border-radius: 8px;">';
      html += '<h3 style="color: #856404; margin-top: 0;">❓ Unpriced Items</h3>';
      html += `<p style="font-size: 24px; font-weight: bold; color: #856404; margin: 10px 0;">${missing.length}</p>`;
      html += '<p>Items without price data</p>';
      html += '</div>';

      // Bot Items Card
      const botItemCount = Object.keys(sell).length;
      html +=
        '<div style="flex: 1; min-width: 200px; background: #e8f4fd; padding: 15px; border-radius: 8px;">';
      html += '<h3 style="color: #004085; margin-top: 0;">🤖 Bot Inventory</h3>';
      html += `<p style="font-size: 24px; font-weight: bold; color: #004085; margin: 10px 0;">${botItemCount}</p>`;
      html += '<p>Items in bot pricelist</p>';
      html += '</div>';

      html += '</div>';

      // Filter Controls
      html +=
        '<div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">';
      html += '<h3 style="margin-top: 0;">🔍 Search & Filter Controls</h3>';
      html += '<div style="display: flex; gap: 15px; align-items: center; flex-wrap: wrap;">';
      html +=
        '<input type="text" id="search" placeholder="Search by name or SKU..." style="flex: 1; min-width: 250px; padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">';
      html += '<div style="display: flex; gap: 10px; flex-wrap: wrap;">';
      html +=
        '<label style="display: flex; align-items: center; gap: 5px;"><input type="checkbox" class="filter" id="filter-notinbot"> Not In Bot</label>';
      html +=
        '<label style="display: flex; align-items: center; gap: 5px;"><input type="checkbox" class="filter" id="filter-2h"> Age ≥ 2h</label>';
      html +=
        '<label style="display: flex; align-items: center; gap: 5px;"><input type="checkbox" class="filter" id="filter-1d"> Age ≥ 24h</label>';
      html +=
        '<label style="display: flex; align-items: center; gap: 5px;"><input type="checkbox" class="filter" id="filter-3d"> Age ≥ 72h</label>';
      html += '</div>';
      html += '</div>';
      html += '</div>';

      // Add Item Section
      html +=
        '<div style="background: #e8f4fd; padding: 20px; border-radius: 8px; margin-bottom: 20px;">';
      html += '<h3 style="margin-top: 0;">➕ Add New Item</h3>';
      html +=
        '<p style="margin-bottom: 15px;">Add a new item to your watchlist for price monitoring</p>';
      html +=
        '<form method="POST" action="/add-item" style="display: flex; gap: 10px; align-items: center;">';
      html +=
        '<input type="text" name="name" placeholder="Enter item name (e.g., \'Scattergun\')" required style="flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">';
      html +=
        '<button type="submit" style="background: #28a745; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Add Item</button>';
      html += '</form>';
      html += '</div>';

      // Pending Actions Queue
      html +=
        '<div id="queue-panel" style="position: fixed; top: 100px; right: 20px; width: 300px; background: white; border: 1px solid #ddd; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); z-index: 1000; max-height: 80vh; overflow: auto;">';
      html +=
        '<div style="background: #f8f9fa; padding: 15px; border-bottom: 1px solid #ddd; position: sticky; top: 0;">';
      html += '<h4 style="margin: 0;">📋 Pending Actions</h4>';
      html += '</div>';
      html += '<div style="padding: 15px;">';
      html += '<ul id="queue-list" style="list-style: none; padding: 0; margin: 0;"></ul>';
      html +=
        '<button onclick="applyQueue()" style="width: 100%; background: #007cba; color: white; padding: 10px; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; margin-top: 10px;">Apply All & Restart Bot</button>';
      html += '</div>';
      html += '</div>';

      // Outdated Items Section
      if (outdated.length > 0) {
        html +=
          '<div style="background: white; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; margin-bottom: 20px;">';
        html += '<div style="background: #f8d7da; padding: 15px; border-bottom: 1px solid #ddd;">';
        html += `<h3 style="margin: 0; color: #721c24;">⏰ Outdated Items (${outdated.length})</h3>`;
        html +=
          '<p style="margin: 5px 0 0 0; color: #721c24;">Items with prices older than threshold - may need attention</p>';
        html += '</div>';
        html += '<div style="overflow-x: auto;">';
        html += buildTable(outdated, true, sell);
        html += '</div>';
        html += '</div>';
      }

      // Current Items Section
      if (current.length > 0) {
        html +=
          '<div style="background: white; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; margin-bottom: 20px;">';
        html += '<div style="background: #d4edda; padding: 15px; border-bottom: 1px solid #ddd;">';
        html += `<h3 style="margin: 0; color: #155724;">✅ Current Items (${current.length})</h3>`;
        html +=
          '<p style="margin: 5px 0 0 0; color: #155724;">Items with recent price updates - ready for trading</p>';
        html += '</div>';
        html += '<div style="overflow-x: auto;">';
        html += buildTable(current, false, sell);
        html += '</div>';
        html += '</div>';
      }

      // Unpriced Items Section
      if (missing.length > 0) {
        html +=
          '<div style="background: white; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; margin-bottom: 20px;">';
        html += '<div style="background: #fff3cd; padding: 15px; border-bottom: 1px solid #ddd;">';
        html += `<h3 style="margin: 0; color: #856404;">❓ Unpriced Items (${missing.length})</h3>`;
        html +=
          '<p style="margin: 5px 0 0 0; color: #856404;">Items in your watchlist without price data</p>';
        html += '</div>';
        html += '<div style="padding: 20px;">';
        html += buildMissingTable(missing);
        html += '</div>';
        html += '</div>';
      }

      // Instructions
      html +=
        '<div style="background: #d1ecf1; border: 1px solid #bee5eb; padding: 20px; border-radius: 8px;">';
      html += '<h4>💡 How to Use the Pricelist Manager</h4>';
      html += '<ul style="margin: 10px 0;">';
      html +=
        '<li><strong>Search & Filter:</strong> Use the search box and checkboxes to find specific items</li>';
      html +=
        "<li><strong>Add to Bot:</strong> Click ✅ to queue an item for addition to your bot's pricelist</li>";
      html +=
        '<li><strong>Remove from Bot:</strong> Click ❌ to queue an item for removal from your bot</li>';
      html +=
        '<li><strong>Edit Quantities:</strong> Adjust min/max values and click ✏️ to queue changes</li>';
      html +=
        '<li><strong>Apply Changes:</strong> Use the "Apply All & Restart Bot" button to execute queued actions</li>';
      html +=
        '<li><strong>Age Monitoring:</strong> Items are color-coded by age - red items need attention</li>';
      html += '</ul>';
      html += '</div>';

      html += '</div>';

      // Enhanced JavaScript
      html += `
        <style>
          /* Enhanced table styling */
          table tbody tr {
            transition: all 0.2s ease;
          }
          
          table tbody tr:hover {
            transform: translateY(-1px);
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          }
          
          .outdated-2d:hover {
            background-color: #f5c6cb !important;
          }
          
          .outdated-1d:hover {
            background-color: #ffeaa7 !important;
          }
          
          .outdated-2h:hover {
            background-color: #ffcccc !important;
          }
          
          .current-row:hover {
            background-color: #e8f4fd !important;
          }
          
          /* Special hover for items in bot */
          .current-row[data-inbot="true"]:hover {
            background-color: #b8dacc !important;
          }
          
          /* Action button improvements */
          table button {
            transition: all 0.2s ease;
          }
          
          table button:hover {
            transform: scale(1.05);
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
          }
          
          /* Input field improvements */
          table input[type="number"] {
            transition: border-color 0.2s ease;
          }
          
          table input[type="number"]:focus {
            border-color: #007cba;
            outline: none;
            box-shadow: 0 0 0 2px rgba(0, 124, 186, 0.2);
          }
        </style>
        <script>
          let queue = [];

          function refreshQueue() {
            const ul = document.getElementById('queue-list');
            ul.innerHTML = '';
            
            if (queue.length === 0) {
              const li = document.createElement('li');
              li.style.cssText = 'color: #666; font-style: italic; padding: 10px 0; text-align: center;';
              li.textContent = 'No pending actions';
              ul.appendChild(li);
              return;
            }

            queue.forEach(function(q, i) {
              const li = document.createElement('li');
              li.style.cssText = 'padding: 8px; margin: 5px 0; background: #f8f9fa; border-radius: 4px; cursor: pointer; border: 1px solid #ddd;';
              
              let actionText = '';
              let actionColor = '#007cba';

              if (q.action === 'add') {
                actionText = \`➕ Add \${q.sku} (Min: \${q.min || 1}, Max: \${q.max || 1})\`;
                actionColor = '#28a745';
              } else if (q.action === 'edit') {
                actionText = \`✏️ Edit \${q.sku} (Min: \${q.min}, Max: \${q.max})\`;
                actionColor = '#ffc107';
              } else if (q.action === 'remove') {
                actionText = \`❌ Remove \${q.sku}\`;
                actionColor = '#dc3545';
              } else if (q.action === 'addName') {
                actionText = \`➕ Add Item: \${decodeURIComponent(q.name)}\`;
                actionColor = '#17a2b8';
              }

              li.innerHTML = \`
                <div style="color: \${actionColor}; font-weight: bold; font-size: 12px;">\${actionText}</div>
                <div style="color: #666; font-size: 11px; margin-top: 3px;">Click to remove</div>
              \`;
              
              li.dataset.index = i;
              li.addEventListener('click', function() {
                queue.splice(this.dataset.index, 1);
                refreshQueue();
              });
              ul.appendChild(li);
            });
          }

          function queueAction(action, value) {
            let sku, name, min, max;
            
            if (action === 'addName') {
              name = value;
            } else {
              sku = value;
              if (action === 'add') {
                min = parseInt(document.getElementById('min-' + sku).value) || 1;
                max = parseInt(document.getElementById('max-' + sku).value) || 1;
              }
            }
            
            queue.push({ action, sku, name, min, max });
            refreshQueue();
          }

          function queueEdit(sku) {
            const min = parseInt(document.getElementById('min-' + sku).value) || 1;
            const max = parseInt(document.getElementById('max-' + sku).value) || 1;
            queue.push({ action: 'edit', sku, min, max });
            refreshQueue();
          }
          
          async function applyQueue() {
            if (!queue.length) {
              alert('No actions to apply');
              return;
            }
            
            if (!confirm(\`Apply \${queue.length} change(s) and restart bot?\\n\\nThis will:\\n- Execute all queued actions\\n- Restart your trading bot\\n- Update the pricelist\`)) {
              return;
            }
            
            const button = document.querySelector('#queue-panel button');
            button.disabled = true;
            button.textContent = 'Processing...';
            
            try {
              for (let i = 0; i < queue.length; i++) {
                const q = queue[i];
                let url, body;

                if (q.action === 'add') {
                  url = '/bot/add';
                  body = \`sku=\${q.sku}&min=\${q.min}&max=\${q.max}\`;
                } else if (q.action === 'remove') {
                  url = '/bot/remove';
                  body = \`sku=\${q.sku}\`;
                } else if (q.action === 'edit') {
                  url = '/bot/edit';
                  body = \`sku=\${q.sku}&min=\${q.min}&max=\${q.max}\`;
                } else if (q.action === 'addName') {
                  url = '/add-item';
                  body = \`name=\${encodeURIComponent(q.name)}\`;
                }

                await fetch(url, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                  body
                });
              }
              
              queue = [];
              refreshQueue();
              
              // Show success message and reload
              alert('All actions applied successfully! Reloading page...');
              location.reload();
            } catch (error) {
              alert('Error applying actions: ' + error.message);
              button.disabled = false;
              button.textContent = 'Apply All & Restart Bot';
            }
          }
          
          function filterRows() {
            const s = document.getElementById('search').value.toLowerCase();
            const fNot = document.getElementById('filter-notinbot').checked;
            const f2h = document.getElementById('filter-2h').checked;
            const f1d = document.getElementById('filter-1d').checked;
            const f3d = document.getElementById('filter-3d').checked;
            
            let visibleCount = 0;
            document.querySelectorAll('tbody tr').forEach(function(row) {
              const name = (row.querySelector('.name')?.innerText || '').toLowerCase();
              const sku = (row.querySelector('.sku')?.innerText || '').toLowerCase();
              const inb = row.dataset.inbot === 'true';
              const age = parseInt(row.dataset.age) || 0;
              
              let ok = name.includes(s) || sku.includes(s);
              if (ok && fNot && inb) ok = false;
              if (ok && f2h && age < 3600 * 2) ok = false;
              if (ok && f1d && age < 3600 * 24) ok = false;
              if (ok && f3d && age < 3600 * 72) ok = false;
              
              row.style.display = ok ? '' : 'none';
              if (ok) visibleCount++;
            });
            
            console.log(\`Showing \${visibleCount} items\`);
          }
          
          // Initialize
          document.getElementById('search').addEventListener('input', filterRows);
          document.querySelectorAll('.filter').forEach(cb => cb.addEventListener('change', filterRows));
          refreshQueue();
          filterRows();
        </script>
      `;

      res.send(renderPage('Pricelist Status Dashboard', html));
    } catch (error) {
      console.error('Error in pricelist route:', error);
      let html = '<div style="max-width: 800px; margin: 0 auto; padding: 20px;">';
      html +=
        '<div style="background: #f8d7da; border: 1px solid #f5c6cb; padding: 20px; border-radius: 8px; text-align: center;">';
      html += '<h2>⚠️ Error Loading Pricelist Data</h2>';
      html += '<p>There was an error loading the pricelist data.</p>';
      html += `<p><strong>Error details:</strong> ${error.message}</p>`;
      html += '<p>Please check that your bot configuration is correct and try again.</p>';
      html +=
        '<p><a href="/bot-config" style="background: #007cba; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">🤖 Check Bot Config</a></p>';
      html += '</div>';
      html += '</div>';
      res.status(500).send(renderPage('Pricelist Status - Error', html));
    }
  });
  app.use('/', router); // Mount the router to root path
};

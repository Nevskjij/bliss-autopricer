// layout.js
module.exports = function renderPage(title, bodyContent) {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <title>${title}</title>
    <style>
      body { font-family: sans-serif; margin: 0; padding: 20px; }
      nav { position: fixed; top: 20px; right: 20px; background: #444; color: #fff; padding: 10px; border-radius: 5px; }
      nav a { color: #fff; text-decoration: none; margin: 5px; display: inline-block; padding: 5px 10px; border-radius: 3px; }
      nav a:hover { background: rgba(255,255,255,0.2); }
      pre {
        background: #111;
        color: #0f0;
        padding: 1em;
        font-family: monospace;
        overflow-x: auto;
        max-height: 80vh;
      }

      .controls { margin-bottom: 20px; }
      .controls input[type=text] { padding: 5px; width: 200px; margin-right: 10px; }
      .controls label { margin-right: 15px; }

      #queue-panel {
        position: fixed;
        top: 100px;
        right: 0;
        width: 200px;
        background: #f9f9f9;
        border: 1px solid #ccc;
        padding: 10px;
        max-height: 80vh;
        overflow: auto;
      }

      .chart-fullscreen {
        position: absolute;
        top: 60px; /* adjust if your nav/header is taller */
        left: 0;
        right: 0;
        bottom: 0;
        padding: 10px;
      }

      canvas#profitOverTime {
        width: 100% !important;
        height: 100% !important;
        display: block;
      }

      table { width: 100%; border-collapse: collapse; margin-bottom: 30px; table-layout: fixed; }
      th, td {
        border: 1px solid #ccc;
        padding: 8px;
        text-align: left;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      th { background: #f0f0f0; }
      button {
        cursor: pointer;
        border: none;
        background: none;
        font-size: 1em;
      }

      .outdated-2h { background: #ffffe0; }
      .outdated-1d { background: #ffe5b4; }
      .outdated-2d { background: #f4cccc; }
      .current-row { background: #e0ffe0; }
    </style>
  </head>
  <body>
    <nav>
      <a href="/">Price List</a>
      <a href="/bounds">Edit Bounds</a>
      <a href="/key-prices">Key Graph</a>
      <a href="/pnl">Profit/Loss</a>
      <a href="/trades">Trade History</a>
      <a href="/logs">Logs</a>
      <a href="/bot-config">🤖 Bot Config</a>
    </nav>
    <div class="container">
      ${bodyContent}
    </div>
  </body>
  </html>
  `;
};

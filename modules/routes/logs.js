const fs = require('fs');
const path = require('path');
const renderPage = require('../layout');

const LOG_FILES = ['bptf-autopricer-out.log', 'bptf-autopricer-error.log'];

module.exports = (app) => {
  const pm2LogDir = path.join(process.env.HOME || process.env.USERPROFILE, '.pm2', 'logs');

  app.get('/logs', (req, res) => {
    const file = req.query.file || 'bptf-autopricer-out.log';

    if (!LOG_FILES.includes(file)) {
      let html = '<div style="max-width: 800px; margin: 0 auto; padding: 20px;">';
      html +=
        '<div style="background: #f8d7da; border: 1px solid #f5c6cb; padding: 20px; border-radius: 8px; text-align: center;">';
      html += '<h2>❌ Invalid Log File</h2>';
      html += '<p>The requested log file is not available or not allowed.</p>';
      html +=
        '<p><a href="/logs" style="background: #007cba; color: white; padding: 10px 15px; text-decoration: none; border-radius: 4px;">← Back to Logs</a></p>';
      html += '</div>';
      html += '</div>';
      return res.status(400).send(renderPage('Invalid Log File', html));
    }

    const logPath = path.join(pm2LogDir, file);

    fs.readFile(logPath, 'utf8', (err, data) => {
      let html = '<div style="max-width: 1200px; margin: 0 auto; padding: 20px;">';

      // Header
      html +=
        '<div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 20px;">';
      html += '<h2>📄 Application Logs</h2>';
      html +=
        '<p>Monitor real-time application logs to debug issues and track system behavior.</p>';
      html += '</div>';

      // Log File Selection
      html +=
        '<div style="background: #e8f4fd; padding: 15px; border-radius: 8px; margin-bottom: 20px;">';
      html += '<h3>📂 Available Log Files</h3>';
      html += '<div style="display: flex; gap: 10px; flex-wrap: wrap;">';

      LOG_FILES.forEach((f) => {
        const isActive = f === file;
        const buttonStyle = isActive
          ? 'background: #007cba; color: white;'
          : 'background: #6c757d; color: white;';
        const icon = f.includes('error') ? '🔴' : '📄';

        html += `<a href="/logs?file=${f}" style="${buttonStyle} padding: 10px 15px; text-decoration: none; border-radius: 4px; font-weight: ${isActive ? 'bold' : 'normal'};">${icon} ${f}</a>`;
      });

      html += '</div>';
      html += '</div>';

      // Log Content
      html +=
        '<div style="background: white; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">';
      html +=
        '<div style="background: #f8f9fa; padding: 15px; border-bottom: 1px solid #ddd; display: flex; justify-content: space-between; align-items: center;">';
      html += `<h3 style="margin: 0;">📋 ${file}</h3>`;
      html +=
        '<small style="color: #666;">Auto-refreshes every 8 minutes | Last 15KB shown</small>';
      html += '</div>';

      if (err) {
        html += '<div style="padding: 20px;">';
        html +=
          '<div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 4px; text-align: center;">';
        html += '<h4>⚠️ Unable to Read Log File</h4>';
        html += `<p><strong>File:</strong> ${file}</p>`;
        html += `<p><strong>Path:</strong> <code>${logPath}</code></p>`;
        html += `<p><strong>Error:</strong> ${err.message}</p>`;
        html += '<p>This could indicate:</p>';
        html += '<ul style="text-align: left; display: inline-block;">';
        html += '<li>The application is not running</li>';
        html += '<li>Log files have not been created yet</li>';
        html += '<li>Insufficient permissions to read log files</li>';
        html += '<li>PM2 is not managing the application</li>';
        html += '</ul>';
        html += '</div>';
        html += '</div>';
      } else {
        html += '<div style="padding: 0;">';
        html +=
          '<pre id="logbox" style="background: #1e1e1e; color: #00ff00; padding: 20px; margin: 0; overflow-x: auto; max-height: 70vh; font-family: \'Courier New\', monospace; font-size: 14px; line-height: 1.4; white-space: pre-wrap;">';
        // Show last 15KB to avoid overwhelming the browser
        const logContent = data.slice(-15000);
        html += logContent.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        html += '</pre>';
        html += '</div>';
      }

      html += '</div>';

      // Auto-refresh info
      html +=
        '<div style="background: #d1ecf1; border: 1px solid #bee5eb; padding: 15px; border-radius: 8px; margin-top: 20px;">';
      html += '<h4>🔄 Auto-Refresh Information</h4>';
      html +=
        '<p>This page automatically refreshes every 8 minutes to show the latest log entries.</p>';
      html +=
        '<p>For real-time monitoring, consider using: <code>tail -f ~/.pm2/logs/' +
        file +
        '</code></p>';
      html += '</div>';

      html += '</div>';

      // Auto-refresh script (8 minutes = 480,000ms)
      html += `
        <script>
          setTimeout(() => {
            window.location.reload();
          }, 480000);
          
          // Auto-scroll to bottom of log
          window.addEventListener('load', () => {
            const logbox = document.getElementById('logbox');
            if (logbox) {
              logbox.scrollTop = logbox.scrollHeight;
            }
          });
        </script>
      `;

      res.send(renderPage(`Application Logs - ${file}`, html));
    });
  });
};

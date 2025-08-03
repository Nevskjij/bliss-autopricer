const express = require('express');
const router = express.Router();

// This will be set by the main application
let getWebSocketStats = null;

// Allow the main application to provide the websocket stats function
function setWebSocketStatsProvider(statsProvider) {
  getWebSocketStats = statsProvider;
}

router.get('/', (req, res) => {
  if (!getWebSocketStats) {
    return res.status(503).json({
      error: 'WebSocket stats provider not available',
    });
  }

  try {
    const stats = getWebSocketStats();
    const timeSinceLastMessage = Math.round(stats.timeSinceLastMessage / 1000);

    // Determine health status
    let healthStatus = 'healthy';
    let alerts = [];

    if (!stats.isConnected) {
      healthStatus = 'disconnected';
      alerts.push('WebSocket is not connected');
    } else if (timeSinceLastMessage > 300) {
      // 5 minutes
      healthStatus = 'unhealthy';
      alerts.push(`No messages received for ${timeSinceLastMessage} seconds`);
    } else if (timeSinceLastMessage > 120) {
      // 2 minutes
      healthStatus = 'warning';
      alerts.push(`No messages received for ${timeSinceLastMessage} seconds`);
    }

    res.json({
      status: healthStatus,
      alerts,
      stats: {
        messageCount: stats.messageCount,
        lastMessageTime: new Date(stats.lastMessageTime).toISOString(),
        timeSinceLastMessage: timeSinceLastMessage,
        isConnected: stats.isConnected,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get websocket stats',
      message: error.message,
    });
  }
});

module.exports = {
  router,
  setWebSocketStatsProvider,
};

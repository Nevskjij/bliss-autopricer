const express = require('express');
const router = express.Router();

let schemaManagerInstance = null;

// Set the schema manager instance (called from main app)
function setSchemaManager(manager) {
  schemaManagerInstance = manager;
}

// Get schema health status
router.get('/health', (req, res) => {
  if (!schemaManagerInstance) {
    return res.status(503).json({
      success: false,
      error: 'Schema manager not initialized',
      status: {
        isAvailable: false,
        reason: 'Manager not set',
      },
    });
  }

  try {
    const healthStatus = schemaManagerInstance.getHealthStatus();
    const hasSchema = !!schemaManagerInstance.schema;

    res.json({
      success: true,
      status: {
        isAvailable: hasSchema,
        hasActiveSchema: hasSchema,
        isRetiring: healthStatus.isRetiring,
        lastSuccessfulFetch: healthStatus.lastSuccessfulFetch,
        lastSuccessfulFetchTime: healthStatus.lastSuccessfulFetch
          ? new Date(healthStatus.lastSuccessfulFetch).toISOString()
          : null,
        cachedSchemaExists: healthStatus.cachedSchemaExists,
        cachedSchemaAgeHours: healthStatus.cachedSchemaAge
          ? Math.round(healthStatus.cachedSchemaAge * 10) / 10
          : null,
        recommendations: generateRecommendations(healthStatus, hasSchema),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get schema health status',
      details: error.message,
    });
  }
});

// Get basic schema info
router.get('/info', (req, res) => {
  if (!schemaManagerInstance || !schemaManagerInstance.schema) {
    return res.status(503).json({
      success: false,
      error: 'Schema not available',
    });
  }

  try {
    const schema = schemaManagerInstance.schema;

    res.json({
      success: true,
      schema: {
        hasSchema: true,
        itemCount: schema.raw?.items?.length || 0,
        version: schema.raw?.version || 'unknown',
        time: schema.raw?.items_game_url || null,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get schema info',
      details: error.message,
    });
  }
});

// Force schema refresh
router.post('/refresh', async (req, res) => {
  if (!schemaManagerInstance) {
    return res.status(503).json({
      success: false,
      error: 'Schema manager not initialized',
    });
  }

  try {
    console.log('🔄 [API] Manual schema refresh requested');
    const success = await schemaManagerInstance.fetchSchemaWithRetry();

    if (success) {
      res.json({
        success: true,
        message: 'Schema refresh completed successfully',
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Schema refresh failed',
        message: 'Enhanced schema manager could not fetch or use cached schema',
      });
    }
  } catch (error) {
    console.error('❌ [API] Schema refresh failed:', error.message);
    res.status(500).json({
      success: false,
      error: 'Schema refresh failed',
      details: error.message,
    });
  }
});

function generateRecommendations(healthStatus, hasSchema) {
  const recommendations = [];

  if (healthStatus.isRetiring) {
    recommendations.push({
      level: 'warning',
      message: 'Steam reports GetSchemaItems API as retired',
      action: 'Monitor for alternative solutions or API updates',
    });
  }

  if (!hasSchema && !healthStatus.cachedSchemaExists) {
    recommendations.push({
      level: 'critical',
      message: 'No schema available (live or cached)',
      action: 'Check Steam API key validity and network connectivity',
    });
  }

  if (healthStatus.cachedSchemaAgeHours > 168) {
    // 7 days
    recommendations.push({
      level: 'warning',
      message: `Cached schema is ${Math.round(healthStatus.cachedSchemaAgeHours / 24)} days old`,
      action: 'Consider refreshing schema or checking API connectivity',
    });
  }

  if (!healthStatus.lastSuccessfulFetch) {
    recommendations.push({
      level: 'info',
      message: 'No successful schema fetch recorded in this session',
      action: 'This is normal on first startup with cached schema',
    });
  }

  return recommendations;
}

module.exports = {
  router,
  setSchemaManager,
};

# Steam Schema API Issue & Solution

## Problem Description

Steam's `GetSchemaItems` API endpoint (`https://api.steampowered.com/IEconItems_440/GetSchemaItems/v0001`) is showing inconsistent behavior:

- **Sometimes**: Returns schema data as expected
- **Sometimes**: Returns error "Method 'GetSchemaItems' has been retired in interface 'IEconItems_440'"

This appears to be either:

1. A gradual rollout/retirement process by Steam
2. Load balancing where some servers still have the old endpoint
3. A temporary API issue

## Impact

The `@tf2autobot/tf2-schema` package (v4.3.0) used by this application relies on this endpoint, causing:

- 403 HTTP errors in console output
- Potential application crashes if no cached schema is available
- Inconsistent behavior depending on which Steam server responds

## Solution Implemented

### Enhanced Schema Manager (`modules/steamSchemaManager.js`)

A wrapper around the original schema manager that provides:

#### 1. **Retry Logic with Exponential Backoff**

- 3 retry attempts with increasing delays (2s, 3s, 4.5s)
- Intelligent error detection for "retired" API responses

#### 2. **Multiple Fallback Strategies**

- **Alternative Endpoints**: Tries different Steam API endpoints
  - `GetSchema/v0001`
  - `GetSchemaItems/v0002`
  - `IEconSchema_440/GetItems/v0001`
- **Cached Schema**: Falls back to locally cached schema file
- **Age Validation**: Warns if cached schema is older than 7 days

#### 3. **Health Monitoring**

- Tracks API retirement status
- Records last successful fetch timestamps
- Monitors cached schema age and availability

#### 4. **API Endpoints for Monitoring**

- `GET /schema-status/health` - Current schema health status
- `GET /schema-status/info` - Basic schema information
- `POST /schema-status/refresh` - Force schema refresh

## API Endpoints

### GET `/schema-status/health`

Returns comprehensive health information:

```json
{
  "success": true,
  "status": {
    "isAvailable": true,
    "hasActiveSchema": true,
    "isRetiring": false,
    "lastSuccessfulFetch": 1640995200000,
    "lastSuccessfulFetchTime": "2021-12-31T16:00:00.000Z",
    "cachedSchemaExists": true,
    "cachedSchemaAgeHours": 2.5,
    "recommendations": [
      {
        "level": "info",
        "message": "Schema is healthy",
        "action": "No action needed"
      }
    ]
  }
}
```

### GET `/schema-status/info`

Returns basic schema information:

```json
{
  "success": true,
  "schema": {
    "hasSchema": true,
    "itemCount": 1247,
    "version": "1.0",
    "time": "https://media.steampowered.com/apps/440/scripts/items/items_game.txt"
  }
}
```

### POST `/schema-status/refresh`

Forces a schema refresh:

```json
{
  "success": true,
  "message": "Schema refresh completed successfully",
  "timestamp": "2021-12-31T16:00:00.000Z"
}
```

## Error Handling

### Automatic Fallbacks

1. **Steam API fails** → Try alternative endpoints
2. **All endpoints fail** → Use cached schema
3. **No cache available** → Log error but continue if possible

### Monitoring & Alerts

- Console logging with clear status indicators (✅❌⚠️)
- Health status tracking for API monitoring
- Recommendations for manual intervention when needed

## Usage

The enhanced schema manager is a drop-in replacement that maintains the same interface as the original:

```javascript
// Original
const schemaManager = new Schema({ apiKey: config.steamAPIKey });

// Enhanced (implemented)
const originalManager = new Schema({ apiKey: config.steamAPIKey });
const schemaManager = new EnhancedSchemaManager(originalManager, config);
```

## Testing the UI

To test the updated application with enhanced Steam API handling:

1. **Start the application**:

   ```bash
   npm start
   ```

2. **Check schema status**:

   ```bash
   # In browser or curl
   http://localhost:3456/schema-status/health
   ```

3. **Monitor console output** for enhanced logging:
   ```
   ✅ [Schema] Successfully fetched schema from Steam API
   ⚠️ [Schema] Attempt 1 failed: 403 Forbidden
   🔄 [Schema] Trying alternative Steam API endpoints...
   💡 [Schema] Using cached schema (2.1 days old)
   ```

## Future Considerations

1. **Monitor Steam API Updates**: Watch for official announcements about API changes
2. **Alternative Data Sources**: Consider other schema data sources if Steam API becomes unreliable
3. **Proactive Caching**: Implement more sophisticated caching strategies
4. **Community Coordination**: Share findings with other TF2 tool developers

## Status Indicators

- ✅ **Success**: Operation completed successfully
- ❌ **Error**: Operation failed
- ⚠️ **Warning**: Operation succeeded with concerns
- 🔄 **Processing**: Operation in progress
- 💡 **Info**: Additional information
- 🚨 **Critical**: Urgent attention needed
- 📊 **Data**: Status or statistics
- 🔧 **Config**: Configuration related

# WebSocket Connection Monitoring Fix

## Problem

The BPTF autopricer was experiencing issues where the websocket connection would stop receiving price updates, causing outdated prices. This occurred because:

1. No connection health monitoring was in place
2. Silent connection failures could go undetected
3. No automatic recovery mechanisms for stalled connections
4. Limited reconnection configuration

## Solution Implemented

### 1. Enhanced Reconnection Configuration

- **Connection timeout**: 5 seconds (faster failure detection)
- **Retry policy**: Infinite retries with exponential backoff
- **Reconnection delays**: 1-30 seconds with 1.3x growth factor
- **Minimum uptime**: 5 seconds before considering connection stable

### 2. Health Monitoring System

- **Message activity tracking**: Monitors when last message was received
- **Periodic health checks**: Every 30 seconds
- **Force reconnection**: Automatically triggers if no messages for 2 minutes
- **Connection state monitoring**: Tracks actual WebSocket state

### 3. Enhanced Logging

- All connection events (open, close, error) are logged with timestamps
- Health check status is logged periodically
- Message activity statistics are tracked

### 4. Application-Level Monitoring

- **Periodic health reports**: Every minute in console logs
- **Warning alerts**: If no messages received for 5+ minutes
- **Graceful shutdown**: Proper cleanup on SIGTERM/SIGINT

### 5. API Endpoint for Health Monitoring

- **New endpoint**: `/websocket-status`
- **Real-time status**: Connection state, message count, last message time
- **Health indicators**: healthy/warning/unhealthy/disconnected
- **Alerts**: Automatic detection of connection issues

## How to Monitor

### Console Logs

Look for these log patterns:

- `[WebSocket] Connected to bptf socket.` - Connection established
- `[HEALTH] WebSocket: X messages, last Ys ago, connected: true` - Periodic health
- `[WebSocket] No messages received for Xs, forcing reconnect` - Auto-recovery triggered

### API Monitoring

Access `http://localhost:3456/websocket-status` for JSON health data:

```json
{
  "status": "healthy",
  "alerts": [],
  "stats": {
    "messageCount": 1250,
    "lastMessageTime": "2025-08-03T10:30:45.123Z",
    "timeSinceLastMessage": 15,
    "isConnected": true
  },
  "timestamp": "2025-08-03T10:31:00.456Z"
}
```

### Log Files

Check `logs/websocket.log` for detailed connection history and events.

## Health Status Indicators

- **healthy**: Connected and receiving messages regularly (< 2 minutes since last)
- **warning**: Connected but no messages for 2-5 minutes
- **unhealthy**: Connected but no messages for 5+ minutes
- **disconnected**: WebSocket connection is closed

## Automatic Recovery Features

1. **Connection monitoring**: Detects when connection goes stale
2. **Force reconnection**: Automatically triggers reconnect if no activity
3. **Exponential backoff**: Prevents overwhelming the server during outages
4. **Infinite retries**: Will keep trying to reconnect indefinitely
5. **Health reporting**: Visible status in logs and API

## Files Modified

- `websocket/bptfWebSocket.js` - Enhanced with health monitoring and better reconnection
- `bptf-autopricer.js` - Added health monitoring, graceful shutdown, and API integration
- `API/server.js` - Added websocket status route
- `API/routes/websocket-status.js` - New health monitoring endpoint

## Benefits

- **Automatic recovery**: No manual intervention needed for connection issues
- **Early detection**: Problems detected within 2 minutes instead of hours
- **Better visibility**: Real-time monitoring through logs and API
- **Improved reliability**: More robust reconnection handling
- **Proactive alerting**: Warning messages when connection becomes unstable

The system will now automatically detect and recover from websocket connection issues, ensuring price data stays current.

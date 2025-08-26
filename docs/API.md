# 📡 API Documentation

Complete reference for REST API and WebSocket endpoints.

## Base URL

```
http://localhost:3000
```

## Authentication

Most endpoints require valid backpack.tf API keys configured in your bot's `config.json`.

## REST API Endpoints

### Items & Pricing

#### Get Item Prices

```http
GET /api/items
```

**Query Parameters**:

- `sku` (string): Item SKU (e.g., "5021;6" for keys)
- `name` (string): Item name
- `limit` (number): Maximum results (default: 100)

**Response**:

```json
{
  "success": true,
  "items": [
    {
      "sku": "5021;6",
      "name": "Mann Co. Supply Crate Key",
      "buy": {
        "keys": 0,
        "metal": 67.33
      },
      "sell": {
        "keys": 0,
        "metal": 68.11
      },
      "time": 1640995200,
      "source": "bptf"
    }
  ]
}
```

#### Get Single Item Price

```http
GET /api/items/:sku
```

**Parameters**:

- `sku` (string): Item SKU

**Response**:

```json
{
  "success": true,
  "item": {
    "sku": "5021;6",
    "name": "Mann Co. Supply Crate Key",
    "buy": { "keys": 0, "metal": 67.33 },
    "sell": { "keys": 0, "metal": 68.11 },
    "time": 1640995200,
    "source": "bptf"
  }
}
```

### Bot Management

#### Get Current Bot

```http
GET /api/bot/current
```

**Response**:

```json
{
  "success": true,
  "bot": {
    "id": "main-bot",
    "name": "Main Trading Bot",
    "tf2autobotPath": "/path/to/tf2autobot",
    "botDirectory": "files/main-bot",
    "description": "Primary trading bot",
    "status": "active"
  }
}
```

#### List All Bots

```http
GET /api/bots
```

**Response**:

```json
{
  "success": true,
  "bots": [
    {
      "id": "main-bot",
      "name": "Main Trading Bot",
      "status": "active"
    },
    {
      "id": "unusual-bot",
      "name": "Unusual Specialist",
      "status": "inactive"
    }
  ]
}
```

#### Switch Bot

```http
POST /api/bot/switch
```

**Request Body**:

```json
{
  "botId": "unusual-bot"
}
```

**Response**:

```json
{
  "success": true,
  "message": "Switched to bot: unusual-bot"
}
```

### Pricelist Management

#### Add Item to Pricelist

```http
POST /bot/add
```

**Content-Type**: `application/x-www-form-urlencoded`

**Body**:

```
sku=5021;6&min=1&max=1
```

**Response**:

```json
{
  "success": true,
  "message": "Item added to pricelist"
}
```

#### Remove Item from Pricelist

```http
POST /bot/remove
```

**Content-Type**: `application/x-www-form-urlencoded`

**Body**:

```
sku=5021;6
```

**Response**:

```json
{
  "success": true,
  "message": "Item removed from pricelist"
}
```

#### Edit Item in Pricelist

```http
POST /bot/edit
```

**Content-Type**: `application/x-www-form-urlencoded`

**Body**:

```
sku=5021;6&min=1&max=2
```

**Response**:

```json
{
  "success": true,
  "message": "Item updated in pricelist"
}
```

### Health & Status

#### WebSocket Status

```http
GET /websocket-status
```

**Response**: HTML page showing real-time WebSocket connection status

#### Health Check

```http
GET /api/health
```

**Response**:

```json
{
  "success": true,
  "status": "healthy",
  "timestamp": 1640995200,
  "uptime": 3600,
  "database": "connected",
  "websocket": "active"
}
```

### Key Prices

#### Get Key Price History

```http
GET /key-prices
```

**Response**: HTML page with key price charts and analytics

#### Get Key Price Data (JSON)

```http
GET /api/key-prices
```

**Query Parameters**:

- `days` (number): Number of days of history (default: 14)

**Response**:

```json
{
  "success": true,
  "data": [
    {
      "timestamp": 1640995200,
      "buy_price_metal": 67.33,
      "sell_price_metal": 68.11,
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "stats": {
    "current_buy": 67.33,
    "current_sell": 68.11,
    "avg_buy": 67.5,
    "avg_sell": 68.25
  }
}
```

## WebSocket Events

### Connection

```javascript
const io = require('socket.io-client');
const socket = io('http://localhost:3000');

socket.on('connect', () => {
  console.log('Connected to autopricer');
});
```

### Price Updates

#### Listen for Price Updates

```javascript
socket.on('price', (data) => {
  console.log('Price update:', data);
});
```

**Event Data**:

```json
{
  "sku": "5021;6",
  "name": "Mann Co. Supply Crate Key",
  "buy": { "keys": 0, "metal": 67.33 },
  "sell": { "keys": 0, "metal": 68.11 },
  "time": 1640995200,
  "source": "bptf"
}
```

#### Listen for Key Price Updates

```javascript
socket.on('keyPrice', (data) => {
  console.log('Key price update:', data);
});
```

**Event Data**:

```json
{
  "buy": { "keys": 0, "metal": 67.33 },
  "sell": { "keys": 0, "metal": 68.11 },
  "timestamp": 1640995200
}
```

### Bot Events

#### Bot Switch Events

```javascript
socket.on('botSwitched', (data) => {
  console.log('Bot switched:', data);
});
```

**Event Data**:

```json
{
  "previousBot": "main-bot",
  "newBot": "unusual-bot",
  "timestamp": 1640995200
}
```

### Health Events

#### Connection Status

```javascript
socket.on('healthUpdate', (data) => {
  console.log('Health update:', data);
});
```

**Event Data**:

```json
{
  "status": "healthy",
  "database": "connected",
  "websocket": "active",
  "timestamp": 1640995200
}
```

## Error Responses

### Standard Error Format

```json
{
  "success": false,
  "error": {
    "code": "INVALID_SKU",
    "message": "Invalid item SKU provided",
    "details": "SKU must be in format 'defindex;quality'"
  }
}
```

### Common Error Codes

| Code              | Description                 | HTTP Status |
| ----------------- | --------------------------- | ----------- |
| `INVALID_SKU`     | Invalid item SKU format     | 400         |
| `ITEM_NOT_FOUND`  | Item not found in database  | 404         |
| `BOT_NOT_FOUND`   | Bot configuration not found | 404         |
| `INVALID_CONFIG`  | Invalid configuration       | 400         |
| `API_KEY_INVALID` | Invalid backpack.tf API key | 401         |
| `RATE_LIMITED`    | Too many requests           | 429         |
| `INTERNAL_ERROR`  | Server error                | 500         |

## Rate Limiting

### Limits

- **API Requests**: 100 requests per minute per IP
- **WebSocket Connections**: 10 concurrent connections per IP
- **Bot Operations**: 50 operations per minute per bot

### Rate Limit Headers

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

### Rate Limit Exceeded

```http
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1640995200

{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Rate limit exceeded",
    "retryAfter": 60
  }
}
```

## Code Examples

### Node.js Client

```javascript
const axios = require('axios');
const io = require('socket.io-client');

class AutopricerClient {
  constructor(baseUrl = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
    this.socket = io(baseUrl);
  }

  // Get item price
  async getPrice(sku) {
    try {
      const response = await axios.get(`${this.baseUrl}/api/items/${sku}`);
      return response.data.item;
    } catch (error) {
      throw new Error(`Failed to get price: ${error.message}`);
    }
  }

  // Add item to pricelist
  async addItem(sku, min, max) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/bot/add`,
        `sku=${sku}&min=${min}&max=${max}`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      return response.data;
    } catch (error) {
      throw new Error(`Failed to add item: ${error.message}`);
    }
  }

  // Listen for price updates
  onPriceUpdate(callback) {
    this.socket.on('price', callback);
  }

  // Switch bot
  async switchBot(botId) {
    try {
      const response = await axios.post(`${this.baseUrl}/api/bot/switch`, {
        botId: botId,
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to switch bot: ${error.message}`);
    }
  }
}

// Usage
const client = new AutopricerClient();

// Get key price
client.getPrice('5021;6').then((price) => {
  console.log('Key price:', price);
});

// Listen for updates
client.onPriceUpdate((data) => {
  console.log('Price updated:', data);
});

// Add item to pricelist
client.addItem('5021;6', 1, 1).then((result) => {
  console.log('Item added:', result);
});
```

### Python Client

```python
import requests
import socketio

class AutopricerClient:
    def __init__(self, base_url='http://localhost:3000'):
        self.base_url = base_url
        self.sio = socketio.Client()

    def get_price(self, sku):
        """Get item price by SKU"""
        response = requests.get(f"{self.base_url}/api/items/{sku}")
        response.raise_for_status()
        return response.json()['item']

    def add_item(self, sku, min_qty, max_qty):
        """Add item to pricelist"""
        data = f"sku={sku}&min={min_qty}&max={max_qty}"
        headers = {'Content-Type': 'application/x-www-form-urlencoded'}
        response = requests.post(f"{self.base_url}/bot/add", data=data, headers=headers)
        response.raise_for_status()
        return response.json()

    def connect_websocket(self):
        """Connect to WebSocket for real-time updates"""
        @self.sio.event
        def price(data):
            print(f"Price update: {data}")

        self.sio.connect(self.base_url)

# Usage
client = AutopricerClient()

# Get key price
price = client.get_price('5021;6')
print(f"Key price: {price}")

# Add item
result = client.add_item('5021;6', 1, 1)
print(f"Added item: {result}")

# Connect for real-time updates
client.connect_websocket()
```

### cURL Examples

```bash
# Get item price
curl "http://localhost:3000/api/items/5021;6"

# Add item to pricelist
curl -X POST \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "sku=5021;6&min=1&max=1" \
  "http://localhost:3000/bot/add"

# Switch bot
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"botId": "unusual-bot"}' \
  "http://localhost:3000/api/bot/switch"

# Health check
curl "http://localhost:3000/api/health"
```

## Webhook Integration

### Configure Webhooks

```json
{
  "webhooks": {
    "priceUpdates": "https://your-server.com/price-webhook",
    "botEvents": "https://your-server.com/bot-webhook",
    "alerts": "https://your-server.com/alert-webhook"
  }
}
```

### Webhook Payload Examples

#### Price Update Webhook

```json
{
  "event": "priceUpdate",
  "timestamp": 1640995200,
  "data": {
    "sku": "5021;6",
    "name": "Mann Co. Supply Crate Key",
    "oldPrice": { "buy": 67.0, "sell": 68.0 },
    "newPrice": { "buy": 67.33, "sell": 68.11 }
  }
}
```

#### Bot Switch Webhook

```json
{
  "event": "botSwitch",
  "timestamp": 1640995200,
  "data": {
    "previousBot": "main-bot",
    "newBot": "unusual-bot",
    "user": "admin"
  }
}
```

## Next Steps

- **[Installation Guide](INSTALLATION.md)** - Setup instructions
- **[Configuration Reference](CONFIGURATION.md)** - All configuration options
- **[Troubleshooting](TROUBLESHOOTING.md)** - Common issues and solutions

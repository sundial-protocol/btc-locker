# BTC Locker Demo Server

A comprehensive demo server for the BTC Locker Bitcoin timelock library, featuring both interactive Swagger API documentation and traditional JSDoc documentation.

## Quick Start

### Option 1: Auto Setup (Recommended)

```bash
npm start
```

This will automatically:

- Start the demo server on http://localhost:3000
- Load all API endpoints with Swagger documentation
- Serve JSDoc documentation for the library
- Provide interactive API testing capabilities

### Option 2: Development Mode

```bash
# Run in development mode with auto-restart
npm run demo:dev
```

## Demo Features

### 🌐 Main Interface

- **Home Page**: http://localhost:3000 - Comprehensive overview with links to all features
- **Interactive Design**: Modern card-based layout with feature highlights
- **Quick Navigation**: Direct access to all documentation and testing tools

### 📚 API Documentation

#### Swagger/OpenAPI Documentation

- **Interactive API Docs**: http://localhost:3000/api-docs
- **OpenAPI Spec (JSON)**: http://localhost:3000/api-docs.json
- **Live Testing**: Test all API endpoints directly in the browser
- **Request/Response Examples**: Comprehensive examples for all operations
- **Schema Validation**: Real-time validation of API requests

#### Traditional JSDoc Documentation

- **Library Documentation**: http://localhost:3000/docs
- **Class Documentation**: Complete method and parameter documentation
- **Code Examples**: Usage examples for all functions
- **Inheritance Diagrams**: Clear class hierarchy and relationships

### 🔧 API Endpoints

The server provides a comprehensive REST API with the following endpoints:

#### Key Pair Management

- `POST /api/keypair/generate` - Generate new Bitcoin key pairs
- `POST /api/keypair/from-private-key` - Generate from existing private key

#### Timelock Scripts

- `POST /api/timelock/create` - Create absolute timelock scripts
- `POST /api/timelock/relative` - Create relative timelock scripts (CSV)

#### Transaction Management

- `POST /api/transactions/funding` - Create funding transactions
- `POST /api/transactions/spending` - Create spending transactions

#### Yield Distribution

- `POST /api/yield/distribute` - Distribute yield to timelock addresses

### 🛠️ Additional Features

#### CLI Tools

- **CLI Documentation**: http://localhost:3000/cli
- **Command Examples**: Complete CLI usage examples

#### Testing & Development

- **Test Bundle**: http://localhost:3000/test-bundle
- **Health Check**: http://localhost:3000/api/health
- **Bundle Info**: http://localhost:3000/api/bundle-info

## API Usage Examples

### Using Swagger Interactive Documentation

1. Visit http://localhost:3000/api-docs
2. Browse available endpoints organized by category
3. Click "Try it out" on any endpoint
4. Fill in request parameters and body
5. Execute the request and see live results
6. Copy generated code snippets for your application

### Direct API Calls

All endpoints accept JSON and return structured responses:

```javascript
// Generate a new key pair
const response = await fetch("http://localhost:3000/api/keypair/generate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ network: "testnet" }),
});
const keyPair = await response.json();

// Create a timelock script
const timelockResponse = await fetch(
  "http://localhost:3000/api/timelock/create",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      locktime: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      publicKey: keyPair.data.publicKey,
      network: "testnet",
    }),
  }
);
const script = await timelockResponse.json();

// Create a spending transaction
const txResponse = await fetch(
  "http://localhost:3000/api/transactions/spending",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      inputs: [{ txid: "abcd...", vout: 0, value: 100000 }],
      outputs: [{ address: "tb1...", value: 95000 }],
      redeemScript: script.data.redeemScript,
      privateKeys: [keyPair.data.privateKey],
      network: "testnet",
    }),
  }
);
const transaction = await txResponse.json();
```

## Demo Scenarios

### 1. Interactive API Testing

1. Visit the Swagger documentation at http://localhost:3000/api-docs
2. Explore the available endpoints and their parameters
3. Use the "Try it out" feature to test endpoints live
4. Generate key pairs, create scripts, and build transactions
5. View detailed request/response examples

### 2. Traditional Documentation Browse

1. Access JSDoc documentation at http://localhost:3000/docs
2. Browse class documentation and method signatures
3. Review code examples and parameter descriptions
4. Understand the library architecture and inheritance

### 3. CLI Integration

1. Review CLI documentation at http://localhost:3000/cli
2. Test command-line operations
3. Compare CLI and API approaches

## Server Architecture

The demo server provides a comprehensive API and documentation platform:

### Express.js Backend

- **RESTful API**: Complete REST API with all BTC Locker functionality
- **Swagger Integration**: Interactive API documentation with live testing
- **Static File Serving**: Serves JSDoc documentation and assets
- **Error Handling**: Comprehensive error responses with proper HTTP codes
- **CORS Support**: Cross-origin requests for browser testing

### Documentation System

- **Dual Documentation**: Both interactive Swagger and traditional JSDoc
- **Live Examples**: Working code examples with real responses
- **Schema Validation**: Request/response validation with detailed schemas
- **Export Capabilities**: Download OpenAPI specs and code snippets

## Environment Configuration

```bash
# Server configuration
PORT=3000                    # Server port (default: 3000)
NODE_ENV=production         # Environment mode

# API configuration
BITCOIN_NETWORK=testnet     # Default Bitcoin network
```

## Development

### File Structure

```
├── demo-server.js          # Express server with API routes
├── api-routes.js           # REST API endpoint definitions
├── home.html              # Landing page with feature overview
├── swagger.config.js       # OpenAPI/Swagger configuration
├── docs/                   # Generated JSDoc documentation
├── dist/                   # Built library bundle
└── examples/               # Usage examples
```

### API Response Format

All API endpoints return standardized responses:

```javascript
// Success response
{
  "success": true,
  "data": { /* endpoint-specific data */ },
  "message": "Operation completed successfully"
}

// Error response
{
  "success": false,
  "error": "Error description",
  "code": "ERROR_CODE",
  "details": { /* additional error context */ }
}
```

## Security Notes

✅ **Enhanced Security with Server API**

- Server-side validation of all requests
- Secure private key handling with validation
- Comprehensive input sanitization
- Proper error handling without information leakage
- Rate limiting and request validation

⚠️ **Testing Guidelines**

- Always use testnet for development and testing
- Never use real mainnet private keys in demos
- API requests are logged for debugging (avoid sensitive data)
- Use HTTPS in production environments

## Troubleshooting

### Common Issues

**Server won't start:**

```bash
# Check if port is in use
netstat -ano | findstr :3000
# Use different port
PORT=3001 npm start
```

**Swagger documentation not loading:**

```bash
# Regenerate documentation
npm run docs
# Check swagger configuration
curl http://localhost:3000/api-docs.json
```

**API endpoints returning errors:**

```bash
# Check server health
curl http://localhost:3000/api/health
# View detailed error logs in server console
```

### API Testing

Test endpoints with curl:

```bash
# Health check
curl http://localhost:3000/api/health

# Generate key pair
curl -X POST http://localhost:3000/api/keypair/generate \
  -H "Content-Type: application/json" \
  -d '{"network":"testnet"}'

# Get OpenAPI specification
curl http://localhost:3000/api-docs.json
```

### Getting Help

- **Interactive Docs**: Use Swagger UI at http://localhost:3000/api-docs for live testing
- **Server Logs**: Check console output for detailed error messages
- **API Health**: Visit http://localhost:3000/api/health for server status
- **Documentation**: Browse http://localhost:3000/docs for library documentation
- **GitHub**: Visit https://github.com/sundial-protocol/btc-locker for issues and updates

## Production Deployment

### Environment Setup

```bash
# Production environment
NODE_ENV=production
PORT=443
HTTPS_CERT_PATH=/path/to/cert.pem
HTTPS_KEY_PATH=/path/to/key.pem
```

### Security Considerations

- Enable HTTPS in production
- Implement rate limiting
- Add authentication for sensitive endpoints
- Use environment variables for configuration
- Monitor API usage and errors
- Regular security updates

### Scaling

- Use process managers (PM2, forever)
- Implement load balancing
- Add monitoring and logging
- Cache static assets
- Database integration for persistence

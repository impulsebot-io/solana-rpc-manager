# Solana RPC Connection Manager

A TypeScript library for managing, load-balancing, and providing automatic failover between Solana RPC endpoints.

## Features

- **Connection Health Monitoring**: Automatically monitors the health of RPC endpoints by checking their block heights
- **Load Balancing**: Randomly distributes RPC calls across healthy endpoints
- **Automatic Failover**: Switches to alternative endpoints when the current one fails
- **Retry Mechanism**: Configurable retry logic for RPC method calls
- **Timeout Support**: Automatically cancels long-running RPC calls
- **Multiple RPC Sources**: Supports loading RPC endpoints from file or configuration

## Installation

```bash
npm install solana-rpc-manager
```

## Quick Start

```typescript
import { createRpcManager } from 'solana-rpc-manager';
import { PublicKey } from '@solana/web3.js';

async function main() {
  // Create and initialize the RPC manager
  const rpcManager = await createRpcManager({
    // Optionally provide custom endpoints
    customRpcEndpoints: [
      'https://solana-rpc.publicnode.com',
      'https://api.mainnet-beta.solana.com'
    ],
    // Optionally load endpoints from a file
    rpcHostsFilePath: './rpcHosts.json'
  });

  // Execute an RPC call with automatic retry and failover
  const accountKey = new PublicKey('H5Wuy51jEAV9mrDFUVbNsrSMcBckgHCqmc1r45e7ztVo');
  
  const balance = await rpcManager.executeWithRetry(
    (connection) => connection.getTokenAccountBalance(accountKey),
    {
      maxRetries: 3,
      timeoutMs: 5000
    }
  );
  
  console.log('Token balance:', balance.value);
  
  // Clean up when done
  rpcManager.dispose();
}

main();
```

## Usage Guide

### Initialization

Create an RPC manager with default settings:

```typescript
import { SolanaRpcManager } from 'solana-rpc-manager';

const rpcManager = new SolanaRpcManager();
await rpcManager.initialize();
```

Or with custom configuration:

```typescript
const rpcManager = new SolanaRpcManager({
  defaultNetwork: 'mainnet-beta',
  officialRpcEndpoint: 'https://api.mainnet-beta.solana.com',
  maxBlockDelay: 30,
  healthCheckIntervalMs: 5 * 60 * 1000, // 5 minutes
  defaultTimeoutMs: 30000, // 30 seconds
  defaultMaxRetries: 5,
  rpcHostsFilePath: './rpcHosts.json',
  customRpcEndpoints: [
    'https://solana-rpc.publicnode.com',
    'https://solana.rpc.service.com'
  ],
  logLevel: 3 // 0: none, 1: errors, 2: warnings, 3: info, 4: debug
});

await rpcManager.initialize();
```

### Getting a Connection

Get a random healthy connection:

```typescript
const connection = rpcManager.getConnection();

// Use the connection directly
const balance = await connection.getBalance(publicKey);
```

### Executing RPC Methods with Retry

Use the retry mechanism for more reliable RPC calls:

```typescript
const result = await rpcManager.executeWithRetry(
  (connection) => connection.getAccountInfo(publicKey),
  {
    maxRetries: 3,
    timeoutMs: 5000
  }
);
```

### Checking Connection Health

You can manually trigger a health check:

```typescript
await rpcManager.updateHealthyConnections();
```

### Getting Statistics

Get information about the current state of connections:

```typescript
const stats = rpcManager.getStats();
console.log(`Healthy connections: ${stats.healthyConnections['mainnet-beta']}/${stats.totalConnections['mainnet-beta']}`);
console.log('Healthy endpoints:', stats.healthyEndpoints['mainnet-beta']);
```

### Cleaning Up

When you're done with the RPC manager, dispose of it to clean up resources:

```typescript
rpcManager.dispose();
```

## RPC Endpoints File

You can maintain a list of RPC endpoints in a JSON file:

```json
[
  "endpoint1.com:8899",
  "endpoint2.com:8899",
  "https://endpoint3.com"
]
```

Endpoints without a protocol will be prefixed with "http://".

## Working with the Solana RPC Validator

This library works well with the [Solana RPC Validator](https://github.com/impulsebot-io/solana-rpc-validator) tool, which can automatically discover and validate Solana RPC endpoints.

1. Run the Solana RPC Validator to generate an `rpcHosts.json` file.
2. Configure the RPC Manager to use this file:

```typescript
const rpcManager = new SolanaRpcManager({
  rpcHostsFilePath: './rpcHosts.json'
});
```

## API Reference

### `SolanaRpcManager`

The main class for managing RPC connections.

#### Constructor

```typescript
constructor(config: Partial<RpcManagerConfig> = {})
```

#### Methods

- `async initialize()`: Initializes connections from configured sources
- `async updateHealthyConnections()`: Updates the list of healthy connections
- `getConnection(network?: string)`: Gets a random healthy connection
- `async executeWithRetry<T>(rpcMethod, options)`: Executes an RPC method with retry
- `getStats()`: Gets statistics about connections
- `dispose()`: Cleans up resources

### `createRpcManager`

A convenience function for creating and initializing an RPC manager.

```typescript
async function createRpcManager(config: Partial<RpcManagerConfig> = {}): Promise<SolanaRpcManager>
```

## Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `defaultNetwork` | Default network to use | 'mainnet-beta' |
| `officialRpcEndpoint` | Official RPC endpoint for the network | 'https://api.mainnet-beta.solana.com' |
| `maxBlockDelay` | Maximum acceptable block delay | 30 |
| `healthCheckIntervalMs` | Interval for health checks | 5 * 60 * 1000 (5 minutes) |
| `defaultTimeoutMs` | Default timeout for RPC calls | 30000 (30 seconds) |
| `defaultMaxRetries` | Default number of retries | 5 |
| `rpcHostsFilePath` | Path to JSON file with RPC hosts | undefined |
| `customRpcEndpoints` | Array of custom RPC endpoints | undefined |
| `logLevel` | Log level (0-4) | 2 (warnings and errors) |

## License

MIT

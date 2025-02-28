/**
 * Solana RPC Connection Manager
 *
 * A TypeScript library for managing and load-balancing Solana RPC connections.
 * Features include:
 * - Connection health monitoring and validation
 * - Automatic failover between healthy endpoints
 * - Retry mechanisms for RPC calls
 * - Support for custom RPC endpoints
 */

import { Connection } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Configuration options for the RPC Connection Manager
 */
export interface RpcManagerConfig {
    /** Default network to use (e.g., 'mainnet-beta', 'devnet', 'testnet') */
    defaultNetwork: string;

    /** Official RPC endpoint for the network used as a reference */
    officialRpcEndpoint: string;

    /** Maximum acceptable block delay compared to the official endpoint */
    maxBlockDelay: number;

    /** Interval in milliseconds to check for endpoint health */
    healthCheckIntervalMs: number;

    /** Default timeout for RPC method calls in milliseconds */
    defaultTimeoutMs: number;

    /** Default number of retries for RPC method calls */
    defaultMaxRetries: number;

    /** Path to a JSON file containing additional RPC hosts */
    rpcHostsFilePath?: string;

    /** Array of custom RPC endpoints to use in addition to or instead of the file */
    customRpcEndpoints?: string[];

    /** Log level (0: none, 1: errors, 2: warnings, 3: info, 4: debug) */
    logLevel: number;
}

/**
 * Default configuration for the RPC Connection Manager
 */
const DEFAULT_CONFIG: RpcManagerConfig = {
    defaultNetwork: 'mainnet-beta',
        officialRpcEndpoint: 'https://api.mainnet-beta.solana.com',
        maxBlockDelay: 30,
        healthCheckIntervalMs: 5 * 60 * 1000, // 5 minutes
        defaultTimeoutMs: 30000, // 30 seconds
        defaultMaxRetries: 5,
        logLevel: 2 // Warnings and errors by default
};

/**
 * Class for managing and load-balancing Solana RPC connections
 */
export class SolanaRpcManager {
    private config: RpcManagerConfig;
    private allConnections: Map<string, Connection[]> = new Map();
    private healthyConnections: Map<string, Connection[]> = new Map();
    private healthCheckInterval: NodeJS.Timeout | null = null;

    /**
     * Creates a new Solana RPC Connection Manager
     * @param config Configuration options for the manager
     */
    constructor(config: Partial<RpcManagerConfig> = {}) {
        // Merge the provided config with the default config
        this.config = { ...DEFAULT_CONFIG, ...config };

        // Initialize the connection maps
        this.allConnections.set(this.config.defaultNetwork, []);
        this.healthyConnections.set(this.config.defaultNetwork, []);

        this.log(3, 'SolanaRpcManager initialized with config:', this.config);
    }

    /**
     * Initializes the RPC connections from the configured sources
     */
    public async initialize(): Promise<void> {
        this.log(3, 'Initializing RPC connections...');

        try {
            // Load RPC endpoints from all sources
            const endpoints = await this.loadRpcEndpoints();

            if (endpoints.length === 0) {
                this.log(2, 'No RPC endpoints found. Using official endpoint as fallback.');
                endpoints.push(this.config.officialRpcEndpoint);
            }

            // Create Connection instances for each endpoint
            const connections = endpoints.map(endpoint =>
            new Connection(endpoint, 'confirmed')
            );

            // Store the connections
            this.allConnections.set(this.config.defaultNetwork, connections);
            this.log(3, `Initialized ${connections.length} connections for ${this.config.defaultNetwork}`);

            // Perform an initial health check
            await this.updateHealthyConnections();

            // Start the health check interval
            this.startHealthCheck();
        } catch (error) {
            this.log(1, 'Failed to initialize connections:', error);
            throw error;
        }
    }

    /**
     * Loads RPC endpoints from all configured sources
     */
    private async loadRpcEndpoints(): Promise<string[]> {
        const endpoints: Set<string> = new Set();

        // Add custom endpoints if provided
        if (this.config.customRpcEndpoints && this.config.customRpcEndpoints.length > 0) {
            this.config.customRpcEndpoints.forEach(endpoint => endpoints.add(endpoint));
            this.log(3, `Added ${this.config.customRpcEndpoints.length} custom endpoints`);
        }

        // Load endpoints from file if provided
        if (this.config.rpcHostsFilePath) {
            try {
                if (fs.existsSync(this.config.rpcHostsFilePath)) {
                    const fileContent = fs.readFileSync(this.config.rpcHostsFilePath, 'utf-8');
                    const hostsFromFile = JSON.parse(fileContent) as string[];

                    // Add each host from the file, ensuring proper URL format
                    hostsFromFile.forEach(host => {
                        // If the host doesn't start with http:// or https://, assume http://
                        const endpoint = host.startsWith('http') ? host : `http://${host}`;
                        endpoints.add(endpoint);
                    });

                    this.log(3, `Loaded ${hostsFromFile.length} endpoints from file`);
                } else {
                    this.log(2, `RPC hosts file not found at ${this.config.rpcHostsFilePath}`);
                }
            } catch (error) {
                this.log(1, 'Failed to load endpoints from file:', error);
            }
        }

        // Always include the official endpoint
        endpoints.add(this.config.officialRpcEndpoint);

        return Array.from(endpoints);
    }

    /**
     * Starts the health check interval
     */
    private startHealthCheck(): void {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        this.healthCheckInterval = setInterval(
            () => this.updateHealthyConnections(),
            this.config.healthCheckIntervalMs
        );

        this.log(3, `Health check interval started with ${this.config.healthCheckIntervalMs}ms interval`);
    }

    /**
     * Stops the health check interval
     */
    public stopHealthCheck(): void {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
            this.log(3, 'Health check interval stopped');
        }
    }

    /**
     * Updates the list of healthy connections
     */
    public async updateHealthyConnections(): Promise<void> {
        this.log(3, 'Updating healthy connections...');

        try {
            // Get the current block from the official endpoint
            const officialBlock = await this.getCurrentBlock(this.config.officialRpcEndpoint);

            if (!officialBlock) {
                this.log(2, 'Failed to fetch block from official endpoint, skipping health check');
                return;
            }

            this.log(4, `Official block: ${officialBlock}`);

            // Check each endpoint's health
            for (const [network, connections] of this.allConnections.entries()) {
                const healthyEndpoints: Connection[] = [];

                for (const connection of connections) {
                    const rpcEndpoint = connection.rpcEndpoint;
                    const currentBlock = await this.getCurrentBlock(rpcEndpoint);

                    if (currentBlock !== null &&
                        officialBlock - currentBlock <= this.config.maxBlockDelay) {
                        healthyEndpoints.push(connection);
                    this.log(4, `Healthy endpoint: ${rpcEndpoint}, block: ${currentBlock}`);
                        } else {
                            this.log(2, `Unhealthy endpoint: ${rpcEndpoint}, block: ${currentBlock}`);
                        }
                }

                // Update the healthy connections map
                this.healthyConnections.set(network, healthyEndpoints);
                this.log(3, `Updated healthy connections for ${network}: ${healthyEndpoints.length}/${connections.length}`);
            }
        } catch (error) {
            this.log(1, 'Failed to update healthy connections:', error);
        }
    }

    /**
     * Gets the current block height from an RPC endpoint
     * @param rpcEndpoint The RPC endpoint URL
     * @returns The current block height or null if the request failed
     */
    private async getCurrentBlock(rpcEndpoint: string): Promise<number | null> {
        try {
            const connection = new Connection(rpcEndpoint);
            const block = await connection.getSlot();
            return block;
        } catch (error) {
            this.log(2, `Failed to fetch block for ${rpcEndpoint}:`, error);
            return null;
        }
    }

    /**
     * Gets a random healthy connection for the specified network
     * @param network Network name (defaults to the configured default network)
     * @returns A Connection instance or null if no healthy connections are available
     */
    public getConnection(network: string = this.config.defaultNetwork): Connection | null {
        // Get healthy connections for the network
        const connections = this.healthyConnections.get(network) || [];

        if (connections.length === 0) {
            this.log(2, `No healthy connections available for ${network}`);

            // Fall back to any connection
            const allNetworkConnections = this.allConnections.get(network) || [];

            if (allNetworkConnections.length > 0) {
                const randomIndex = Math.floor(Math.random() * allNetworkConnections.length);
                const fallbackConnection = allNetworkConnections[randomIndex];
                this.log(2, `Falling back to potentially unhealthy connection: ${fallbackConnection.rpcEndpoint}`);
                return fallbackConnection;
            }

            // Create a new connection to the official endpoint as a last resort
            this.log(2, `Falling back to official endpoint: ${this.config.officialRpcEndpoint}`);
            return new Connection(this.config.officialRpcEndpoint);
        }

        // Return a random healthy connection
        const randomIndex = Math.floor(Math.random() * connections.length);
        const connection = connections[randomIndex];

        this.log(4, `Selected connection: ${connection.rpcEndpoint}`);
        return connection;
    }

    /**
     * Executes an RPC method with automatic retries and timeout
     * @param rpcMethod Function that takes a Connection and returns a Promise
     * @param options Options for the retry mechanism
     * @returns A Promise that resolves to the result of the RPC method
     */
    public async executeWithRetry<T>(
        rpcMethod: (connection: Connection) => Promise<T>,
                                     options: {
                                         network?: string;
                                         maxRetries?: number;
                                         timeoutMs?: number;
                                         forceHealthCheck?: boolean;
                                     } = {}
    ): Promise<T> {
        const {
            network = this.config.defaultNetwork,
            maxRetries = this.config.defaultMaxRetries,
            timeoutMs = this.config.defaultTimeoutMs,
            forceHealthCheck = false
        } = options;

        // Optionally perform a health check before execution
        if (forceHealthCheck) {
            await this.updateHealthyConnections();
        }

        let attempt = 0;
        let lastError: Error | null = null;

        while (attempt < maxRetries) {
            const connection = this.getConnection(network);

            if (!connection) {
                throw new Error(`No available RPC connections for network: ${network}`);
            }

            try {
                // Create a timeout promise
                const timeoutPromise = new Promise<never>((_, reject) => {
                    setTimeout(() => reject(new Error(`RPC call timed out after ${timeoutMs}ms`)), timeoutMs);
                });

                // Race the RPC method against the timeout
                const result = await Promise.race([
                    rpcMethod(connection),
                                                  timeoutPromise
                ]);

                return result as T;
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                this.log(2, `RPC call failed (attempt ${attempt + 1}/${maxRetries}): ${connection.rpcEndpoint}`, lastError);
                attempt++;
            }
        }

        this.log(1, 'All RPC retries failed');
        throw lastError || new Error('RPC call failed after multiple retries');
    }

    /**
     * Internal logging method that respects the configured log level
     * @param level Log level of the message
     * @param message Primary message to log
     * @param additional Additional data to log
     */
    private log(level: number, message: string, additional?: any): void {
        if (level <= this.config.logLevel) {
            const prefix = ['ERROR', 'WARN', 'INFO', 'DEBUG'][Math.min(level - 1, 3)];
            console.log(`[SolanaRpcManager] [${prefix}] ${message}`);

            if (additional !== undefined && level <= this.config.logLevel) {
                if (additional instanceof Error) {
                    console.log(`  ${additional.message}`);
                    if (level === 4) {
                        console.log(`  ${additional.stack}`);
                    }
                } else {
                    console.log('  Additional info:', additional);
                }
            }
        }
    }

    /**
     * Gets statistics about the RPC connections
     * @returns Statistics about all connections and healthy connections
     */
    public getStats(): {
        totalConnections: { [network: string]: number };
        healthyConnections: { [network: string]: number };
        healthyEndpoints: { [network: string]: string[] };
    } {
        const stats = {
            totalConnections: {} as { [network: string]: number },
            healthyConnections: {} as { [network: string]: number },
            healthyEndpoints: {} as { [network: string]: string[] }
        };

        for (const [network, connections] of this.allConnections.entries()) {
            stats.totalConnections[network] = connections.length;

            const healthyConnections = this.healthyConnections.get(network) || [];
            stats.healthyConnections[network] = healthyConnections.length;
            stats.healthyEndpoints[network] = healthyConnections.map(conn => conn.rpcEndpoint);
        }

        return stats;
    }

    /**
     * Disposes the RPC manager, clearing intervals and cleaning up resources
     */
    public dispose(): void {
        this.stopHealthCheck();
        this.log(3, 'RPC Manager disposed');
    }
}

// Create and export a convenient shorthand function for quick initialization
export async function createRpcManager(config: Partial<RpcManagerConfig> = {}): Promise<SolanaRpcManager> {
    const manager = new SolanaRpcManager(config);
    await manager.initialize();
    return manager;
}

// Export default instance for direct usage
export default SolanaRpcManager;

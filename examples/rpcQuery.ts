/**
 * Example usage of the Solana RPC Connection Manager
 *
 * This file demonstrates how to initialize and use the SolanaRpcManager
 * in a typical application.
 */

import { PublicKey } from '@solana/web3.js';
import { SolanaRpcManager, createRpcManager } from '../src/index.ts';

async function exampleUsage() {
    console.log('Starting Solana RPC Manager example...');

    try {
        // Create and initialize the RPC manager
        const rpcManager = await createRpcManager({
            // Custom configuration (optional)
            defaultNetwork: 'mainnet-beta',
                rpcHostsFilePath: './rpcHosts.json',
                customRpcEndpoints: [
                    'https://solana-rpc.publicnode.com',
                    'https://api.mainnet-beta.solana.com'
                ],
                logLevel: 3, // INFO level
                healthCheckIntervalMs: 2 * 60 * 1000 // 2 minutes
        });

        console.log('RPC Manager initialized');

        // Get a health report
        const stats = rpcManager.getStats();
        console.log('RPC Connection Stats:', JSON.stringify(stats, null, 2));

        // Example: Get account info with retry
        const exampleAddress = new PublicKey('H5Wuy51jEAV9mrDFUVbNsrSMcBckgHCqmc1r45e7ztVo');

        console.log(`Fetching account info for ${exampleAddress.toString()}...`);

        const accountInfo = await rpcManager.executeWithRetry(
            (connection) => connection.getAccountInfo(exampleAddress),
            {
                maxRetries: 3,
                timeoutMs: 5000
            }
        );

        console.log('Account info:', accountInfo ? 'Found' : 'Not found');

        // Example: Get token account balance with retry
        console.log(`Fetching token balance for ${exampleAddress.toString()}...`);

        const balance = await rpcManager.executeWithRetry(
            (connection) => connection.getTokenAccountBalance(exampleAddress),
            {
                maxRetries: 3,
                timeoutMs: 5000
            }
        );

        console.log('Token balance:', balance?.value);

        // Example: Multiple parallel requests
        console.log('Executing multiple parallel requests...');

        const [supply, slot, blockTime] = await Promise.all([
            rpcManager.executeWithRetry((connection) => connection.getSupply()),
            rpcManager.executeWithRetry((connection) => connection.getSlot()),
            rpcManager.executeWithRetry((connection) => connection.getBlockTime(0))
        ]);

        console.log('Current supply:', supply.value.total);
        console.log('Current slot:', slot);
        console.log('Genesis block time:', new Date(blockTime! * 1000).toISOString());

        // Cleanup
        rpcManager.dispose();
        console.log('Example completed and RPC Manager disposed');
    } catch (error) {
        console.error('Example failed with error:', error);
    }
}

// Run the example if executed directly
exampleUsage();

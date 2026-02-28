const { Gateway, Wallets } = require('fabric-network');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

class FabricService {
    constructor() {
        this.gateway = null;
        this.network = null;
        this.contract = null;
        this.wallet = null;
    }

    async connect() {
        try {
            // Load connection profile
            const ccpPath = path.resolve(
                __dirname,
                '..',
                '..',
                '..',
                'organizations',
                'peerOrganizations',
                'farmer.freshroute.com',
                'connection-farmer.json',
            );
            const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

            // Create wallet
            const walletPath = path.join(process.cwd(), 'wallet');
            this.wallet = await Wallets.newFileSystemWallet(walletPath);

            // Check if identity exists
            const identity = await this.wallet.get('appUser');
            if (!identity) {
                logger.error('Identity "appUser" not found in wallet');
                logger.info('Run enrollUser.js to create the identity first');
                throw new Error('Identity not found in wallet');
            }

            // Create gateway
            this.gateway = new Gateway();
            await this.gateway.connect(ccp, {
                wallet: this.wallet,
                identity: 'appUser',
                discovery: { enabled: true, asLocalhost: true },
            });

            // Get network and contract
            this.network = await this.gateway.getNetwork('freshroute-channel');
            this.contract = this.network.getContract('freshroute');

            logger.info('Successfully connected to Fabric network');
        } catch (error) {
            logger.error('Failed to connect to Fabric network:', error);
            throw error;
        }
    }

    async disconnect() {
        if (this.gateway) {
            this.gateway.disconnect();
            logger.info('Disconnected from Fabric network');
        }
    }

    async query(functionName, args) {
        try {
            if (!this.contract) {
                throw new Error('Not connected to Fabric network');
            }

            logger.info(
                `Querying: ${functionName} with args: ${JSON.stringify(args)}`,
            );
            const result = await this.contract.evaluateTransaction(
                functionName,
                ...args,
            );
            return result.toString();
        } catch (error) {
            logger.error(`Query failed for ${functionName}:`, error);
            throw error;
        }
    }

    async invoke(functionName, args) {
        try {
            if (!this.contract) {
                throw new Error('Not connected to Fabric network');
            }

            logger.info(
                `Invoking: ${functionName} with args: ${JSON.stringify(args)}`,
            );
            const result = await this.contract.submitTransaction(
                functionName,
                ...args,
            );
            return result.toString();
        } catch (error) {
            logger.error(`Invoke failed for ${functionName}:`, error);
            throw error;
        }
    }

    async getBlockHeight() {
        try {
            const channel = this.network.getChannel();
            const blockHeight = await channel.queryInfo();
            return blockHeight.height.toInt();
        } catch (error) {
            logger.error('Failed to get block height:', error);
            throw error;
        }
    }
}

module.exports = new FabricService();

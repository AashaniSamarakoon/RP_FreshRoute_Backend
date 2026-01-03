const FabricCAServices = require('fabric-ca-client');
const { Wallets } = require('fabric-network');
const path = require('path');

// Connection details for your 3 specific CAs
const connectionConfig = {
    farmer:    { url: 'https://localhost:7054', name: 'ca.org1.example.com', mspId: 'Org1MSP' },
    buyer:     { url: 'https://localhost:8054', name: 'ca.org2.example.com', mspId: 'Org2MSP' },
    logistics: { url: 'https://localhost:11054', name: 'ca.org3.example.com', mspId: 'Org3MSP' }
};

async function registerAndEnrollUser(userId, role) {
    try {
        // 1. Select the correct CA based on the business role
        const config = connectionConfig[role];
        if (!config) throw new Error(`Invalid role: ${role}`);

        const ca = new FabricCAServices(config.url, undefined, config.name);
        const walletPath = path.join(process.cwd(), 'wallet');
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        // 2. Check if identity already exists
        if (await wallet.get(userId)) return true;

        // 3. Use the Admin of THAT specific Org to register
        const adminId = `admin.${config.mspId}`; // Keep admin names distinct in the wallet
        const adminIdentity = await wallet.get(adminId);
        if (!adminIdentity) throw new Error(`Admin for ${config.mspId} not found.`);

        const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
        const adminUser = await provider.getUserContext(adminIdentity, adminId);

        // 4. Register with Attribute-Based Access Control (ABAC)
        const secret = await ca.register({
            affiliation: `${role}.department1`,
            enrollmentID: userId,
            role: 'client',
            attrs: [{ name: 'role', value: role, ecert: true }]
        }, adminUser);

        // 5. Enroll
        const enrollment = await ca.enroll({ enrollmentID: userId, enrollmentSecret: secret });
        const x509Identity = {
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes(),
            },
            mspId: config.mspId,
            type: 'X.509',
        };

        await wallet.put(userId, x509Identity);
        console.log(`Successfully enrolled ${role} user ${userId} into ${config.mspId}`);
        return true;
    } catch (error) {
        console.error(`Error: ${error.message}`);
        return false;
    }
}
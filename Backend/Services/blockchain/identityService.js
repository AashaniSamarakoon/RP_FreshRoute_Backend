const FabricCAServices = require('fabric-ca-client');
const { Wallets } = require('fabric-network');
const path = require('path');

// Mapping your specific supply chain roles to the correct Network Organizations
const connectionConfig = {
    farmer:      { url: 'https://localhost:7054',  name: 'ca.org1.example.com',  mspId: 'Org1MSP' }, // Supplier
    buyer:       { url: 'https://localhost:8054',  name: 'ca.org2.example.com',  mspId: 'Org2MSP' }, // Consumer
    driver:      { url: 'https://localhost:11054', name: 'ca.org3.example.com', mspId: 'Org3MSP' }  // Logistics
};

async function registerAndEnrollUser(userId, role) {
    try {
        // 1. Determine which Org this user belongs to
        const config = connectionConfig[role];
        if (!config) throw new Error(`Business role '${role}' not mapped to an organization.`);

        const ca = new FabricCAServices(config.url, undefined, config.name);
        const walletPath = path.join(process.cwd(), 'wallet');
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        // 2. Check if the user already has a certificate
        const userIdentity = await wallet.get(userId);
        if (userIdentity) {
            console.log(`Identity for user ${userId} already exists in the wallet.`);
            return true;
        }

        // 3. Get the admin for the specific Org to authorize registration
        const adminId = `admin.${config.mspId}`; 
        const adminIdentity = await wallet.get(adminId);
        if (!adminIdentity) {
            throw new Error(`Admin identity '${adminId}' not found. Run enrollAdmin.js first.`);
        }

        const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
        const adminUser = await provider.getUserContext(adminIdentity, adminId);

        // 4. Register the user with ABAC attributes for your smart contracts
        // This 'role' attribute is what your chaincode uses to verify permissions.
        const secret = await ca.register({
            affiliation: 'org1.department1', // You can customize this per org if needed
            enrollmentID: userId,
            role: 'client',
            attrs: [{ name: 'role', value: role, ecert: true }]
        }, adminUser);

        // 5. Enroll the user (Generate the actual Private Key and Certificate)
        const enrollment = await ca.enroll({
            enrollmentID: userId,
            enrollmentSecret: secret
        });

        const x509Identity = {
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes(),
            },
            mspId: config.mspId,
            type: 'X.509',
        };

        // 6. Save to wallet named by Supabase UUID
        await wallet.put(userId, x509Identity);
        console.log(`Successfully enrolled ${role} user into ${config.mspId} (Wallet ID: ${userId})`);
        return true;

    } catch (error) {
        console.error(`Blockchain Registration Error: ${error.message}`);
        return false;
    }
}

module.exports = { registerAndEnrollUser };
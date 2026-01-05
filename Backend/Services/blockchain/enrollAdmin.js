const FabricCAServices = require('fabric-ca-client');
const { Wallets } = require('fabric-network');
const fs = require('fs');
const path = require('path');

const orgs = [
    { url: 'https://localhost:7054',  name: 'ca-org1', mspId: 'Org1MSP' }, // Supplier
    { url: 'https://localhost:8054',  name: 'ca-org2', mspId: 'Org2MSP' }, // Consumer
    { url: 'https://localhost:11054', name: 'ca-org3', mspId: 'Org3MSP' }  // Logistics
];

async function main() {
    try {
        // 1. Ensure the wallet directory exists in the Backend root
        const walletPath = path.join(process.cwd(), 'wallet');
        if (!fs.existsSync(walletPath)) {
            fs.mkdirSync(walletPath);
            console.log('Created wallet directory at:', walletPath);
        }

        const wallet = await Wallets.newFileSystemWallet(walletPath);

        for (const org of orgs) {
            const adminId = `admin.${org.mspId}`;

            // Check if already exists
            const identity = await wallet.get(adminId);
            if (identity) {
                console.log(`Admin identity '${adminId}' already exists in the wallet`);
                continue;
            }

            // 2. Enroll the admin user
            // Note: 'adminpw' is the default password in fabric-samples test-network
            const ca = new FabricCAServices(org.url, undefined, org.name);
            const enrollment = await ca.enroll({ enrollmentID: 'admin', enrollmentSecret: 'adminpw' });
            
            const x509Identity = {
                credentials: {
                    certificate: enrollment.certificate,
                    privateKey: enrollment.key.toBytes(),
                },
                mspId: org.mspId,
                type: 'X.509',
            };

            await wallet.put(adminId, x509Identity);
            console.log(`Successfully enrolled admin for ${org.mspId} and saved as ${adminId}.id`);
        }

    } catch (error) {
        console.error(`******** FAILED to enroll admin users: ${error}`);
        // Log details if it's a connection error
        if (error.message.includes('ECONNREFUSED')) {
            console.error('ERROR: Could not connect to Fabric CA. Is your Docker network running?');
        }
    }
}

main();
const { Wallets } = require('fabric-network');
const FabricCAServices = require('fabric-ca-client');
const path = require('path');
const fs = require('fs');

async function enrollAdmin() {
    try {
        // Choose organization - can be farmer, buyer, or transporter
        const org = process.env.ORG_NAME || 'farmer';

        // Load connection profile
        const ccpPath = path.resolve(
            __dirname,
            '..',
            '..',
            'organizations',
            'peerOrganizations',
            `${org}.freshroute.com`,
            `connection-${org}.json`,
        );

        if (!fs.existsSync(ccpPath)) {
            console.error(`Connection profile not found at: ${ccpPath}`);
            console.log('\nMake sure your FreshRoute network is running!');
            return;
        }

        const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

        // Create CA client
        const caInfo = ccp.certificateAuthorities[`ca.${org}.freshroute.com`];
        const caTLSCACerts = caInfo.tlsCACerts.pem;
        const ca = new FabricCAServices(
            caInfo.url,
            { trustedRoots: caTLSCACerts, verify: false },
            caInfo.caName,
        );

        // Create wallet
        const walletPath = path.join(__dirname, '..', 'wallet');
        const wallet = await Wallets.newFileSystemWallet(walletPath);
        console.log(`Wallet path: ${walletPath}`);

        // Check if admin already enrolled
        const identity = await wallet.get('admin');
        if (identity) {
            console.log('Admin identity already exists in wallet');
            return;
        }

        // Enroll admin
        const enrollment = await ca.enroll({
            enrollmentID: 'admin',
            enrollmentSecret: 'adminpw',
        });
        const x509Identity = {
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes(),
            },
            mspId: `${org.charAt(0).toUpperCase() + org.slice(1)}OrgMSP`,
            type: 'X.509',
        };

        await wallet.put('admin', x509Identity);
        console.log(
            'Successfully enrolled admin user and imported it into the wallet',
        );
    } catch (error) {
        console.error(`Failed to enroll admin user: ${error}`);
        process.exit(1);
    }
}

async function enrollUser(username = 'appUser') {
    try {
        const org = process.env.ORG_NAME || 'farmer';

        // Load connection profile
        const ccpPath = path.resolve(
            __dirname,
            '..',
            '..',
            'organizations',
            'peerOrganizations',
            `${org}.freshroute.com`,
            `connection-${org}.json`,
        );
        const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

        // Create CA client
        const caURL =
            ccp.certificateAuthorities[`ca.${org}.freshroute.com`].url;
        const ca = new FabricCAServices(caURL);

        // Create wallet
        const walletPath = path.join(__dirname, '..', 'wallet');
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        // Check if user already enrolled
        const userIdentity = await wallet.get(username);
        if (userIdentity) {
            console.log(
                `An identity for the user "${username}" already exists in the wallet`,
            );
            return;
        }

        // Check if admin exists
        const adminIdentity = await wallet.get('admin');
        if (!adminIdentity) {
            console.log('Admin identity does not exist in the wallet');
            console.log('Run enrollAdmin() first');
            return;
        }

        // Build user object
        const provider = wallet
            .getProviderRegistry()
            .getProvider(adminIdentity.type);
        const adminUser = await provider.getUserContext(adminIdentity, 'admin');

        // Register the user
        const secret = await ca.register(
            {
                affiliation: `${org}.department1`,
                enrollmentID: username,
                role: 'client',
            },
            adminUser,
        );

        // Enroll the user
        const enrollment = await ca.enroll({
            enrollmentID: username,
            enrollmentSecret: secret,
        });

        const x509Identity = {
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes(),
            },
            mspId: `${org.charAt(0).toUpperCase() + org.slice(1)}OrgMSP`,
            type: 'X.509',
        };

        await wallet.put(username, x509Identity);
        console.log(
            `Successfully registered and enrolled user "${username}" and imported it into the wallet`,
        );
    } catch (error) {
        console.error(`Failed to register user: ${error}`);
        process.exit(1);
    }
}

// Main execution
async function main() {
    const action = process.argv[2] || 'admin';
    const username = process.argv[3];

    console.log('\n=================================');
    console.log('FreshRoute User Enrollment');
    console.log('=================================\n');
    console.log(`Organization: ${process.env.ORG_NAME || 'farmer'}`);
    console.log(`Action: ${action}\n`);

    if (action === 'admin') {
        await enrollAdmin();
    } else if (action === 'user') {
        await enrollUser(username || 'appUser');
    } else {
        console.log('Usage:');
        console.log('  node enrollUser.js admin           - Enroll admin');
        console.log(
            '  node enrollUser.js user [username] - Enroll application user',
        );
        console.log(
            '\nSet ORG_NAME environment variable to choose organization (farmer, buyer, or transporter)',
        );
    }
}

main()
    .then(() => {
        console.log('\nEnrollment complete!');
    })
    .catch((error) => {
        console.error('Enrollment failed:', error);
        process.exit(1);
    });

module.exports = { enrollAdmin, enrollUser };

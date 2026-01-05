const { X509Certificate } = require('crypto');
const { Wallets } = require('fabric-network');
const path = require('path');
const fs = require('fs');

async function getDigitalPassport(userId) {
    try {
        // 1. Access the Wallet
        const walletPath = path.join(process.cwd(), 'wallet');
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        // 2. Get the Identity
        const identity = await wallet.get(userId);
        if (!identity) {
            throw new Error(`Identity for ${userId} not found in wallet`);
        }

        // 3. Parse the Certificate using Node's crypto module
        // identity.credentials.certificate contains the PEM string
        const x509 = new X509Certificate(identity.credentials.certificate);

        return {
            serialNumber: x509.serialNumber, // The Hex Serial (e.g., "4A:C2:...")
            issuer: x509.issuer.split('\n').join(', '), // "CN=fabric-ca-server, O=Hyperledger..."
            subject: x509.subject.split('\n').join(', '), // "CN=farmer1, OU=client..."
            validFrom: x509.validFrom,
            validTo: x509.validTo,
            fingerprint: x509.fingerprint // This is also cool to show!
        };

    } catch (error) {
        console.error("Error fetching passport:", error);
        return null;
    }
}

module.exports = { getDigitalPassport };
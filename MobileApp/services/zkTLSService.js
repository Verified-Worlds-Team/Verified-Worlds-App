// This file is part of the backend service for ZK-TLS proof management.
// It is responsible for handling proof verification and on-chain storage.

// Note: The @xion-mobile/wallet-client is for the mobile app and is not
// a dependency of the backend. Its usage has been commented out.
// const { SigningCosmWasmClient } = require('@cosmjs/cosmwasm-stargate');
// const { getWalletClient } = require('@xion-mobile/wallet-client'); 

const { logger } = require('../utils/logger');
const crypto = require('crypto');

// --- Reclaim App Details (from your account) ---
// You MUST replace these with your actual Reclaim Application ID and Secret
const RECLAIM_APP_ID = process.env.RECLAIM_APP_ID || 'your-reclaim-app-id';
const RECLAIM_APP_SECRET = process.env.RECLAIM_APP_SECRET || 'your-reclaim-app-secret';
const TWITTER_PROVIDER_ID = process.env.TWITTER_PROVIDER_ID || 'twitter-user-profile-provider-id'; // Replace with your actual httpProviderId

// --- Xion Blockchain Details ---
// These are not needed for this file's purpose on the backend,
// but they are kept for reference.
const XION_RPC = process.env.XION_RPC || 'https://rpc.xion-testnet.com';
const VERIFICATION_CONTRACT_ADDR = "xion1qf8jtznwf0tykpg7e65gwafwp47rwxl4x2g2kldvv357s6frcjlsh2m24e";
const RUM_CONTRACT_CODE_ID = 1289;
const RUM_CLAIM_KEY = "followers_count";


/**
 * Builds the verification URL for the Reclaim protocol.
 * @param {string} userId - The unique ID of the user.
 * @param {string} proofType - The type of proof to request (e.g., 'twitter_followers').
 * @param {string} callbackUrl - The URL where Reclaim will send the proof.
 * @returns {string} The complete URL to redirect the user to.
 */
const buildVerificationUrl = (userId, proofType, callbackUrl) => {
    if (!RECLAIM_APP_ID || !TWITTER_PROVIDER_ID) {
        throw new Error("Reclaim Application ID or Twitter Provider ID not configured.");
    }

    const sessionId = crypto.randomUUID(); // Unique session ID for each request
    const reclaimUrl = `https://api.reclaim.xyz/prove?app_id=${RECLAIM_APP_ID}&callback_url=${encodeURIComponent(callbackUrl)}&context=${userId}-${sessionId}&provider_id=${TWITTER_PROVIDER_ID}`;

    return reclaimUrl;
};

/**
 * Verifies the proof received from Reclaim.
 * IMPORTANT: This is a backend function. The on-chain storage logic has been
 * commented out as it requires a client-side wallet to sign transactions.
 * @param {string} proofData - The proof data string received from Reclaim's callback.
 * @returns {Promise<object>} The result of the verification.
 */
const verifyAndStoreProof = async (proofData) => {
    try {
        const verificationResult = JSON.parse(decodeURIComponent(proofData));

        if (!verificationResult || !verificationResult.proofs || verificationResult.proofs.length === 0) {
            throw new Error("Invalid proof data received.");
        }

        // 1. Extract and process proof data (this logic is correct)
        const proof = verificationResult.proofs[0];
        const claimInfo = {
            provider: proof.claimData.provider,
            parameters: proof.claimData.parameters,
            context: proof.claimData.context,
        };
        const signedClaim = {
            claim: {
                identifier: proof.claimData.identifier,
                owner: proof.claimData.owner,
                epoch: proof.claimData.epoch,
                timestampS: proof.claimData.timestampS,
            },
            signatures: proof.signatures,
        };

        // This is where you would perform server-side validation of the proof data.
        // This logic is separate from the on-chain transaction.
        logger.info('Proof data received and processed on the backend.');
        logger.info('Claim Info:', claimInfo);
        logger.info('Signed Claim:', signedClaim);

        // NOTE: The on-chain transaction part is commented out because it requires
        // a client-side wallet for signing. Your mobile app should handle this.
        /*
        // 2. On-chain storage logic (THIS IS COMMENTED OUT)
        const walletClient = await getWalletClient(XION_RPC);
        const account = walletClient.getAccount();
        let rumContractAddress = await instantiateRUMContract(account, walletClient);

        const executeMsg = {
            update: {
                value: {
                    proof: {
                        claimInfo: claimInfo,
                        signedClaim: signedClaim,
                    },
                },
            },
        };

        const executeResult = await walletClient.execute(
            account.address,
            rumContractAddress,
            executeMsg,
            "auto"
        );
        logger.info(`RUM contract update result: ${JSON.stringify(executeResult)}`);
        */

        return verificationResult;
    } catch (error) {
        logger.error("Error in verifyAndStoreProof:", error);
        throw error;
    }
};

/**
 * Instantiates the RUM contract.
 * THIS FUNCTION IS COMMENTED OUT as it requires a client-side wallet.
 */
/*
const instantiateRUMContract = async (account, client) => {
    if (!account?.bech32Address || !client) {
        throw new Error("Account or client not found.");
    }
    const instantiateMsg = {
        verification_addr: VERIFICATION_CONTRACT_ADDR,
        claim_key: RUM_CLAIM_KEY,
    };
    const instantiateResult = await client.instantiate(
        account?.bech32Address,
        RUM_CONTRACT_CODE_ID,
        instantiateMsg,
        "test-init",
        "auto"
    );
    logger.info("RUM contract instantiated:", instantiateResult.contractAddress);
    return instantiateResult.contractAddress;
};
*/

module.exports = {
    buildVerificationUrl,
    verifyAndStoreProof,
};

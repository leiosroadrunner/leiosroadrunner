const FETCH_TIMEOUT_MS = 6000;
const POLICY_ID = "2420237868d5c229c69592ed4282d17aa514bbbcac5d02bc0588e4884c65696f7320526f616472756e6e6572";

async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        return response;
    } finally {
        clearTimeout(timeout);
    }
}

exports.handler = async function(event, context) {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=60, max-age=60, stale-while-revalidate=30'
    };

    const apiKey = process.env.CARDANOSCAN_API_KEY;
    let holdersCount = null;
    let totalTx = null;
    let recentTransactions = [];

    try {
        // 1. Try Cardanoscan API if API Key is configured
        if (apiKey) {
            const apiOptions = {
                headers: {
                    'apiKey': apiKey,
                    'Accept': 'application/json'
                }
            };

            const tokenUrl = `https://api.cardanoscan.io/api/v1/token?policyId=${POLICY_ID}`;
            const tokenRes = await fetchWithTimeout(tokenUrl, apiOptions);
            if (tokenRes.ok) {
                const tokenData = await tokenRes.json();
                if (tokenData) {
                    if (tokenData.holderCount) holdersCount = Number(tokenData.holderCount).toLocaleString();
                    if (tokenData.totalCount) totalTx = Number(tokenData.totalCount).toLocaleString();
                }
            }

            const txUrl = `https://api.cardanoscan.io/api/v1/token/tx?policyId=${POLICY_ID}&limit=5`;
            const txRes = await fetchWithTimeout(txUrl, apiOptions);
            if (txRes.ok) {
                const txData = await txRes.json();
                if (txData && Array.isArray(txData.transactions)) {
                    const hexRegex = /^[a-fA-F0-9]{64}$/;
                    recentTransactions = txData.transactions
                        .filter(tx => tx.hash && hexRegex.test(tx.hash))
                        .map(tx => ({
                            hash: `${tx.hash.substring(0, 6)}...${tx.hash.substring(tx.hash.length - 4)}`,
                            fullHash: tx.hash,
                            time: tx.timestamp ? new Date(tx.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recent'
                        }));
                    if (!totalTx && txData.totalCount) {
                        totalTx = Number(txData.totalCount).toLocaleString();
                    }
                }
            }
        }

        // 2. If Cardanoscan data is missing, query the public Koios REST API (No API key needed)
        if (!holdersCount || !totalTx || recentTransactions.length === 0) {
            const koiosAssetUrl = `https://api.koios.rest/api/v1/asset_summary?_asset_policy=eq.${POLICY_ID}`;
            const koiosRes = await fetchWithTimeout(koiosAssetUrl);
            if (koiosRes.ok) {
                const koiosData = await koiosRes.json();
                if (Array.isArray(koiosData) && koiosData.length > 0) {
                    if (!holdersCount && koiosData[0].total_holders) {
                        holdersCount = Number(koiosData[0].total_holders).toLocaleString();
                    }
                    if (!totalTx && koiosData[0].total_transactions) {
                        totalTx = Number(koiosData[0].total_transactions).toLocaleString();
                    }
                }
            }

            // Fetch live asset transactions from Koios if recent transactions are empty
            if (recentTransactions.length === 0) {
                const koiosTxsUrl = `https://api.koios.rest/api/v1/asset_txs?_asset_policy=eq.${POLICY_ID}&limit=5`;
                const koiosTxsRes = await fetchWithTimeout(koiosTxsUrl);
                if (koiosTxsRes.ok) {
                    const koiosTxsData = await koiosTxsRes.json();
                    if (Array.isArray(koiosTxsData)) {
                        const hexRegex = /^[a-fA-F0-9]{64}$/;
                        recentTransactions = koiosTxsData
                            .filter(tx => tx.tx_hash && hexRegex.test(tx.tx_hash))
                            .map(tx => ({
                                hash: `${tx.tx_hash.substring(0, 6)}...${tx.tx_hash.substring(tx.tx_hash.length - 4)}`,
                                fullHash: tx.tx_hash,
                                time: tx.block_time ? new Date(tx.block_time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recent'
                            }));
                    }
                }
            }
        }

        // Fallbacks only if blockchain nodes are unreachable
        const finalHolders = holdersCount || "Connecting...";
        const finalTotalTx = totalTx || "Live";

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                holders: finalHolders,
                totalTxCount: finalTotalTx,
                recentTxs: recentTransactions
            })
        };
    } catch (error) {
        console.error("Live Telemetry fetch error:", error);
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                holders: "Syncing...",
                totalTxCount: "Live",
                recentTxs: []
            })
        };
    }
};

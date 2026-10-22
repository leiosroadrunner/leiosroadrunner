exports.handler = async function(event, context) {
    const apiKey = process.env.CARDANOSCAN_API_KEY;
    const policyId = "2420237868d5c229c69592ed4282d17aa514bbbcac5d02bc0588e4884c65696f7320526f616472756e6e6572";
    const bondingCurveAddress = "addr1xxg94wrfjcdsjncmsxtj0r87zk69e0jfl28n934sznu95tdj764lvrxdayh2ux30fl0ktuh27csgmpevdu89jlxppvrs2993lw";

    const addresses = {
        bondingCurve: bondingCurveAddress,
        creatorTurbo: "addr1qy798xhqarpk86qp40qpzq0dv3s66u3caw3tk8r249mj5vqzxrdfv2sszp8thpunhsctx6czxzpxz86kap4pgptkdmvqhguc44",
        creatorLace: "addr1qx84qzmwnh2fdhrnaha9g40vqvucauk2wya7dpgj9clr24jmfdmkddwwqmdjnu89mw6s5fc0yfxnc2ejjxkwlz499qdqpqjz8k",
        treasury: null 
    };

    try {
        // Fetch asset summary for holders and total transaction count
        const assetRes = await fetch(`https://api.cardanoscan.io/api/v1/asset?assetId=${policyId}`, {
            headers: { 'apiKey': apiKey || '' }
        });
        const assetData = await assetRes.json();
        const holders = assetData.holderCount || assetData.holders || 11;
        const totalTxCount = assetData.txCount || assetData.transactionCount || 185;

        // Fetch recent transactions for the bonding curve contract address
        const txRes = await fetch(`https://api.cardanoscan.io/api/v1/address/transaction?address=${bondingCurveAddress}&limit=5`, {
            headers: { 'apiKey': apiKey || '' }
        });
        const txData = await txRes.json();

        const rawTxs = txData.transactions || txData.list || txData.data || [];
        const recentTxs = rawTxs.map(tx => {
            const hash = tx.hash || tx.txId || "";
            return {
                hash: hash ? `${hash.substring(0, 6)}...${hash.substring(hash.length - 4)}` : "Live Tx",
                time: tx.timestamp ? formatTimeAgo(tx.timestamp) : "Recent",
                fullHash: hash || "#"
            };
        });

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                holders: Number(holders).toLocaleString(),
                totalTxCount: Number(totalTxCount).toLocaleString(),
                supply: "1,000,000,000",
                addresses: addresses,
                recentTxs: recentTxs
            })
        };
    } catch (error) {
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                holders: "11",
                totalTxCount: "185",
                supply: "1,000,000,000",
                addresses: addresses,
                recentTxs: []
            })
        };
    }
};

function formatTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp * 1000) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
}

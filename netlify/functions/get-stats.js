exports.handler = async function(event, context) {
    const apiKey = process.env.CARDANOSCAN_API_KEY;
    const policyId = "2420237868d5c229c69592ed4282d17aa514bbbcac5d02bc0588e4884c65696f7320526f616472756e6e6572";

    // Official Project Addresses
    const addresses = {
        bondingCurve: "addr1xxg94wrfjcdsjncmsxtj0r87zk69e0jfl28n934sznu95tdj764lvrxdayh2ux30fl0ktuh27csgmpevdu89jlxppvrs2993lw",
        creatorTurbo: "addr1qy798xhqarpk86qp40qpzq0dv3s66u3caw3tk8r249mj5vqzxrdfv2sszp8thpunhsctx6czxzpxz86kap4pgptkdmvqhguc44",
        creatorLace: "addr1qx84qzmwnh2fdhrnaha9g40vqvucauk2wya7dpgj9clr24jmfdmkddwwqmdjnu89mw6s5fc0yfxnc2ejjxkwlz499qdqpqjz8k",
        treasury: null 
    };

    try {
        // Query Cardanoscan API for main asset details
        const response = await fetch(`https://api.cardanoscan.io/api/v1/asset?assetId=${policyId}`, {
            headers: { 'apiKey': apiKey || '' }
        });
        
        const data = await response.json();
        
        // Pull exact on-chain metrics directly from Cardanoscan response
        const holders = data.holderCount || data.holders || 11;
        const totalTxCount = data.txCount || data.transactionCount || 0;
        
        // If Cardanoscan includes recent transactions in the asset object or separate list
        const rawTxs = data.transactions || data.recentTransactions || [];
        const recentTxs = rawTxs.map(tx => {
            const hash = tx.hash || tx.txId || "";
            return {
                hash: hash ? `${hash.substring(0, 6)}...${hash.substring(hash.length - 4)}` : "On-Chain",
                time: tx.timestamp ? new Date(tx.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Recent",
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
                totalTxCount: "0",
                supply: "1,000,000,000",
                addresses: addresses,
                recentTxs: []
            })
        };
    }
};

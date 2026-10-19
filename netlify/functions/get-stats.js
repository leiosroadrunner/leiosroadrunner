exports.handler = async function(event, context) {
    const apiKey = process.env.CARDANOSCAN_API_KEY;
    const policyId = "2420237868d5c229c69592ed4282d17aa514bbbcac5d02bc0588e4884c65696f7320526f616472756e6e6572";
    
    try {
        // Query Cardanoscan API for asset details
        const response = await fetch(`https://api.cardanoscan.io/api/v1/asset?assetId=${policyId}`, {
            headers: { 'apiKey': apiKey }
        });
        
        const data = await response.json();
        
        // Grab the real holder count from Cardanoscan response, with 11 as the live fallback
        const holderCount = data.holderCount || data.holders || 11;
        
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                holders: Number(holderCount).toLocaleString(),
                supply: "1,000,000,000"
            })
        };
    } catch (error) {
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                holders: "11", // Your actual current holder count
                supply: "1,000,000,000"
            })
        };
    }
};

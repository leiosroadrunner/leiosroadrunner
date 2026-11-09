
const FETCH_TIMEOUT_MS = 5000;

const POLICY_ID = '2420237868d5c229c69592ed4282d17aa514bbbcac5d02bc0588e488';

const FALLBACK_STATS = {
    holders: '1,420+',
    totalTxCount: '12,850+',
    recentTxs: []
};

const RESPONSE_HEADERS = {
    'Content-Type': 'application/json; charset=utf-8',

    // Let browsers revalidate, while Netlify handles shared CDN caching.
    'Cache-Control': 'public, max-age=0, must-revalidate',

    // Cache at Netlify's CDN for 60 seconds, with 30 seconds stale serving.
    'Netlify-CDN-Cache-Control':
        'public, max-age=60, stale-while-revalidate=30'
};

// Fetch and parse JSON within the same timeout.
async function fetchJsonWithTimeout(url, options = {}) {
    const controller = new AbortController();

    const timeout = setTimeout(
        () => controller.abort(),
        FETCH_TIMEOUT_MS
    );

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });

        if (!response.ok) {
            throw new Error(`Upstream HTTP ${response.status}`);
        }

        const contentType = response.headers.get('content-type') || '';

        if (!contentType.toLowerCase().includes('application/json')) {
            throw new Error('Unexpected upstream content type');
        }

        const data = await response.json();

        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            throw new Error('Invalid upstream JSON structure');
        }

        return data;

    } finally {
        clearTimeout(timeout);
    }
}

// Accept only valid, non-negative integer counts.
function parseCount(value) {
    const normalized = typeof value === 'string'
        ? value.replace(/,/g, '').trim()
        : value;

    const number = Number(normalized);

    if (!Number.isSafeInteger(number) || number < 0) {
        return null;
    }

    return number;
}

// Format timestamps without relying on the server's timezone.
function formatTimeAgo(timestamp) {
    const elapsed = Math.max(
        0,
        Math.floor(Date.now() / 1000 - timestamp)
    );

    if (elapsed < 10) return 'Just now';
    if (elapsed < 60) return `${elapsed}s ago`;

    const minutes = Math.floor(elapsed / 60);

    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);

    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);

    return `${days}d ago`;
}

exports.handler = async function(event) {

    // This endpoint is designed for public GET requests only.
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store',
                'Allow': 'GET'
            },
            body: JSON.stringify({
                error: 'Method not allowed'
            })
        };
    }

    const apiKey = process.env.CARDANOSCAN_API_KEY;

    let holdersCount = FALLBACK_STATS.holders;
    let totalTx = FALLBACK_STATS.totalTxCount;
    let recentTransactions = [];

    let successfulRequests = 0;

    if (!apiKey) {
        console.error('CARDANOSCAN_API_KEY is not configured.');
    } else {

        const apiOptions = {
            headers: {
                apiKey: apiKey,
                Accept: 'application/json'
            }
        };

        // Build API URLs using the 56-character policy ID.
        const tokenUrl = new URL(
            'https://api.cardanoscan.io/api/v1/token'
        );

        tokenUrl.searchParams.set('policyId', POLICY_ID);

        const txUrl = new URL(
            'https://api.cardanoscan.io/api/v1/token/tx'
        );

        txUrl.searchParams.set('policyId', POLICY_ID);
        txUrl.searchParams.set('limit', '5');

        // Execute both API requests concurrently.
        const [tokenResult, txResult] = await Promise.allSettled([
            fetchJsonWithTimeout(tokenUrl.toString(), apiOptions),
            fetchJsonWithTimeout(txUrl.toString(), apiOptions)
        ]);

        // Process token summary.
        if (tokenResult.status === 'fulfilled') {

            const tokenData = tokenResult.value;

            const holders = parseCount(tokenData.holderCount);

            if (holders !== null) {
                holdersCount = holders.toLocaleString('en-US');
                successfulRequests++;
            }

        } else {
            console.error(
                'CardanoScan token summary failed:',
                tokenResult.reason?.message || 'Unknown error'
            );
        }

        // Process recent token transactions.
        if (txResult.status === 'fulfilled') {

            const txData = txResult.value;

            if (Array.isArray(txData.transactions)) {

                const hexRegex = /^[a-fA-F0-9]{64}$/;

                recentTransactions = txData.transactions
                    .filter(tx =>
                        tx &&
                        typeof tx.hash === 'string' &&
                        hexRegex.test(tx.hash)
                    )
                    .slice(0, 5)
                    .map(tx => {

                        const timestamp = Number(tx.timestamp);

                        const validTimestamp =
                            Number.isFinite(timestamp) &&
                            timestamp > 0 &&
                            timestamp <= Date.now() / 1000 + 300;

                        return {
                            hash: `${tx.hash.substring(0, 6)}...${tx.hash.substring(60)}`,
                            fullHash: tx.hash,
                            time: validTimestamp
                                ? formatTimeAgo(timestamp)
                                : 'Recent'
                        };
                    });

                const transactionCount = parseCount(txData.totalCount);

                if (transactionCount !== null) {
                    totalTx = transactionCount.toLocaleString('en-US');
                }

                successfulRequests++;
            } else {
                console.error(
                    'CardanoScan returned an unexpected transaction structure.'
                );
            }

        } else {
            console.error(
                'CardanoScan transactions failed:',
                txResult.reason?.message || 'Unknown error'
            );
        }
    }

    const dataStatus =
        successfulRequests === 2 ? 'live' :
        successfulRequests === 1 ? 'partial' :
        'fallback';

    return {
        statusCode: 200,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({
            holders: holdersCount,
            totalTxCount: totalTx,
            recentTxs: recentTransactions,
            dataStatus: dataStatus
        })
    };
};

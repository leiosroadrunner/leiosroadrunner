
export const config = {
    path: "/.netlify/functions/get-stats",
    rateLimit: {
        windowSize: 60,
        windowLimit: 30,
        aggregateBy: ["ip"]
    }
};

const FETCH_TIMEOUT_MS = 6000;

const POLICY_ID =
    "2420237868d5c229c69592ed4282d17aa514bbbcac5d02bc0588e4884c65696f7320526f616472756e6e6572";

const BONDING_CURVE_ADDRESS =
    "addr1xxg94wrfjcdsjncmsxtj0r87zk69e0jfl28n934sznu95tdj764lvrxdayh2ux30fl0ktuh27csgmpevdu89jlxppvrs2993lw";

const ADDRESSES = {
    bondingCurve: BONDING_CURVE_ADDRESS,
    creatorTurbo: "addr1qy798xhqarpk86qp40qpzq0dv3s66u3caw3tk8r249mj5vqzxrdfv2sszp8thpunhsctx6czxzpxz86kap4pgptkdmvqhguc44",
    creatorLace: "addr1qx84qzmwnh2fdhrnaha9g40vqvucauk2wya7dpgj9clr24jmfdmkddwwqmdjnu89mw6s5fc0yfxnc2ejjxkwlz499qdqpqjz8k",
    treasury: null
};

const CACHE_HEADERS = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "public, max-age=0, must-revalidate",
    "Netlify-CDN-Cache-Control":
        "public, durable, max-age=60, stale-while-revalidate=30"
};

const DEFAULT_STATS = {
    holders: 11,
    totalTxCount: 185,
    supply: "1,000,000,000",
    addresses: ADDRESSES,
    recentTxs: []
};

// Validate non-negative integer counts.
function parseCount(value) {
    if (value === null || value === undefined) {
        return null;
    }

    if (
        typeof value !== "number" &&
        typeof value !== "string"
    ) {
        return null;
    }

    if (
        typeof value === "string" &&
        !/^\d+$/.test(value.trim())
    ) {
        return null;
    }

    const number = Number(value);

    return Number.isSafeInteger(number) && number >= 0
        ? number
        : null;
}

// Format CardanoScan Unix timestamps (seconds).
function formatTimeAgo(timestamp) {
    const value = Number(timestamp);

    if (!Number.isFinite(value) || value <= 0) {
        return "Recent";
    }

    const now = Date.now() / 1000;

    if (value > now + 300) {
        return "Recent";
    }

    const seconds = Math.max(
        0,
        Math.floor(now - value)
    );

    if (seconds < 60) return `${seconds}s ago`;

    const minutes = Math.floor(seconds / 60);

    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);

    if (hours < 24) return `${hours}h ago`;

    return `${Math.floor(hours / 24)}d ago`;
}

// Timeout covers both fetching and JSON parsing.
async function fetchJsonWithTimeout(url, headers) {
    const controller = new AbortController();

    const timeoutId = setTimeout(
        () => controller.abort(),
        FETCH_TIMEOUT_MS
    );

    try {
        const response = await fetch(url, {
            headers,
            signal: controller.signal
        });

        if (!response.ok) {
            throw new Error(
                `CardanoScan HTTP ${response.status}`
            );
        }

        const contentType =
            response.headers.get("content-type") || "";

        if (
            contentType &&
            !contentType.toLowerCase().includes("json")
        ) {
            throw new Error("Unexpected upstream content type");
        }

        return await response.json();

    } finally {
        clearTimeout(timeoutId);
    }
}

// Standard JSON response for modern Netlify Functions.
function jsonResponse(data, status = 200, noStore = false) {
    const headers = new Headers(
        noStore
            ? {
                "Content-Type": "application/json; charset=utf-8",
                "Cache-Control": "no-store"
            }
            : CACHE_HEADERS
    );

    if (status === 405) {
        headers.set("Allow", "GET");
    }

    return new Response(JSON.stringify(data), {
        status,
        headers
    });
}

export default async function handler(request, context) {

    // Strict GET-only restriction.
    if (request.method !== "GET") {
        return jsonResponse(
            { error: "Method Not Allowed" },
            405,
            true
        );
    }

    let holders = DEFAULT_STATS.holders;
    let totalTxCount = DEFAULT_STATS.totalTxCount;
    let recentTxs = [];

    const apiKey = process.env.CARDANOSCAN_API_KEY;

    if (!apiKey) {
        console.error(
            "CARDANOSCAN_API_KEY is not configured."
        );

        return jsonResponse({
            holders: holders.toLocaleString("en-US"),
            totalTxCount: totalTxCount.toLocaleString("en-US"),
            supply: DEFAULT_STATS.supply,
            addresses: ADDRESSES,
            recentTxs
        });
    }

    const apiHeaders = {
        apiKey,
        Accept: "application/json"
    };

    try {
        // CardanoScan asset statistics.
        const assetPromise = (async () => {

            const url = new URL(
                "https://api.cardanoscan.io/api/v1/asset"
            );

            url.searchParams.set("assetId", POLICY_ID);

            const data = await fetchJsonWithTimeout(
                url.toString(),
                apiHeaders
            );

            const validHolders = parseCount(
                data?.holderCount ?? data?.holders
            );

            const validTransactions = parseCount(
                data?.txCount ?? data?.transactionCount
            );

            if (validHolders !== null) {
                holders = validHolders;
            }

            if (validTransactions !== null) {
                totalTxCount = validTransactions;
            }

        })();

        // CardanoScan bonding-curve transactions.
        const txPromise = (async () => {

            const url = new URL(
                "https://api.cardanoscan.io/api/v1/address/transaction"
            );

            url.searchParams.set(
                "address",
                BONDING_CURVE_ADDRESS
            );

            url.searchParams.set("limit", "5");

            const data = await fetchJsonWithTimeout(
                url.toString(),
                apiHeaders
            );

            const rawTxs = [
                data?.transactions,
                data?.list,
                data?.data
            ].find(Array.isArray) || [];

            const hexRegex = /^[a-fA-F0-9]{64}$/;

            recentTxs = rawTxs
                .slice(0, 5)
                .flatMap(tx => {

                    if (
                        !tx ||
                        typeof tx !== "object"
                    ) {
                        return [];
                    }

                    const hash =
                        typeof tx.hash === "string"
                            ? tx.hash
                            : typeof tx.txId === "string"
                                ? tx.txId
                                : "";

                    if (!hexRegex.test(hash)) {
                        return [];
                    }

                    return [{
                        hash: `${hash.substring(0, 6)}...${hash.substring(60)}`,
                        fullHash: hash,
                        time: tx.timestamp
                            ? formatTimeAgo(tx.timestamp)
                            : "Recent"
                    }];
                });

        })();

        // One failed endpoint does not discard successful results.
        const results = await Promise.allSettled([
            assetPromise,
            txPromise
        ]);

        results.forEach((result, index) => {

            if (result.status === "rejected") {
                console.error(
                    index === 0
                        ? "Asset API request failed:"
                        : "Transaction API request failed:",
                    result.reason?.message || "Unknown error"
                );
            }

        });

        return jsonResponse({
            holders: holders.toLocaleString("en-US"),
            totalTxCount: totalTxCount.toLocaleString("en-US"),
            supply: DEFAULT_STATS.supply,
            addresses: ADDRESSES,
            recentTxs
        });

    } catch (error) {

        console.error(
            "Telemetry function error:",
            error?.message || "Unknown error"
        );

        return jsonResponse({
            holders: holders.toLocaleString("en-US"),
            totalTxCount: totalTxCount.toLocaleString("en-US"),
            supply: DEFAULT_STATS.supply,
            addresses: ADDRESSES,
            recentTxs
        });
    }
}

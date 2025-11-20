"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSuiClient = getSuiClient;
exports.getPackageObjects = getPackageObjects;
exports.queryMarketplaceDatasets = queryMarketplaceDatasets;
exports.verifyTransaction = verifyTransaction;
const client_1 = require("@mysten/sui/client");
let cachedClient = null;
function getSuiClient() {
    if (cachedClient)
        return cachedClient;
    const network = (process.env.SUI_NETWORK || "testnet");
    const url = (0, client_1.getFullnodeUrl)(network);
    cachedClient = new client_1.SuiClient({ url });
    return cachedClient;
}
/**
 * Best-effort: fetch events related to a package as a proxy for activity.
 * Note: Enumerating "all objects in a package" typically requires an indexer
 * or contract-level registries. This returns recent events tied to the package.
 */
async function getPackageObjects(packageId) {
    const client = getSuiClient();
    // Best-effort: return the package object itself (metadata) if available.
    try {
        const obj = await client.getObject({
            id: packageId,
            options: { showContent: true, showType: true, showOwner: true }
        });
        return [obj];
    }
    catch {
        return [];
    }
}
/**
 * Query datasets registered under a marketplace shared object using dynamic fields.
 * This assumes the marketplace stores dataset entries as dynamic fields or in tables
 * accessible via dynamic fields. Unknown shapes are skipped.
 */
async function queryMarketplaceDatasets(marketplaceId) {
    const client = getSuiClient();
    const datasets = [];
    // Page through dynamic fields
    let cursor = null;
    for (;;) {
        const dyn = await client.getDynamicFields({
            parentId: marketplaceId,
            cursor: cursor || undefined,
            limit: 50
        });
        for (const field of dyn.data) {
            // For each field, load the child object
            if (!field.objectId)
                continue;
            const obj = await client.getObject({
                id: field.objectId,
                options: { showContent: true, showType: true, showOwner: true }
            });
            const ds = tryParseDataset(obj);
            if (ds)
                datasets.push(ds);
        }
        if (!dyn.hasNextPage || !dyn.nextCursor)
            break;
        cursor = dyn.nextCursor;
    }
    return datasets;
}
/**
 * Verify a transaction digest executed successfully.
 */
async function verifyTransaction(digest) {
    const client = getSuiClient();
    const tx = await client.getTransactionBlock({
        digest,
        options: { showEffects: true }
    });
    // effects.status.status is 'success' | 'failure'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const status = tx?.effects?.status?.status;
    return status === "success";
}
// Helpers
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tryParseDataset(obj) {
    try {
        const content = obj?.data?.content;
        if (!content || content.dataType !== "moveObject")
            return null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fields = content.fields;
        // Flexible extraction: accept multiple field spellings if present.
        const id = obj?.data?.objectId;
        const name = String(fields.name ?? "");
        const description = String(fields.description ?? "");
        const creator = String(fields.creator ?? fields.owner ?? "");
        // On-chain numbers can be big; keep as string for safety
        const price = String(fields.price ?? fields.list_price ?? "0");
        const blob_id = String(fields.blob_id ?? fields.blobId ?? fields.blob ?? "");
        const quality_score = Number(fields.quality_score ?? fields.quality ?? 0);
        // Basic sanity
        if (!id || !blob_id)
            return null;
        return { id, name, description, creator, price, blob_id, quality_score };
    }
    catch {
        return null;
    }
}
exports.default = {
    getSuiClient,
    getPackageObjects,
    queryMarketplaceDatasets,
    verifyTransaction
};

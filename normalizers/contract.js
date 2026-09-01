// Canonical tip contract shared by ALL sources.
//
// Every normalizer must return tips with EXACTLY these fields, in this
// order, so downstream consumers (DB persistence, detail-page scraping,
// analytics, etc.) can rely on a single, identical shape regardless of
// which source produced the tip.

const TIP_CONTRACT_FIELDS = [
    "source",
    "externalId",
    "sport",
    "competition",
    "country",
    "homeTeam",
    "awayTeam",
    "kickoff",
    "market",
    "selection",
    "odds",
    "previewTitle",
    "preview",
    "analytics",
    "confidenceIndex",
    "predictedScore",
    "detailsUrl",
    "status",
    "result",
    "extraTips",
    "scrapedAt",
];

/**
 * Builds a tip object conforming to the canonical contract.
 * Any field not provided (or null/undefined) defaults to null.
 * `scrapedAt` always defaults to the current time.
 *
 * @param {object} overrides - Partial tip fields to set.
 * @returns {object} A tip with every contract field present, in order.
 */
function buildTip(overrides = {}) {
    const tip = {};

    for (const field of TIP_CONTRACT_FIELDS) {
        tip[field] = field === "extraTips" ? (overrides[field] ?? []) : (overrides[field] ?? null);
    }

    tip.scrapedAt = overrides.scrapedAt || new Date();

    return tip;
}

module.exports = { TIP_CONTRACT_FIELDS, buildTip };

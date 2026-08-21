const assert = require("assert");

const DISPLAY_FIELDS = [
    "index",
    "source",
    "sport",
    "competition",
    "homeTeam",
    "awayTeam",
    "kickoff",
    "market",
    "selection",
    "odds",
    "detailsUrl",
    "status",
];

function validateNormalizedTips(tips, source) {
    assert.ok(Array.isArray(tips), `${source} normalized output should be an array`);
    assert.ok(tips.length > 0, `${source} should return at least one normalized tip`);

    for (const [index, tip] of tips.entries()) {
        assert.ok(tip.source, `${source} tip ${index} is missing source`);
        assert.ok(tip.sport, `${source} tip ${index} is missing sport`);
        assert.ok(tip.homeTeam, `${source} tip ${index} is missing homeTeam`);
        assert.ok(tip.awayTeam, `${source} tip ${index} is missing awayTeam`);
        assert.ok(tip.market || tip.selection, `${source} tip ${index} is missing market and selection`);
        assert.ok(!/^Raffle\.?$/i.test(tip.selection || ""), `${source} tip ${index} contains a placeholder selection`);
    }
}

function printNormalizedTips(source, tips) {
    validateNormalizedTips(tips, source);

    console.log(`\n${source} normalized tips (${tips.length}):`);
    console.table(tips.map((tip, index) => {
        const row = { index };

        for (const field of DISPLAY_FIELDS.slice(1)) {
            let value = tip[field] ?? null;
            if (field === "detailsUrl" && typeof value === "string" && value.length > 90) {
                value = `${value.slice(0, 87)}...`;
            }
            row[field] = value;
        }

        return row;
    }));
}

module.exports = { printNormalizedTips, validateNormalizedTips };

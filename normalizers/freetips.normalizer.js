const { buildTip } = require("./contract");

class FreeTipsNormalizer {
    normalize(rawTips = []) {
        return rawTips.map((tip) =>
            buildTip({
                source: "freetips",
                externalId: null,
                sport: tip.sport || "Football",
                competition: tip.league || "Bet of the Day",
                country: null,
                homeTeam: tip.homeTeam || null,
                awayTeam: tip.awayTeam || null,
                kickoff: tip.time || tip.kickoff || null,
                market: tip.market || "Full Time Result",
                selection: tip.selection || tip.prediction || null,
                odds: Number(tip.odds) || null,
                previewTitle: tip.previewTitle || null,
                preview: tip.preview || null,
                analytics: tip.analytics || null,
                confidenceIndex: null,
                predictedScore: null,
                detailsUrl: tip.detailsUrl || null,
                status: tip.result === "?" || !tip.result ? "pending" : "settled",
                result: tip.result || null,
            })
        );
    }
}

module.exports = FreeTipsNormalizer;
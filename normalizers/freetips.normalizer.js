const { buildTip } = require("./contract");

class FreeTipsNormalizer {
    normalize(rawTips = []) {
        return rawTips.map((tip) => {
            const topTip = Array.isArray(tip.tips) && tip.tips.length > 0 ? tip.tips[0] : null;
            const selection = topTip?.selection || tip.selection || tip.prediction || null;
            const market = topTip?.market || tip.market || "Match Result";
            const odds = topTip?.odds != null ? Number(topTip.odds) : (tip.odds != null ? Number(tip.odds) : null);
            const stakeUnits = topTip?.units != null ? Number(topTip.units) : (tip.stakeUnits != null ? Number(tip.stakeUnits) : 2);
            const verdict = tip.verdict || tip.preview || null;

            return buildTip({
                source: "freetips",
                externalId: null,
                sport: tip.sport || "Football",
                competition: tip.competition || tip.league || "Bet of the Day",
                league: tip.league || null,
                country: null,
                homeTeam: tip.homeTeam || null,
                awayTeam: tip.awayTeam || null,
                kickoff: tip.time || tip.kickoff || null,
                market,
                selection,
                odds,
                stakeUnits,
                previewTitle: tip.previewTitle || null,
                preview: verdict,
                verdict,
                tips: Array.isArray(tip.tips) ? tip.tips : [],
                analytics: tip.analytics || null,
                confidenceIndex: null,
                predictedScore: null,
                detailsUrl: tip.detailsUrl || null,
                status: tip.result === "?" || !tip.result ? "pending" : "settled",
                result: tip.result || null,
                extraTips: Array.isArray(tip.extraTips) ? tip.extraTips : [],
            });
        });
    }
}

module.exports = FreeTipsNormalizer;
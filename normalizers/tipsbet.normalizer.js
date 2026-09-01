const { buildTip } = require("./contract");

class TipsBetNormalizer {
    normalize(rawTips = []) {
        return rawTips.map((tip) =>
            buildTip({
                source: "tipsbet",
                externalId: null,
                sport: this.normalizeSport(tip.sport, tip.competition),
                competition: tip.competition || null,
                country: tip.country || null,
                homeTeam: tip.homeTeam || null,
                awayTeam: tip.awayTeam || null,
                kickoff: this.toKenyaTime(tip.kickoff),
                market: "Match Winner",
                selection: tip.market || null,
                odds: Number(tip.odds) || null,
                previewTitle: null,
                preview: null,
                analytics: null,
                confidenceIndex: null,
                predictedScore: null,
                detailsUrl: null,
                status: tip.result === "?" || !tip.result? "pending": this.getStatus(tip.result),
                result: tip.result || null,
            })
        );
    }

    normalizeSport(sport, competition) {
        const text = `${sport || ""} ${competition || ""}`.toLowerCase();

        if (text.includes("nba") || text.includes("basketball")) {
            return "Basketball";
        }

        if (text.includes("atp") || text.includes("wta") || text.includes("tennis")) {
            return "Tennis";
        }

        if (text.includes("football") || text.includes("soccer") || text.includes("world cup") ||
            text.includes("champions league") || text.includes("conference league") || text.includes("club friendly") ||
            text.includes("premier league") || text.includes("league") || text.includes("cup")) {
            return "Football";
        }

        return sport || "Unknown";
    }

    toKenyaTime(time) {
        if (!time) return null;
        const match = String(time).trim().match(/^(\d{1,2}):(\d{2})$/);
        if (!match) return null;

        let hours = Number(match[1]);
        const minutes = Number(match[2]);

        if (hours > 23 || minutes > 59) {
            return null;
        }

        // TipsBet source time + 1 hour.
        hours = (hours + 1) % 24;

        return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }

    getStatus(result) {
        if (!result || result === "?") {
            return "pending";
        }

        return "settled";
    }
}

module.exports = TipsBetNormalizer;
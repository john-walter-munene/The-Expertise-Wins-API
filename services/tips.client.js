const FREE_STAKES = { default: 2, };

class TipsConsumptionClient {
    /**
     * Consume the complete result from adminTips.getAllTips()
     * Input: { free: [...], premium: [...] }
     * Output: { freeCards: [...], premiumCards: [...] }
     */
    consume({ free = [], premium = [] }) {
        return { freeCards: this.consumeFreeTips(free), premiumCards: this.consumePremiumTips(premium), };
    }

    // FREE TIPS

    consumeFreeTips(tips) {
        const tipsBet = tips.filter(tip => tip.source === "tipsbet");
        const vitibet = tips.filter(tip => tip.source === "vitibet");

        const cards = [];

        if (tipsBet.length > 0) cards.push(this.formatTipsBetCard(tipsBet));
        if (vitibet.length > 0) cards.push(this.formatVitibetCard(vitibet));

        return cards.filter(Boolean);
    }

    /**
     * TipsBet
     *
     * Example:
     *
     * Saturday Pikker 📍
     *
     * Western Sydney Wanderers vs Sydney FC
     * Sydney Win @2.55 - 1 Unit
     * Sydney Win or Draw @1.55 - 3 Units
     */
    formatTipsBetCard(tips) {
        const usable = tips.filter(tip => tip.homeTeam && tip.awayTeam && tip.selection && Number.isFinite(Number(tip.odds)));
        if (!usable.length) return null;

        const groups = this.groupFixtures(usable);
        const lines = [ "🆓 Expertise Free Card1️⃣", "",];

        for (const group of groups) {
            lines.push(`${group.homeTeam} vs ${group.awayTeam}`);
            for (const tip of group.tips) lines.push(this.formatFreeTipLine(tip));
            lines.push("");
        }

        return lines.join("\n").trim();
    }

    formatFreeTipLine(tip) {
        const selection = tip.selection || tip.market;
        const odds = Number(tip.odds);
        const stake = tip.stakeUnits ??this.getFreeStake(tip);
        return `${selection} @${this.formatOdds(odds)} - ${stake} Unit${stake === 3 ? "" : "s"}`;
    }

    /**
     * Vitibet deliberately has no odds in our normalized
     * representation.
     *
     * Therefore we don't try to manufacture a betting line.
     */
    formatVitibetCard(tips) {
        const usable = tips.filter(tip => tip.homeTeam && tip.awayTeam && tip.selection);
        if (!usable.length) return null;

        const groups = this.groupFixtures(usable);
        const lines = ["🆓 Expertise Free Card1️2️⃣", "",];

        for (const group of groups) {
            lines.push(`${group.homeTeam} vs ${group.awayTeam}`);
            lines.push(group.tips.map(tip => tip.selection || tip.market).join(" / "));
            lines.push("");
        }

        return lines.join("\n").trim();
    }

    // PREMIUM / MAXBET

    consumePremiumTips(tips) {
        if (!Array.isArray(tips) || tips.length === 0) return [];
        return tips.map(tip => this.formatPremiumCard(tip)).filter(Boolean);
    }

    /**
     * Every premium listing gets the same underlying structure.
     *
     * Featured listings get their special heading:
     *
     * Bet of the day❗️
     *
     * 🎾 || Tennis Bet of the Day❗️
     *
     * Ordinary listings simply get:
     *
     * ⚽️ || Team A v Team B
     *
     * This means the presentation logic doesn't care where
     * the premium tip came from.
     */
    formatPremiumCard(tip) {
        if (!tip.homeTeam || !tip.awayTeam) return null;

        const profile = this.buildPremiumProfile(tip);
        const lines = [];

        // Heading
        if (profile.heading) {
            lines.push(profile.heading);
            lines.push("");
        }

        // Fixture
        lines.push(`${this.getSportEmoji(tip.sport)} || ${tip.homeTeam} v ${tip.awayTeam}`);

        // Competition
        if (tip.competition)lines.push(tip.competition);

        // Kickoff
        if (tip.kickoff) lines.push(`Beginning: ${tip.kickoff} Kenyan Time`); 

        // Main bet
        lines.push(`Bet: ${profile.mainTip.selection}`);
        lines.push(`Stake: ${profile.mainTip.stake} Units`);
        lines.push("");

        // Reason
        if (tip.preview) {
            const reason = this.cleanPreview(tip.preview);

            if (reason) {
                lines.push(reason);
                lines.push("");
            }
        }

        // All tips

        const allTips = this.getAllPremiumTips(tip, profile.mainTip);
        for (const bettingTip of allTips) lines.push(this.formatPremiumTipLine(bettingTip));

        return lines.join("\n").trim();
    }

    buildPremiumProfile(tip) {
        const title = String(tip.previewTitle || "").toLowerCase();

        const isBetOfDay = title.includes("bet of the day");
        const isTennisBetOfDay = title.includes("tennis bet of the day");

        let heading = null;
        if (isTennisBetOfDay) heading = "🎾 || Tennis Bet of the Day❗️";
        else if (isBetOfDay) heading = "Bet of the day❗️";
        
        /*
         * Main tip is determined by the highest stake.
         *
         * We inspect extraTips as well because your
         * normalized data can contain the main tip there.
         */
        const candidates = [
            {
                selection: tip.selection,
                market: tip.market,
                odds: tip.odds,
                stakeUnits: tip.stakeUnits ?? 4,
            },
            ...(Array.isArray(tip.extraTips)? tip.extraTips : []),
        ].filter(item => item && item.selection);

        const mainTip = candidates.reduce(
            (highest, current) => {
                const highestStake = Number(highest.stakeUnits ?? 0);
                const currentStake = Number(current.stakeUnits ?? 0);
                return currentStake > highestStake ? current : highest;
            },
            candidates[0]);

        return {
            heading,
            mainTip: {
                selection: mainTip?.selection || tip.selection || tip.market || "Selected Tip",
                odds: Number.isFinite(Number(mainTip?.odds))? Number(mainTip.odds) : null,
                stake: Number(mainTip?.stakeUnits ?? 4),
            },
        };
    }

    /**
     * The "All tips" section.
     *
     * Main tip is always included first.
     * Additional tips follow it.
     */
    getAllPremiumTips(tip, mainTip) {
        const tips = [];

        tips.push({ selection: mainTip.selection, odds: mainTip.odds, stakeUnits: mainTip.stake, });
        const extras = Array.isArray(tip.extraTips) ? tip.extraTips: [];

        for (const extra of extras) {
            if (!extra?.selection) continue;

            // Don't duplicate the main tip.
            const isDuplicate = extra.selection === mainTip.selection && Number(extra.odds) === Number(mainTip.odds);
            if (isDuplicate) continue;
            
            tips.push({
                selection: extra.selection,
                odds: Number.isFinite(Number(extra.odds)) ? Number(extra.odds) : null,
                stakeUnits: extra.stakeUnits ?? 2,
            });
        }

        return tips;
    }

    formatPremiumTipLine(tip) {
        const oddsText = Number.isFinite(Number(tip.odds))? ` @${this.formatOdds(tip.odds)}`: "";
        const stake = Number(tip.stakeUnits ?? 2);
        return `${tip.selection}${oddsText} - ${stake} Unit${stake === 1 ? "" : "s"}`;
    }

    // HELPERS

    groupFixtures(tips) {
        const groups = new Map();

        for (const tip of tips) {
            const key = [ tip.homeTeam, tip.awayTeam,].join("::");
            if (!groups.has(key)) groups.set(key, { homeTeam: tip.homeTeam, awayTeam: tip.awayTeam, tips: [], });
            groups.get(key).tips.push(tip);
        }

        return Array.from(groups.values());
    }

    getFreeStake(tip) {
        const odds = Number(tip.odds);
        if (odds >= 3) return 1;
        return 2;
    }

    formatOdds(odds) {
        const value = Number(odds);
        if (!Number.isFinite(value)) return "";
        return value.toFixed(2);
    }

    getSportEmoji(sport) {
        const value = String(sport || "").toLowerCase();

        if (value.includes("tennis")) return "🎾";
        if (value.includes("football")) return "⚽️";
        if (value.includes("basketball")) return "🏀";
        if (value.includes("baseball")) return "⚾️";
        if (value.includes("rugby")) return "🏉";
        if (value.includes("esport")) return "🎮";

        return "🎯";
    }

    cleanPreview(preview) {
        if (!preview) return "";
        return String(preview).replace(/\\"/g, '"').replace(/\\n/g, " ").replace(/\s+/g, " ").trim();
    }
}

module.exports = TipsConsumptionClient;
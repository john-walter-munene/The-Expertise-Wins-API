class TipsConsumptionClient {
    /**
     * This client is intentionally specialized for the freetips scraper only.
     * Any legacy mixed-source data is filtered out so the service box only emits
     * channel groups for the active publication flow:
     * - maxbetVipCards: featured tips for Pikk Maxbet VIP
     * - expertiseWinsFreeCards: listed football tips for The Expertise Wins Free Tips
     * - pikkBetterVipCards: other-sport tips for PikkBetter VIP
     */
    consume({ free = [], premium = [] }) {
        const freeTips = this.filterFreetips(Array.isArray(free) ? free : []);
        const premiumTips = this.filterFreetips(Array.isArray(premium) ? premium : []);
        const allTips = freeTips.concat(premiumTips);

        const maxbetVip = this.groupMaxbetVip(allTips);
        const expertiseWinsFree = this.groupExpertiseWinsFree(allTips);
        const pikkBetterVip = this.groupPikkBetterVip(allTips);

        return {
            freeCards: this.consumeFreeTips(freeTips),
            premiumCards: this.consumePremiumTips(premiumTips),
            maxbetVipCards: maxbetVip,
            expertiseWinsFreeCards: expertiseWinsFree,
            pikkBetterVipCards: pikkBetterVip,
        };
    }

    filterFreetips(tips) {
        if (!Array.isArray(tips)) return [];
        return tips.filter((tip) => {
            if (!tip) return false;
            const source = String(tip.source || "").toLowerCase();
            return source === "" || source === "freetips";
        });
    }

    groupMaxbetVip(tips) {
        return this.filterAndFormat(tips, (tip) => this.isFeaturedTip(tip), this.formatMaxbetVipCard);
    }

    groupExpertiseWinsFree(tips) {
        return this.filterAndFormat(tips, (tip) => this.isFootballListingTip(tip), this.formatExpertiseWinsFreeCard);
    }

    groupPikkBetterVip(tips) {
        return this.filterAndFormat(tips, (tip) => !this.isFeaturedTip(tip) && !this.isFootballListingTip(tip), this.formatPikkBetterVipCard);
    }

    filterAndFormat(tips, predicate, formatter) {
        if (!Array.isArray(tips)) return [];
        return tips.filter(Boolean).filter(predicate).map((tip) => formatter.call(this, tip)).filter(Boolean);
    }

    consumeTips(tips) {
        if (!Array.isArray(tips) || tips.length === 0) return [];
        return tips.map((tip) => this.formatCard(tip)).filter(Boolean);
    }

    consumeFreeTips(tips) {
        if (!Array.isArray(tips)) return [];
        return tips.filter((tip) => tip && this.isFootballListingTip(tip)).map((tip) => this.formatPlainFreeCard(tip)).filter(Boolean);
    }

    consumePremiumTips(tips) {
        if (!Array.isArray(tips)) return [];
        return tips.filter((tip) => tip && (this.isFeaturedTip(tip) || !this.isFootballListingTip(tip))).map((tip) => this.formatPremiumCard(tip)).filter(Boolean);
    }

    isFeaturedTip(tip) {
        if (!tip) return false;
        const sport = String(tip.sport || "").toLowerCase();
        const previewTitle = String(tip.previewTitle || tip.competition || "").toLowerCase();
        const hasFeaturedFlag = Boolean(tip.isFeatured);
        return hasFeaturedFlag || previewTitle.includes("bet of the day") || (sport === "tennis" && previewTitle.includes("tennis bet of the day"));
    }

    isFootballListingTip(tip) {
        if (!tip) return false;
        const sport = String(tip.sport || "").toLowerCase();
        if (sport !== "football" && sport !== "soccer") return false;
        return !this.isFeaturedTip(tip);
    }

    /**
     * Formats a tip object into the clean Telegram / presentation card:
     *
     * Bet of the day❗️
     * ⚽️ || Liverpool v PSG
     * UEFA Champions League
     * Beginning: 23:00 Kenyan Time
     * Bet: PSG
     * Stake: 3 Units
     *
     * <Verdict Narrative>
     *
     * BTTS & Over 3.5 Goals @2.40 - 2 Units
     * PSG Win @2.50 - 2 Units
     */
    formatCard(tip) {
        if (!tip) return null;
        if (!tip.homeTeam && !tip.selection) return null;

        const lines = [];
        const sportEmoji = this.getSportEmoji(tip.sport);
        const title = String(tip.previewTitle || tip.competition || "").toLowerCase();
        const isTennisBetOfDay = title.includes("tennis bet of the day") || (tip.isFeatured && String(tip.sport).toLowerCase() === "tennis");
        const isBetOfDay = title.includes("bet of the day") || tip.isFeatured;

        // 1. Heading
        if (isTennisBetOfDay) {
            lines.push("🎾 || Tennis Bet of the Day❗️");
        } else if (isBetOfDay) {
            lines.push("Bet of the day❗️");
        } else {
            lines.push(`${sportEmoji} || ${tip.sport || "Match"}`);
        }

        // 2. Fixture Line
        if (tip.homeTeam && tip.awayTeam) {
            if (isBetOfDay) {
                lines.push(`${sportEmoji} || ${tip.homeTeam} v ${tip.awayTeam}`);
            } else {
                lines.push(`${tip.homeTeam} vs ${tip.awayTeam}`);
            }
        }

        // 3. Competition Line (if meaningful)
        if (
            tip.competition &&
            !/^(Bet of the Day|Tennis Bet of the Day|Betting Tips)$/i.test(tip.competition) &&
            tip.competition.toLowerCase() !== String(tip.sport || "").toLowerCase()
        ) {
            lines.push(tip.competition);
        }

        // 4. Kickoff Line
        if (tip.kickoff) {
            const ko = String(tip.kickoff).trim();
            const koText = ko.toLowerCase().includes("kenyan time") ? ko : `${ko} Kenyan Time`;
            lines.push(`Beginning: ${koText}`);
        }

        // 5. Main Bet & Stake
        const tipsList = Array.isArray(tip.tips) && tip.tips.length > 0 ? tip.tips : [];
        const mainTip = tipsList.length > 0
            ? tipsList.reduce((prev, curr) => (Number(curr.units || 0) > Number(prev.units || 0) ? curr : prev), tipsList[0])
            : {
                selection: tip.selection || tip.market || "Selected Tip",
                units: tip.stakeUnits ?? 2,
                odds: tip.odds,
            };

        lines.push(`Bet: ${mainTip.selection}`);
        lines.push(`Stake: ${mainTip.units || 2} Units`);

        // 6. Verdict / Reason Narrative
        const verdict = this.cleanPreview(tip.verdict || tip.preview);
        if (verdict) {
            lines.push("");
            lines.push(verdict);
            lines.push("");
        }

        // 7. All Tips lines
        if (tipsList.length > 0) {
            for (const t of tipsList) {
                const oddsText = Number.isFinite(Number(t.odds)) ? ` @${this.formatOdds(t.odds)}` : "";
                const units = Number(t.units ?? 2);
                lines.push(`${t.selection}${oddsText} - ${units} Unit${units === 1 ? "" : "s"}`);
            }
        } else if (mainTip.selection) {
            const oddsText = Number.isFinite(Number(mainTip.odds)) ? ` @${this.formatOdds(mainTip.odds)}` : "";
            const units = Number(mainTip.units ?? 2);
            lines.push(`${mainTip.selection}${oddsText} - ${units} Unit${units === 1 ? "" : "s"}`);
        }

        return lines.join("\n").trim();
    }

    formatMaxbetVipCard(tip) {
        if (!tip) return null;

        const sportEmoji = this.getSportEmoji(tip.sport);
        const kickoff = tip.kickoff ? String(tip.kickoff).trim() : "";
        const kickoffText = kickoff ? (kickoff.toLowerCase().includes("kenyan time") ? kickoff : `${kickoff} Kenyan Time`) : "";
        const isFeaturedFootball = /bet of the day/i.test(String(tip.previewTitle || tip.competition || "")) || Boolean(tip.isFeatured);
        const isFeaturedTennis = String(tip.sport || "").toLowerCase() === "tennis" && (isFeaturedFootball || /tennis bet of the day/i.test(String(tip.previewTitle || tip.competition || "")));

        const mainTip = this.getMainTip(tip);
        const mainSelection = mainTip ? (mainTip.selection || mainTip.market || tip.selection || tip.market) : (tip.selection || tip.market || "Selected Tip");
        const mainStake = this.getMainStake(tip);
        const verdict = this.cleanPreview(tip.verdict || tip.preview);
        const tipsList = Array.isArray(tip.tips) ? tip.tips : [];
        const lines = [];

        if (isFeaturedFootball) {
            lines.push("[07/09/2026 12:43] Pikk Maxbet VIP: Bet of the day❗️");
            lines.push("");
            lines.push(`${sportEmoji} || ${tip.homeTeam} v ${tip.awayTeam}`);
            lines.push("Bet of the Day");
            if (kickoffText) lines.push(`Beginning: ${kickoffText}`);
            lines.push(`Bet: ${mainSelection}`);
            if (mainStake != null) lines.push(`Stake: ${mainStake} Units`);
            if (verdict) {
                lines.push("");
                lines.push(verdict);
                lines.push("");
            }
        } else if (isFeaturedTennis) {
            lines.push("[07/09/2026 12:43] Pikk Maxbet VIP: ");
            lines.push(`${sportEmoji} || ${tip.homeTeam} v ${tip.awayTeam}`);
            if (kickoffText) lines.push(`Beginning: ${kickoffText}`);
            lines.push(`Bet: ${String(tip.market || mainSelection || "Sets")}`);
            if (mainStake != null) lines.push(`Stake: ${mainStake} Units`);
            if (verdict) {
                lines.push("");
                lines.push(verdict);
                lines.push("");
            }
        } else {
            lines.push("[07/09/2026 12:43] Pikk Maxbet VIP:");
            lines.push(`${sportEmoji} || ${tip.homeTeam} v ${tip.awayTeam}`);
            if (kickoffText) lines.push(`Beginning: ${kickoffText}`);
            if (mainSelection) lines.push(`Bet: ${mainSelection}`);
            if (mainStake != null) lines.push(`Stake: ${mainStake} Units`);
            if (verdict) {
                lines.push("");
                lines.push(verdict);
                lines.push("");
            }
        }

        if (tipsList.length > 0) {
            for (const item of tipsList) {
                const oddsText = Number.isFinite(Number(item.odds)) ? ` @${this.formatOdds(item.odds)}` : "";
                const units = Number(item.units ?? item.stakeUnits ?? 1);
                lines.push(`${item.selection || item.market || "Tip"}${oddsText} - ${units} Unit${units === 1 ? "" : "s"}`);
            }
        } else if (mainSelection) {
            const oddsText = Number.isFinite(Number(tip.odds)) ? ` @${this.formatOdds(tip.odds)}` : "";
            const units = Number(tip.stakeUnits ?? tip.units ?? 1);
            lines.push(`${mainSelection}${oddsText} - ${units} Unit${units === 1 ? "" : "s"}`);
        }

        return lines.join("\n").trim();
    }

    formatExpertiseWinsFreeCard(tip) {
        if (!tip) return null;

        const lines = ["The Expertise Wins Free Tips:", ""];
        const fixture = tip.homeTeam && tip.awayTeam ? `${tip.homeTeam} vs ${tip.awayTeam}` : (tip.selection || "Match");
        lines.push(fixture);

        const tipsList = Array.isArray(tip.tips) ? tip.tips : [];
        if (tipsList.length > 0) {
            for (const item of tipsList) {
                const oddsText = Number.isFinite(Number(item.odds)) ? ` @${this.formatOdds(item.odds)}` : "";
                const units = Number(item.units ?? item.stakeUnits ?? 1);
                lines.push(`${item.selection || item.market || "Tip"}${oddsText} - ${units} Unit${units === 1 ? "" : "s"}`);
            }
        } else if (tip.selection) {
            const oddsText = Number.isFinite(Number(tip.odds)) ? ` @${this.formatOdds(tip.odds)}` : "";
            const units = Number(tip.stakeUnits ?? tip.units ?? 1);
            lines.push(`${tip.selection}${oddsText} - ${units} Unit${units === 1 ? "" : "s"}`);
        }

        return lines.join("\n").trim();
    }

    formatPikkBetterVipCard(tip) {
        const output = this.formatMaxbetVipCard(tip);
        if (!output) return null;
        return output.replace("Pikk Maxbet VIP", "PikkBetter VIP");
    }

    formatChannelCard({ tip, header, fixturePrefix, showBetOfDayHeader, includeCompetition, includeMarketLabel, titlePrefix, mainChannelName }) {
        if (!tip) return null;

        const sportEmoji = this.getSportEmoji(tip.sport);
        const lines = [];

        lines.push(`${header}${showBetOfDayHeader ? "Bet of the day❗️" : ""}`.trim());

        if (tip.homeTeam && tip.awayTeam) {
            const fixtureText = `${fixturePrefix ? `${fixturePrefix} ` : ""}${tip.homeTeam} v ${tip.awayTeam}`.trim();
            if (fixturePrefix) {
                lines.push(fixtureText);
            } else {
                lines.push(`${tip.homeTeam} vs ${tip.awayTeam}`);
            }
        }

        if (showBetOfDayHeader && tip.homeTeam && tip.awayTeam) {
            lines.push("Bet of the Day");
        }

        const kickoff = tip.kickoff ? String(tip.kickoff).trim() : "";
        if (kickoff) {
            const kickoffText = kickoff.toLowerCase().includes("kenyan time") ? kickoff : `${kickoff} Kenyan Time`;
            lines.push(`Beginning: ${kickoffText}`);
        }

        const selection = this.getMainSelection(tip);
        if (selection) {
            lines.push(`Bet: ${selection}`);
        }

        const stake = this.getMainStake(tip);
        if (stake != null) {
            lines.push(`Stake: ${stake} Units`);
        }

        const verdict = this.cleanPreview(tip.verdict || tip.preview);
        if (verdict) {
            lines.push(verdict);
        }

        const listedTips = Array.isArray(tip.tips) ? tip.tips : [];
        if (listedTips.length > 0) {
            for (const item of listedTips) {
                const oddsText = Number.isFinite(Number(item.odds)) ? ` @${this.formatOdds(item.odds)}` : "";
                const units = Number(item.units ?? item.stakeUnits ?? 1);
                lines.push(`${item.selection || item.market || "Tip"}${oddsText} - ${units} Unit${units === 1 ? "" : "s"}`);
            }
        } else if (tip.selection) {
            const oddsText = Number.isFinite(Number(tip.odds)) ? ` @${this.formatOdds(tip.odds)}` : "";
            const units = Number(tip.stakeUnits ?? tip.units ?? 1);
            lines.push(`${tip.selection}${oddsText} - ${units} Unit${units === 1 ? "" : "s"}`);
        }

        return lines.join("\n").trim();
    }

    getMainSelection(tip) {
        const mainTip = this.getMainTip(tip);
        return mainTip ? mainTip.selection || mainTip.market || tip.selection : tip.selection || tip.market || "Selected Tip";
    }

    getMainStake(tip) {
        const mainTip = this.getMainTip(tip);
        const value = Number(mainTip ? (mainTip.units ?? mainTip.stakeUnits ?? tip.stakeUnits ?? 2) : (tip.stakeUnits ?? tip.units ?? 2));
        return Number.isFinite(value) ? value : 2;
    }

    getMainTip(tip) {
        const tipList = Array.isArray(tip.tips) && tip.tips.length > 0 ? tip.tips : [];
        if (tipList.length === 0) {
            return {
                selection: tip.selection || tip.market || "Selected Tip",
                units: tip.stakeUnits ?? 2,
                odds: tip.odds,
            };
        }

        return tipList.reduce((prev, curr) => (Number(curr.units ?? curr.stakeUnits ?? 0) > Number(prev.units ?? prev.stakeUnits ?? 0) ? curr : prev), tipList[0]);
    }

    formatPremiumCard(tip) {
        return this.formatCard(tip);
    }

    formatPlainFreeCard(tip) {
        if (!tip) return null;

        const lines = [];
        const fixture = tip.homeTeam && tip.awayTeam ? `${tip.homeTeam} vs ${tip.awayTeam}` : (tip.selection || "Match");
        lines.push(fixture);

        const listedTips = Array.isArray(tip.tips) ? tip.tips : [];
        if (listedTips.length > 0) {
            for (const item of listedTips) {
                const oddsText = Number.isFinite(Number(item.odds)) ? ` @${this.formatOdds(item.odds)}` : "";
                const units = Number(item.units ?? item.stakeUnits ?? 1);
                lines.push(`${item.selection || item.market || "Tip"}${oddsText} - ${units} Unit${units === 1 ? "" : "s"}`);
            }
        } else if (tip.selection) {
            const oddsText = Number.isFinite(Number(tip.odds)) ? ` @${this.formatOdds(tip.odds)}` : "";
            const units = Number(tip.stakeUnits ?? tip.units ?? 1);
            lines.push(`${tip.selection}${oddsText} - ${units} Unit${units === 1 ? "" : "s"}`);
        }

        return lines.join("\n").trim();
    }

    formatFreeCard(tips) {
        if (!Array.isArray(tips) || tips.length === 0) return null;
        return tips.filter((tip) => tip && this.isFootballListingTip(tip)).map((t) => this.formatPlainFreeCard(t)).filter(Boolean).join("\n\n----------------------------------------\n\n");
    }

    // HELPERS

    formatOdds(odds) {
        const value = Number(odds);
        if (!Number.isFinite(value)) return "";
        return value.toFixed(2);
    }

    getSportEmoji(sport) {
        const value = String(sport || "").toLowerCase();
        if (value.includes("tennis")) return "🎾";
        if (value.includes("football") || value.includes("soccer")) return "⚽️";
        if (value.includes("basketball")) return "🏀";
        if (value.includes("baseball")) return "⚾️";
        if (value.includes("rugby")) return "🏉";
        if (value.includes("esport")) return "🎮";
        if (value.includes("hockey")) return "🏒";
        if (value.includes("cricket")) return "🏏";
        return "🎯";
    }

    cleanPreview(preview) {
        if (!preview) return "";
        let text = String(preview);
        // Strip escaped JSON-LD / schema attributes
        text = text.replace(/",\s*"articleSection":[\s\S]*$/i, "");
        text = text.replace(/"articleBody":[\s\S]*$/i, "");
        text = text.replace(/@type[\s\S]*$/i, "");
        // Strip CSS blocks
        text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
        text = text.replace(/\.pSocial[^{]*\{[^}]*\}/g, "");
        // Strip HTML tags
        text = text.replace(/<[^>]+>/g, " ");
        // Normalize whitespace and unescape quotes
        text = text.replace(/\\"/g, '"').replace(/\\n/g, " ").replace(/\s+/g, " ").trim();
        return text;
    }
}

module.exports = { TipsConsumptionClient };
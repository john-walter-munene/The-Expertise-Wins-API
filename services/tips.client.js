class TipsConsumptionClient {
    /**
     * This client is intentionally specialized for the freetips scraper only.
     * Any legacy mixed-source data is filtered out so the service box only emits
     * channel groups for the active publication flow:
     * - maxbetVipCards: featured tips for Pikk Maxbet VIP
     * - expertiseWinsFreeCards: listed football tips for The Expertise Wins Free Tips
     * - pikkBetterVipCards: other-sport tips for PikkBetter VIP
     */
    async loadFromJson(source = "freetips") {
        const { loadTestResults } = require("../orchestrator/test-results");
        const allTips = loadTestResults(source);
        return this.loadFromData(allTips);
    }

    async loadFromData(allTips) {
        const freeTips = allTips.filter((tip) => this.isFootballListingTip(tip));
        const premiumTips = allTips.filter((tip) => tip && (this.isFeaturedTip(tip) || !this.isFootballListingTip(tip)));
        const grouped = this.consume({ free: freeTips, premium: premiumTips });

        return { allTips, freeTips, premiumTips, ...grouped, };
    }

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
        if (!Array.isArray(tips)) return [];

        // Select non-feature, non-football tips for Pikk Better VIP
        const items = (Array.isArray(tips) ? tips : [])
            .filter(Boolean)
            .filter((tip) => !this.isFeaturedTip(tip) && !this.isFootballListingTip(tip));

        // Grouping strategy: sort so tips of the same sport are contiguous,
        // then by league/competition, then by kickoff time or preview title.
        items.sort((a, b) => {
            const sportA = String(a?.sport || "").toLowerCase();
            const sportB = String(b?.sport || "").toLowerCase();
            if (sportA !== sportB) return sportA.localeCompare(sportB);

            const leagueA = String(a?.league || a?.competition || a?.previewTitle || "").toLowerCase();
            const leagueB = String(b?.league || b?.competition || b?.previewTitle || "").toLowerCase();
            if (leagueA !== leagueB) return leagueA.localeCompare(leagueB);

            const timeA = String(a?.kickoff || a?.time || a?.fixtureId || "");
            const timeB = String(b?.kickoff || b?.time || b?.fixtureId || "");
            if (timeA !== timeB) return timeA.localeCompare(timeB);

            const titleA = String(a?.previewTitle || a?.selection || "").toLowerCase();
            const titleB = String(b?.previewTitle || b?.selection || "").toLowerCase();
            return titleA.localeCompare(titleB);
        });

        return items.map((tip) => this.formatPikkBetterVipCard(tip)).filter(Boolean);
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

    normalizeLabel(value) {
        let text = String(value ?? "")
            .replace(/\s+\(/g, " (")
            .replace(/\)\s+/g, ") ")
            .replace(/\s{2,}/g, " ")
            .trim();

        text = text.replace(/\s*\(\s*\d+\/\d+\s*\)\s*$/i, "");
        text = text.replace(/\s*\(\s*\d+\.\d+\s*\)\s*$/i, "");
        text = text.replace(/\s*\(\s*\d+\s*\/\s*\d+\s*\)\s*$/i, "");

        return text.replace(/\s{2,}/g, " ").trim();
    }

    formatKickoffText(kickoff) {
        if (!kickoff) return "";

        const rawValue = String(kickoff).trim();
        if (!rawValue) return "";
        if (/kenyan time/i.test(rawValue)) return rawValue;

        const compact = rawValue.replace(/\s+/g, " ").trim();
        const timeMatch = compact.match(/^\d{1,2}:\d{2}(?::\d{2})?$/);
        if (timeMatch) {
            return `${compact} Kenyan Time`;
        }

        const durationMatch = compact.match(/^(?:(\d+)\s*h(?:ours?)?\s*)?(?:(\d+)\s*m(?:in(?:utes?)?)?)?$/i);
        if (!durationMatch) {
            return `${compact} Kenyan Time`;
        }

        const hours = Number(durationMatch[1] || 0);
        const minutes = Number(durationMatch[2] || 0);
        const totalMinutes = hours * 60 + minutes;
        if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return `${compact} Kenyan Time`;
        

        const kenyaNow = new Date();
        const parts = new Intl.DateTimeFormat("en-GB", {
            timeZone: "Africa/Nairobi",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
        }).formatToParts(kenyaNow);

        const hour = Number((parts.find((part) => part.type === "hour") || {}).value || 0);
        const minute = Number((parts.find((part) => part.type === "minute") || {}).value || 0);
        const second = Number((parts.find((part) => part.type === "second") || {}).value || 0);
        const totalNowMinutes = hour * 60 + minute + (second / 60);
        const roundedTotalMinutes = Math.round((totalNowMinutes + totalMinutes) * 60) / 60;
        const computedHour = (Math.floor(roundedTotalMinutes / 60) % 24 + 24) % 24;
        const computedMinute = Math.floor(roundedTotalMinutes % 60);

        return `${String(computedHour).padStart(2, "0")}:${String(computedMinute).padStart(2, "0")} Kenyan Time`;
    }

    consumePremiumTips(tips) {
        if (!Array.isArray(tips)) return [];

        const seen = new Set();
        const sortedTips = [...tips]
            .filter((tip) => tip && (this.isFeaturedTip(tip) || !this.isFootballListingTip(tip)))
            .sort((a, b) => this.getPremiumPriority(a) - this.getPremiumPriority(b))
            .filter((tip) => {
                const key = this.getTipIdentityKey(tip);
                if (!key) return true;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .map((tip) => this.formatPremiumCard(tip)).filter(Boolean);

        return sortedTips;
    }

    isFeaturedTip(tip) {
        if (!tip) return false;
        const sport = String(tip.sport || "").toLowerCase();
        const competition = String(tip.competition || "").toLowerCase();
        const previewTitle = String(tip.previewTitle || "").toLowerCase();
        const combinedText = `${competition} ${previewTitle}`.trim();
        const hasFeaturedFlag = Boolean(tip.isFeatured);
        const isBetOfDay = /bet of the day/i.test(combinedText) || /bet of the day/i.test(competition);
        const isTennisBetOfDay = /tennis bet of the day/i.test(combinedText) || (sport === "tennis" && /bet of the day/i.test(combinedText));
        return hasFeaturedFlag || isBetOfDay || isTennisBetOfDay;
    }

    getPremiumPriority(tip) {
        if (!tip) return 99;
        const text = `${tip.competition || ""} ${tip.previewTitle || ""}`.toLowerCase();
        if (/bet of the day/i.test(text) && !/tennis/.test(text)) return 0;
        if (/tennis bet of the day/i.test(text) || (String(tip.sport || "").toLowerCase() === "tennis" && /bet of the day/i.test(text))) return 1;
        return 2;
    }

    getTipIdentityKey(tip) {
        if (!tip) return null;
        const home = String(tip.homeTeam || "").trim().toLowerCase();
        const away = String(tip.awayTeam || "").trim().toLowerCase();
        const detailsUrl = String(tip.detailsUrl || tip.url || "").trim();
        if (home && away) return `fixture:${home}::${away}`;
        if (detailsUrl) return `url:${detailsUrl}`;
        return null;
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
        const normalizedSelection = this.normalizeLabel(tip.selection || tip.market || "Selected Tip");
        const competition = String(tip.competition || "").toLowerCase();
        const previewTitle = String(tip.previewTitle || "").toLowerCase();
        const combinedText = `${competition} ${previewTitle}`.trim();
        const isTennisBetOfDay = /tennis bet of the day/i.test(combinedText) || (tip.isFeatured && String(tip.sport).toLowerCase() === "tennis");
        const isBetOfDay = /bet of the day/i.test(combinedText) || tip.isFeatured;

        // 1. Heading
        if (isTennisBetOfDay) lines.push("🎾 || Tennis Bet of the Day❗️");
        else if (isBetOfDay) lines.push("Bet of the day❗️");
        else lines.push(`${sportEmoji} || ${tip.sport || "Match"}`);

        // 2. Fixture Line
        if (tip.homeTeam && tip.awayTeam) {
            if (isBetOfDay) lines.push(`${sportEmoji} || ${tip.homeTeam} v ${tip.awayTeam}`);
            else lines.push(`${tip.homeTeam} vs ${tip.awayTeam}`);
        }

        // 3. League Line (if meaningful)
        const leagueText = this.getLeagueText(tip);
        if (leagueText) lines.push(`League: ${leagueText}`);

        // 4. Kickoff Line
        if (tip.kickoff) lines.push(`Beginning: ${this.formatKickoffText(tip.kickoff)}`);

        // 5. Main Bet & Stake
        const tipsList = Array.isArray(tip.tips) && tip.tips.length > 0 ? tip.tips : [];
        const mainTip = tipsList.length > 0
            ? tipsList.reduce((prev, curr) => (Number(curr.units || 0) > Number(prev.units || 0) ? curr : prev), tipsList[0])
            : { selection: tip.selection || tip.market || "Selected Tip", units: tip.stakeUnits ?? 2, odds: tip.odds, };

        lines.push(`Bet: ${this.formatSelectionWithMarket(mainTip.selection, mainTip.market)}`);
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
                const normalizedSelection = this.normalizeLabel(t.selection || t.market || "Tip");
                const oddsText = Number.isFinite(Number(t.odds)) ? ` @${this.formatOdds(t.odds)}` : "";
                const units = Number(t.units ?? 2);
                lines.push(`${normalizedSelection}${oddsText} - ${units} Unit${units === 1 ? "" : "s"}${this.formatOutcome(t.outcome)}`);
            }
        } else if (mainTip.selection) {
            const oddsText = Number.isFinite(Number(mainTip.odds)) ? ` @${this.formatOdds(mainTip.odds)}` : "";
            const units = Number(mainTip.units ?? 2);
            lines.push(`${this.normalizeLabel(mainTip.selection)}${oddsText} - ${units} Unit${units === 1 ? "" : "s"}${this.formatOutcome(mainTip.outcome || tip.outcome)}`);
        }

        return lines.join("\n").trim();
    }

    formatMaxbetVipCard(tip) {
        if (!tip) return null;

        const sportEmoji = this.getSportEmoji(tip.sport);
        const kickoff = tip.kickoff ? String(tip.kickoff).trim() : "";
        const kickoffText = this.formatKickoffText(kickoff);
        const combinedText = `${tip.competition || ""} ${tip.previewTitle || ""}`.toLowerCase();
        const isFeaturedTennis = String(tip.sport || "").toLowerCase() === "tennis" && (/tennis bet of the day/i.test(combinedText) || /bet of the day/i.test(combinedText));
        const isFeaturedFootball = /bet of the day/i.test(combinedText) || Boolean(tip.isFeatured);

        const mainTip = this.getMainTip(tip);
        const mainSelection = this.formatSelectionWithMarket(mainTip ? (mainTip.selection || mainTip.market || tip.selection || tip.market) : (tip.selection || tip.market || "Selected Tip"), mainTip ? (mainTip.market || tip.market) : tip.market);
        const mainStake = this.getMainStake(tip);
        const verdict = this.cleanPreview(tip.verdict || tip.preview);
        const tipsList = Array.isArray(tip.tips) ? tip.tips : [];
        const lines = [];

        if (isFeaturedTennis) lines.push("Tennis Bet of the Day");
        else if (isFeaturedFootball) lines.push("Bet of the Day");
        else lines.push(this.normalizeLabel(String(tip.sport || "Match")));

        if (tip.homeTeam && tip.awayTeam) lines.push(`${sportEmoji} || ${tip.homeTeam} v ${tip.awayTeam}`);

        const leagueText = this.getLeagueText(tip);
        if (leagueText) lines.push(`League: ${leagueText}`);

        if (kickoffText) lines.push(`Beginning: ${kickoffText}`);

        if (isFeaturedFootball || isFeaturedTennis) {
            lines.push(`Bet: ${mainSelection}`);
            if (mainStake != null) lines.push(`Stake: ${mainStake} Units`);
        } else {
            if (mainSelection) lines.push(`Bet: ${mainSelection}`);
            if (mainStake != null) lines.push(`Stake: ${mainStake} Units`);
        }

        if (verdict) {
            lines.push("");
            lines.push(verdict);
            lines.push("");
        }

        if (tipsList.length > 0) {
            for (const item of tipsList) {
                const normalizedSelection = this.formatSelectionWithMarket(item.selection, item.market);
                const oddsText = Number.isFinite(Number(item.odds)) ? ` @${this.formatOdds(item.odds)}` : "";
                const units = Number(item.units ?? item.stakeUnits ?? 1);
                lines.push(`${normalizedSelection}${oddsText} - ${units} Unit${units === 1 ? "" : "s"}${this.formatOutcome(item.outcome)}`);
            }
        } else if (mainSelection) {
            const oddsText = Number.isFinite(Number(tip.odds)) ? ` @${this.formatOdds(tip.odds)}` : "";
            const units = Number(tip.stakeUnits ?? tip.units ?? 1);
            lines.push(`${mainSelection}${oddsText} - ${units} Unit${units === 1 ? "" : "s"}${this.formatOutcome(tip.outcome)}`);
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
                const normalizedSelection = this.normalizeLabel(item.selection || item.market || "Tip");
                const oddsText = Number.isFinite(Number(item.odds)) ? ` @${this.formatOdds(item.odds)}` : "";
                const units = Number(item.units ?? item.stakeUnits ?? 1);
                lines.push(`${normalizedSelection}${oddsText} - ${units} Unit${units === 1 ? "" : "s"}${this.formatOutcome(item.outcome)}`);
            }
        } else if (tip.selection) {
            const oddsText = Number.isFinite(Number(tip.odds)) ? ` @${this.formatOdds(tip.odds)}` : "";
            const units = Number(tip.stakeUnits ?? tip.units ?? 1);
            lines.push(`${this.normalizeLabel(tip.selection)}${oddsText} - ${units} Unit${units === 1 ? "" : "s"}${this.formatOutcome(tip.outcome)}`);
        }

        return lines.join("\n").trim();
    }

    formatPikkBetterVipCard(tip) {
        return this.formatMaxbetVipCard(tip);
    }

    formatChannelCard({ tip, header, fixturePrefix, showBetOfDayHeader, includeCompetition, includeMarketLabel, titlePrefix, mainChannelName }) {
        if (!tip) return null;

        const sportEmoji = this.getSportEmoji(tip.sport);
        const lines = [];

        lines.push(`${header}${showBetOfDayHeader ? "Bet of the day❗️" : ""}`.trim());

        if (tip.homeTeam && tip.awayTeam) {
            const fixtureText = `${fixturePrefix ? `${fixturePrefix} ` : ""}${tip.homeTeam} v ${tip.awayTeam}`.trim();

            if (fixturePrefix) lines.push(fixtureText);
            else lines.push(`${tip.homeTeam} vs ${tip.awayTeam}`);
        }

        if (showBetOfDayHeader && tip.homeTeam && tip.awayTeam) {
            lines.push("Bet of the Day");
        }

        const kickoff = tip.kickoff ? String(tip.kickoff).trim() : "";
        if (kickoff) {
            lines.push(`Beginning: ${this.formatKickoffText(kickoff)}`);
        }

        const leagueText = this.getLeagueText(tip);
        if (leagueText) {
            lines.push(`League: ${leagueText}`);
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
                lines.push(`${this.formatSelectionWithMarket(item.selection, item.market)}${oddsText} - ${units} Unit${units === 1 ? "" : "s"}${this.formatOutcome(item.outcome)}`);
            }
        } else if (tip.selection) {
            const oddsText = Number.isFinite(Number(tip.odds)) ? ` @${this.formatOdds(tip.odds)}` : "";
            const units = Number(tip.stakeUnits ?? tip.units ?? 1);
            lines.push(`${this.formatSelectionWithMarket(tip.selection, tip.market)}${oddsText} - ${units} Unit${units === 1 ? "" : "s"}${this.formatOutcome(tip.outcome)}`);
        }

        return lines.join("\n").trim();
    }

    formatSelectionWithMarket(selection, market) {
        const normalizedSelection = this.normalizeLabel(selection || "");
        const normalizedMarket = this.normalizeLabel(market || "");

        if (!normalizedSelection) return normalizedMarket || "Tip";
        if (!normalizedMarket) return normalizedSelection;
        if (normalizedSelection.toLowerCase() === normalizedMarket.toLowerCase()) return normalizedSelection;
        if (normalizedSelection.toLowerCase().includes(normalizedMarket.toLowerCase())) return normalizedSelection;
        if (/match result|full time result|winner|moneyline|to win/i.test(normalizedMarket)) return normalizedSelection;
        return `${normalizedSelection} ${normalizedMarket}`;
    }

    getMainSelection(tip) {
        const mainTip = this.getMainTip(tip);
        const selection = mainTip ? mainTip.selection || mainTip.market || tip.selection : tip.selection || tip.market || "Selected Tip";
        const market = mainTip ? mainTip.market || tip.market : tip.market;
        return this.formatSelectionWithMarket(selection, market);
    }

    getMainStake(tip) {
        const mainTip = this.getMainTip(tip);
        const value = Number(mainTip ? (mainTip.units ?? mainTip.stakeUnits ?? tip.stakeUnits ?? 2) : (tip.stakeUnits ?? tip.units ?? 2));
        return Number.isFinite(value) ? value : 2;
    }

    getMainTip(tip) {
        const tipList = Array.isArray(tip.tips) && tip.tips.length > 0 ? tip.tips : [];
        if (tipList.length === 0) {
            return { selection: tip.selection || tip.market || "Selected Tip", units: tip.stakeUnits ?? 2, odds: tip.odds, };
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
                const normalizedSelection = this.normalizeLabel(item.selection || item.market || "Tip");
                const oddsText = Number.isFinite(Number(item.odds)) ? ` @${this.formatOdds(item.odds)}` : "";
                const units = Number(item.units ?? item.stakeUnits ?? 1);
                lines.push(`${normalizedSelection}${oddsText} - ${units} Unit${units === 1 ? "" : "s"}${this.formatOutcome(item.outcome)}`);
            }
        } else if (tip.selection) {
            const oddsText = Number.isFinite(Number(tip.odds)) ? ` @${this.formatOdds(tip.odds)}` : "";
            const units = Number(tip.stakeUnits ?? tip.units ?? 1);
            lines.push(`${this.normalizeLabel(tip.selection)}${oddsText} - ${units} Unit${units === 1 ? "" : "s"}${this.formatOutcome(tip.outcome)}`);
        }

        return lines.join("\n").trim();
    }

    getLeagueText(tip) {
        if (!tip) return "";

        const directLeague = String(tip.league || "").trim();
        const competition = String(tip.competition || "").trim();
        const previewTitle = String(tip.previewTitle || "").trim();
        const sport = String(tip.sport || "").trim();

        const genericSportNames = /^(football|soccer|cricket|volleyball|esports|baseball|basketball|tennis|rugby|boxing|golf|ice hockey|darts|snooker|horse racing|american football|rugby league|rugby union|australian rules)$/i;
        const placeholderLeagueText = /^(some data here|n\/a|na|null|undefined|unknown|tbd|to be determined)$/i;
        const isProbableLocation = (value) => {
            const plain = String(value || "").trim();
            if (!plain) return false;
            return /(North Carolina|California|Florida|Texas|Georgia|Arizona|South Carolina|Nevada|Ohio|Tennessee|Washington|Pennsylvania|New York|England|Scotland|Wales|Ireland|France|Spain|Germany|Italy|Portugal|United States|USA|Canada|Mexico|Australia|New Zealand|South Africa|Japan|Korea|Brazil|Argentina)/i.test(plain);
        };
        const isMeaningful = (value) => {
            const lower = String(value || "").toLowerCase();
            if (!lower || placeholderLeagueText.test(lower)) return false;
            if (/bet of the day|tennis bet of the day|betting tips/i.test(lower)) return false;
            if (lower === sport.toLowerCase()) return false;
            if (genericSportNames.test(lower)) return false;
            if (sport.toLowerCase() === "golf" && isProbableLocation(value)) return false;
            return true;
        };

        // Try direct fields first (league > competition)
        for (const candidate of [directLeague, competition]) {
            if (isMeaningful(candidate)) return this.normalizeLabel(candidate);
        }

        const fixtureTournament = [tip.homeTeam, tip.awayTeam, previewTitle].find((candidate) => {
            if (!candidate) return false;
            const clean = this.normalizeLabel(candidate);
            if (!clean || clean.toLowerCase() === "field") return false;
            if (sport.toLowerCase() === "golf" && isProbableLocation(clean)) return false;
            return /championship|open|masters|cup|classic|international|finals|tour|pga|wta|atp|tournament/i.test(clean);
        });
        if (fixtureTournament) return this.normalizeLabel(fixtureTournament);

        // Always attempt to extract a clean league / tournament name from the previewTitle.
        // The title may contain "Betting Tips" (which isMeaningful would reject as a whole)
        // but still encode a valid league after the dash — e.g.
        // "Five Fears vs Mate y Tapa Betting Tips – ... at RLCS 2026 World Championship"
        if (previewTitle) {
            const extracted = this.extractLeagueFromTitle(previewTitle);
            if (extracted) return this.normalizeLabel(extracted);

            const titleLooksLikeTournament = !/\s+(?:v|vs)\s+/i.test(previewTitle)
                && !/bet of the day|betting tips|predictions|tips/i.test(previewTitle)
                && (sport.toLowerCase() === "golf" || /championship|open|masters|cup|classic|international|finals|tour/i.test(previewTitle));
            if (titleLooksLikeTournament) {
                return this.normalizeLabel(previewTitle);
            }
        }

        if (tip.preview || tip.verdict) {
            const narrative = String(tip.preview || tip.verdict || "");
            const locationMatch = narrative.match(/\bin\s+(?:the\s+)?([A-Z][A-Za-z0-9\s&]+?)(?:[.!?]|$)/);
            if (locationMatch) {
                const candidate = this.normalizeLabel(locationMatch[1]);
                if (candidate && !/bet of the day|betting tips|predictions|tips/i.test(candidate) && !(sport.toLowerCase() === "golf" && isProbableLocation(candidate))) {
                    return candidate;
                }
            }

            const eventLocationMatch = narrative.match(/\b(?:at|in)\s+([A-Z][A-Za-z0-9\s&]+?)(?:[.!?]|$)/);
            if (eventLocationMatch) {
                const candidate = this.normalizeLabel(eventLocationMatch[1]);
                if (candidate && !/bet of the day|betting tips|predictions|tips/i.test(candidate) && !(sport.toLowerCase() === "golf" && isProbableLocation(candidate))) {
                    return candidate;
                }
            }
        }

        if (String(tip.sport || "").toLowerCase() === "tennis") {
            const narrative = String(tip.preview || tip.verdict || "");
            const venueMatch = narrative.match(/\bin\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)/);
            if (venueMatch) {
                const candidate = this.normalizeLabel(venueMatch[1]);
                if (candidate && candidate !== "US" && candidate !== "Open") return `WTA ${candidate}`;
            }
        }

        return "";
    }

    /**
     * Extracts a clean league / competition name from a preview title string.
     * Mirrors the pattern logic in FreeTipsMaxBetScraper.inferLeagueFromUrl.
     *
     * Supported patterns (in priority order):
     *   1. "in the [League Name]"
     *   2. "in [SHORT_LEAGUE]" — e.g. "In MLB", "In the NBA"
     *   3. Dash clause ending "at [the] [League] [Strong?]"
     *   4. Dash clause ending in a known-tournament phrase "[League] Strong"
     *   5. "at [the] [League Name]" standalone (with strict validation)
     *
     * Candidates are validated to exclude generic text like "Betting Tips".
     *
     * @param {string} title
     * @returns {string|null}
     */
    cleanLeagueCandidate(candidate) {
        if (!candidate) return "";
        let clean = String(candidate).trim();
        clean = clean.replace(/\s+(?:Invites|Tips|Predictions|Preview|Matchups?|Clashes?|Matches?|Today|Live|Now)\s*$/i, "");
        clean = clean.replace(/^(?:[A-Z]{2,}\s+(?:and\s+)?[A-Z]{2,}\s+Clash\s+for\s+|[A-Z]{2,}\s+Clash\s+for\s+)/i, "");
        clean = clean.replace(/\s+[–—-]\s*.*$/, "");
        return clean.trim();
    }

    extractLeagueFromTitle(title) {
        if (!title) return null;

        const isValidLeague = (candidate) => {
            if (!candidate || candidate.length < 2 || candidate.length > 60) return false;
            // Reject if contains banned phrases
            if (/betting tips|bet of the day|live stream|predictions|tips$/i.test(candidate)) return false;
            // Must start with uppercase letter
            if (!/^[A-Z]/.test(candidate)) return false;
            return true;
        };

        // 1. "in the [League Name]" at end or before separator
        const inTheMatch = title.match(/\bin\s+the\s+([A-Z][A-Za-z0-9\s&]+?)(?:$|\s*[-–—|])/);
        if (inTheMatch) {
            const candidate = this.cleanLeagueCandidate(inTheMatch[1]);
            if (isValidLeague(candidate)) return candidate;
        }

        // 2. "In [SHORT_LEAGUE]" (e.g. "In MLB", "In the NBA") at end of title
        const inShortMatch = title.match(/\bIn\s+([A-Z]{2,6})(?:\s+[A-Za-z]+)?$/)
            || title.match(/\bIn\s+((?:[A-Z][a-z]+\s?){1,3})$/)
        if (inShortMatch) {
            const candidate = this.cleanLeagueCandidate(inShortMatch[1]);
            if (isValidLeague(candidate)) return candidate;
        }

        // 3. Dash/em-dash clause: "– ... at [the] [League Name]" optionally ending with "Strong"
        const dashAtMatch = title.match(/[–—]\s*.{0,80}\bat\s+(?:the\s+)?([A-Z][A-Za-z0-9\s&]+?)(?:\s+Strong\b|\s+this\b|\s+tonight\b|$)/);
        if (dashAtMatch) {
            const candidate = this.cleanLeagueCandidate(dashAtMatch[1]);
            if (isValidLeague(candidate)) return candidate;
        }

        // 3b. Simple tournament suffix after a dash: "- WTA Guadalajara 2026"
        const trailingDashMatch = title.match(/[-–—|]\s*([A-Z][A-Za-z0-9&\s]*\d{4}?[A-Za-z0-9\s&]*)$/);
        if (trailingDashMatch) {
            const candidate = trailingDashMatch[1].trim();
            if (isValidLeague(candidate)) return this.cleanLeagueCandidate(candidate);
        }

        // 4. Verb-bridge pattern: "– [Team] Expected to [Verb] [LEAGUE] Strong"
        //    e.g. "– Falcons Expected to Start RLCS 2026 World Championship Strong"
        //    Looks for: dash + content + verb + CAPITALIZED_PHRASE + "Strong" at end
        const verbBridgeMatch = title.match(/[–—]\s*.+\b(?:Start|Handle|Win|Begin|Enter|Face|Dominate|Take|Tackle|Compete|Play)\s+((?:[A-Z][A-Za-z0-9]*(?:\s+|\s*&\s*))+\d{4}(?:\s+[A-Za-z]+)*)\s+Strong\s*$/);
        if (verbBridgeMatch) {
            const candidate = this.cleanLeagueCandidate(verbBridgeMatch[1]);
            if (isValidLeague(candidate)) return candidate;
        }

        // 4b. Broader dash-end pattern: anything that ends with "Year Name [Name]+ Strong"
        //     Captures the last title-cased multi-word group with a year before "Strong"
        const yearBeforeStrong = title.match(/([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+)*\s+\d{4}(?:\s+[A-Z][A-Za-z]+)*)\s+Strong\s*$/);
        if (yearBeforeStrong) {
            const candidate = this.cleanLeagueCandidate(yearBeforeStrong[1]);
            if (isValidLeague(candidate)) return candidate;
        }

        // 5. "at [the] [League]" standalone — only if the candidate doesn't look like a team name
        // Require the league contains a year OR 3+ words to avoid matching team names
        const atMatch = title.match(/\bat\s+(?:the\s+)?([A-Z][A-Za-z0-9\s&]+?)(?:\s+Strong\b|\s+this\b|\s+tonight\b|$|\s*[-–—|])/);
        if (atMatch) {
            const candidate = this.cleanLeagueCandidate(atMatch[1]);
            const wordCount = candidate.split(/\s+/).length;
            const hasYear = /\d{4}/.test(candidate);
            // Accept if: has a year, or 3+ words (enough to be a tournament name, not a city/team)
            if (isValidLeague(candidate) && (hasYear || wordCount >= 3)) {
                return candidate;
            }
        }

        return null;
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

        if (value.includes("american football") || value.includes("nfl") || value.includes("american-football")) return "🏈";
        if (value.includes("football") || value.includes("soccer")) return "⚽️";
        if (value.includes("tennis")) return "🎾";
        if (value.includes("cricket")) return "🏏";
        if (value.includes("basketball")) return "🏀";
        if (value.includes("baseball")) return "⚾️";
        if (value.includes("rugby") || value.includes("rugby league") || value.includes("rugby union") || value.includes("australian rules")) return "🏉";
        if (value.includes("volleyball")) return "🏐";
        if (value.includes("boxing")) return "🥊";
        if (value.includes("golf") || value.includes("pga") || value.includes("lpga") || value.includes("european tour") || value.includes("tour championship")) return "⛳️";
        if (value.includes("darts") || value.includes("dart")) return "🎯";
        if (value.includes("snooker") || value.includes("pool")) return "🎱";
        if (value.includes("horse racing") || value.includes("horse-racing") || value.includes("horse")) return "🐎";
        if (value.includes("esport")) return "🎮";
        if (value.includes("ice hockey") || value.includes("hockey")) return "🏒";
        return "💰";
    }

    formatOutcome(outcome) {
        if (outcome === "win") return " ✅✅";
        if (outcome === "lose") return " ❎❎";
        return "";
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
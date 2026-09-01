const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

class VitiBetScraper {
    constructor() {
        this.url = "https://www.vitibet.com/index.php?clanek=tipoftheday&sekce=fotbal&lang=en";
        this.baseUrl = "https://www.vitibet.com/";

        this.snapshotDir = path.resolve(__dirname, "..", "tests", "vitibet");

        this.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        };
    }

    resolveUrl(href) {
        if (!href) return null;

        try {
            return new URL(href, this.baseUrl).toString();
        } catch {
            return href;
        }
    }

    cleanSnapshotDirectory() {
        try {
            if (!fs.existsSync(this.snapshotDir)) return;

            for (const entry of fs.readdirSync(this.snapshotDir, { withFileTypes: true, })) {
                if (entry.isDirectory()) continue;

                const entryPath = path.join(this.snapshotDir, entry.name);

                if (/\.(html?|htm)$/i.test(entry.name)) fs.rmSync(entryPath, { force: true });
                
            }
        } catch {}
    }

    extractFixtureId(url) {
        if (!url) return null;

        try {
            const parsed = new URL(url);
            return parsed.searchParams.get("fixture_id") || null;
        } catch {
            return null;
        }
    }

    extractLeague(element, $) {
        const leagueElement = $(element).find(".viti-v6-match-league").first();

        if (!leagueElement.length) return null;
        const league = leagueElement.clone().find(".viti-v6-m-time").remove().end().text().replace(/\s+/g, " ").trim();

        return league || null;
    }

    extractTime(element, $) {
        const timeText = $(element).find(".viti-v6-m-time").first().text().replace(/\s+/g, " ").trim();
        if (!timeText) return null;

        const match = timeText.match(/\b(\d{1,2}):(\d{2})\b/);
        if (!match) return null;

        const hours = Number(match[1]);
        const minutes = Number(match[2]);

        if (hours > 23 || minutes > 59) {
            return null;
        }

        return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }

    extractTeams(card, $) {
        const teams = card.find(".viti-v6-team-side");

        return {
            homeTeam: teams.first().find(".viti-v6-team-name").text().trim() || null,
            awayTeam: teams.last().find(".viti-v6-team-name").text().trim() || null,
        };
    }

    async fetchDetailPage(url) {
        if (!url) {
            return {
                previewTitle: null,
                preview: null,
                analytics: null,
                detailsUrl: null,
                fixtureId: null,
            };
        }

        try {
            const response = await axios.get(url, { headers: this.headers, });
            const $ = cheerio.load(response.data);

            return {
                previewTitle: this.extractTitle($),
                preview: this.extractPreview($),
                analytics: this.extractAnalytics($),
                detailsUrl: url,
                fixtureId: this.extractFixtureId(url),
            };
        } catch {
            return {
                previewTitle: null,
                preview: null,
                analytics: null,
                detailsUrl: url,
                fixtureId: this.extractFixtureId(url),
            };
        }
    }

    extractTitle($) {
        const candidates = ["h1", "h2", "h3", ".match-title", ".viti-v6-main-title", "#match-title",];

        for (const selector of candidates) {
            const text = $(selector).first().text().trim();
            if (text) return text;
        }

        return null;
    }

    extractPreview($) {
        const bodyText = $("body").text().replace(/\s+/g, " ").trim();
        const marker = "Match Preview";
        const markerIndex = bodyText.indexOf(marker);
        if (markerIndex !== -1) return bodyText.slice(markerIndex + marker.length).trim().slice(0, 1500);
        
        return null;
    }

    extractAnalytics($) {
        const bodyText = $("body").text().replace(/\s+/g, " ").trim();
        const marker = "Vitibet Analytics";
        const markerIndex = bodyText.indexOf(marker);
        if (markerIndex !== -1) {
            return bodyText.slice(markerIndex + marker.length).trim().slice(0, 1000);
        }

        return null;
    }

    async scrape() {
        try {
            console.log("Fetching Vitibet...");

            this.cleanSnapshotDirectory();
            fs.mkdirSync(this.snapshotDir, { recursive: true, });

            const response = await axios.get(this.url, { headers: this.headers, });
            const { data } = response;

            fs.writeFileSync(path.join(this.snapshotDir, "vitibet.html"), data);

            const $ = cheerio.load(data);
            const root = $("#tipoftheday");

            if (!root.length) throw new Error("Unable to find #tipoftheday on the Vitibet page");
            

            const results = [];
            const sections = root.find(".viti-v6-sport-section").toArray();

            for (const section of sections) {
                const sport = $(section).find(".viti-v6-sport-title").first().text().replace(/\s+/g, " ").trim();
                const items = $(section).find(".viti-v6-item-wrap").toArray();

                for (const item of items) {
                    const card = $(item).find("a.viti-v6-card").first();
                    if (!card.length) continue;

                    const href = card.attr("href") || "";
                    const url = this.resolveUrl(href);

                    // Important:
                    // Vitibet's match time can live on the item wrapper
                    // rather than inside the <a> card.
                    const league = this.extractLeague(item, $);
                    const time = this.extractTime(item, $);

                    const { homeTeam, awayTeam } = this.extractTeams(card, $);

                    const score = card.find(".viti-v6-m-score").text().trim();
                    const prediction = card.find(".viti-v6-badge").text().trim();
                    const indexText = card.find(".viti-v6-m-index").text().replace(/INDEX:\s*/i, "").trim();

                    const detail = await this.fetchDetailPage(url);

                    results.push({
                        sport: sport || null,
                        league: league || null,
                        homeTeam,
                        awayTeam,
                        time: time || null,
                        score: score || null,
                        prediction: prediction || null,
                        index: indexText || null,
                        url: url || null,
                        ...detail,
                    });
                }
            }

            console.log(`Extracted ${results.length} tips from Vitibet.`);

            return results;
        } catch (err) {
            console.error("SCRAPER ERROR:", err);
            return [];
        }
    }
}

module.exports = VitiBetScraper;
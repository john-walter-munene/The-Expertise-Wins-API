const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

class TipsBetScraper {
    constructor() {
        this.url = "https://tipsbet.co.uk/";
        this.baseUrl = "https://tipsbet.co.uk/";

        this.snapshotDir = path.resolve(__dirname, "..", "tests", "tipsbet");

        this.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        };
    }

    cleanSnapshotDirectory() {
        try {
            if (!fs.existsSync(this.snapshotDir)) return;

            for (const entry of fs.readdirSync(this.snapshotDir, { withFileTypes: true, })) {
                if (entry.isDirectory()) continue;
                const entryPath = path.join(this.snapshotDir, entry.name);

                if (/\.(html?|htm)$/i.test(entry.name)) {
                    fs.rmSync(entryPath, { force: true, });
                }
            }
        } catch {} // Ignore failing clean up errors silently
    }

    getTodayString() {
        const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", day: "2-digit", month: "2-digit", year: "numeric", });
        const parts = formatter.formatToParts(new Date());
        const day = parts.find((part) => part.type === "day")?.value;
        const month = parts.find((part) => part.type === "month")?.value;
        const year = parts.find((part) => part.type === "year")?.value;

        return `${day}.${month}.${year}`;
    }

    findDailyHeading($) {
        const todayString = this.getTodayString();
        
        let heading = null;

        $("h1,h2,h3,h4,h5,strong").each(
            (_, element) => {
                const text = $(element).text().replace(/\s+/g, " ").trim();

                if (text.includes("Free Betting Tips") && text.includes(todayString)) {
                    heading = $(element);
                    return false;
                }
            }
        );

        return heading;
    }

    findDailyTable($) {
        const heading = this.findDailyHeading($);

        if (!heading || !heading.length) {
            console.log(`Couldn't find today's TipsBet heading: Free Betting Tips – ${this.getTodayString()}`);
            return null;
        }

        console.log(`Found today's heading: "${heading.text().replace(/\s+/g, " ").trim()}"`);

        // First try the table that belongs directly to the heading.
        const directTable = heading.nextAll("table").first();
        if (directTable.length && this.isTipsTable($, directTable)) return directTable;

        // If the table is wrapped inside a container,
        // inspect the heading's parent and nearby content.
        
        const parent = heading.parent();
        const parentTable = parent.find("table").first();

        if (parentTable.length && this.isTipsTable($, parentTable)) {
            return parentTable;
        }

        // Walk forward through nearby siblings and
        // inspect tables until we reach another major heading.

        let current = heading;

        for (let i = 0; i < 20; i++) {
            current = current.next();

            if (!current || !current.length) break;
            if (current.is("h1,h2,h3,h4,h5")) break;

            const table = current.find("table").first();
            if (table.length && this.isTipsTable($, table)) return table;

            if (current.is("table") && this.isTipsTable($, current)) { return current; }
        }

        return null;
    }

    isTipsTable($, table) {
        if (!table || !table.length) return false;

        const rows = table.find("tr");
        if (rows.length < 2) return false;

        const header = rows.first().text().replace(/\s+/g, " ").toLowerCase();

        // Require the actual TipsBet table structure.
        const requiredColumns = [
            "time",
            "country",
            "sport",
            "competitions",
            "teams",
            "tip",
            "odds",
            "results",
        ];

        return requiredColumns.every((column) => header.includes(column));
    }

    findFallbackTable($) {
        console.log("Trying TipsBet table fallback...");

        let fallback = null;

        $("table").each((_, table) => {
            if (this.isTipsTable($, $(table))) {
                fallback = $(table);
                return false;
            }
        });

        return fallback;
    }

    extractTeams(text) {
        if (!text) {
            return { homeTeam: null, awayTeam: null, };
        }

        // TipsBet uses an en dash: Team A – Team B
        const parts = text.split("–").map((team) => team.trim()).filter(Boolean);

        return { homeTeam: parts[0] || null, awayTeam: parts[1] || null, };
    }

    extractOdds(text) {
        if (!text) return null;
        const value = parseFloat(String(text).replace(",", ".").trim());
        return Number.isFinite(value)? value : null;
    }

    extractResult(text) {
        if (!text) return "?";
        const result = String(text).replace(/\s+/g, " ").trim();
        return result || "?";
    }

    extractRows($, table) {
        const tips = [];

        $(table).find("tr").each((index, row) => {
                if (index === 0) return;

                const cells = $(row).find("td");

                if (cells.length < 9) return; 

                const kickoff = $(cells[0]).text().replace(/\s+/g, " ").trim();
                const country = $(cells[2]).text().replace(/\s+/g, " ").trim();
                const sport = $(cells[3]).text().replace(/\s+/g, " ").trim();
                const competition = $(cells[4]).text().replace(/\s+/g, " ").trim();
                const teams = $(cells[5]).text().replace(/\s+/g, " ").trim();
                const market = $(cells[6]).text().replace(/\s+/g, " ").trim();
                const odds = this.extractOdds($(cells[7]).text());
                const result = this.extractResult($(cells[8]).text());
                const { homeTeam, awayTeam, } = this.extractTeams(teams);

                //  * Don't emit malformed rows.
                if (!homeTeam || !awayTeam) return;
 
                tips.push({
                    kickoff: kickoff || null,
                    country: country || null,
                    sport: sport || null,
                    competition: competition || null,
                    homeTeam,
                    awayTeam,
                    market: market || null,
                    odds,
                    result,
                });
            });

        return tips;
    }

    async scrape() {
        try {
            console.log("Fetching TipsBet...");

            this.cleanSnapshotDirectory();
            fs.mkdirSync(this.snapshotDir, { recursive: true, });

            const response = await axios.get(this.url, { headers: this.headers, });
            const { data } = response;

            fs.writeFileSync(path.join(this.snapshotDir, "tipsbet.html"), data);

            const $ = cheerio.load(data);
            let todayTable = this.findDailyTable($);

            // Only fall back if the exact daily heading/table could not be located.
            if (!todayTable || !todayTable.length) {
                console.log("Today's table could not be located.");
                todayTable = this.findFallbackTable($);
            }

            if (!todayTable || !todayTable.length) {
                console.log("No valid TipsBet betting table found.");
                return [];
            }

            console.log(`Found TipsBet table with ${todayTable.find("tr").length} rows.`);

            const tips = this.extractRows($, todayTable);
            console.log(`Extracted ${tips.length} tips from TipsBet.`);

            return tips;
        } catch (err) {
            console.error("TIPSBET SCRAPER ERROR:", err);
 
            return [];
        }
    }
}

module.exports = TipsBetScraper;
const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

// Downloads the latest page from the site FIRST, then parses it.
// This ensures we always work with the latest data, like Vitibet and TipsBet.
//
// The site is behind Cloudflare's JavaScript challenge, which plain HTTP
// requests (axios) cannot pass. We therefore use Puppeteer to drive the
// system-installed Chrome/Edge browser, which executes the challenge and
// returns the real page HTML, which is then saved to the local file.
//
// Fallback chain (in order):
//   1. Puppeteer + system Chrome/Edge (bypasses Cloudflare JS challenge)
//   2. axios (plain HTTP, may fail with 403 "Just a moment...")
//   3. existing local freetips.html (last resort; stale but usable)
class FreeTipsMaxBetScraper {
    constructor() {
        this.url = "https://www.freetips.com/betting/";
        this.betOfTheDayUrl = "https://www.freetips.com/betting/bet-of-the-day/";
        this.tennisBetOfTheDayUrl = "https://www.freetips.com/betting/tennis-bet-of-the-day/";
        this.baseUrl = "https://www.freetips.com";

        // Always refresh the local HTML file from the site before scraping.
        this.useLocalHtml = true;

        // Candidate locations for the local HTML file.
        // If a path is provided, it overrides these candidates.
        this.localHtmlCandidates = [
            path.resolve(process.cwd(), "freetips.html"),
            path.resolve(__dirname, "..", "tests", "freetips.html"),
            path.resolve(__dirname, "freetips.html"),
        ];

        // All fetched tip pages should be stored under tests/ so the scraper can
        // inspect the saved HTML before parsing it again.
        this.localSnapshotDir = path.resolve(__dirname, "..", "tests", "freetips-pages");

        // Allows tests / callers to override the exact local file path.
        this.localHtmlPath = null;

        this.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        };

        // Paths to system-installed Chromium-based browsers used with Puppeteer
        // to solve Cloudflare's JS challenge. First existing path wins.
        this.chromeExecutableCandidates = [
            "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
            "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
            "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
            "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
            process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe") : null,
        ].filter(Boolean);
    }

    resolveUrl(href) {
        if (!href) return null;

        try {
            return new URL(href, this.baseUrl).toString();
        } catch {
            return href;
        }
    }

    resolveLocalFilePath() {
        if (this.localHtmlPath) return this.localHtmlPath;

        const existing = this.localHtmlCandidates.find((candidate) => fs.existsSync(candidate));
        return existing || this.localHtmlCandidates[0];
    }

    resolveChromeExecutable() {
        return this.chromeExecutableCandidates.find((candidate) => fs.existsSync(candidate)) || null;
    }

    buildLocalSnapshotPath(url) {
        if (!url) return null;

        try {
            const parsed = new URL(url);
            const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
            const segments = pathname.split("/").filter(Boolean);
            const slug = segments[segments.length - 1] || "index";
            return path.join(this.localSnapshotDir, `${slug}.html`);
        } catch {
            return path.join(this.localSnapshotDir, `${String(url).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "page"}.html`);
        }
    }

    writePageSnapshot(url, html) {
        if (!url || !html) return null;

        const snapshotPath = this.buildLocalSnapshotPath(url);
        if (!snapshotPath) return null;

        try {
            fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
            fs.writeFileSync(snapshotPath, html, "utf8");
            return snapshotPath;
        } catch {
            return null;
        }
    }

    /**
     * Downloads the latest page from the site and overwrites the local HTML file.
     * Fallback chain:
     *   1. Puppeteer + system Chrome/Edge (bypasses Cloudflare JS challenge)
     *   2. axios (plain HTTP, may return Cloudflare challenge)
     *   3. existing local freetips.html (last resort)
     */
    async refreshLocalHtml(localFile) {
        if (this.localHtmlPath) {
            console.log(`Using explicit local freetips fixture at ${localFile}.`);
            return fs.readFileSync(localFile, "utf8");
        }

        console.log(`Refreshing local freetips.html from ${this.url} ...`);

        let html = null;
        let lastError = null;

        const chromePath = this.resolveChromeExecutable();
        if (chromePath) {
            try {
                html = await this.fetchWithBrowser(chromePath);
                console.log("Downloaded latest page via Puppeteer + Chrome.");
            } catch (browserError) {
                lastError = browserError;
                console.log("Puppeteer fetch failed:", browserError.message);
            }
        } else {
            console.log("No system Chrome/Edge found; falling back to axios.");
        }

        if (!html) {
            try {
                html = await this.fetchWithAxios();
                console.log("Downloaded latest page via axios.");
            } catch (axiosError) {
                lastError = axiosError;
                console.log("Axios fetch failed:", axiosError.message);
            }
        }

        if (html) {
            fs.writeFileSync(localFile, html, "utf8");
            this.writePageSnapshot(this.url, html);
            console.log("Local freetips.html overwritten with latest data.");
            return html;
        }

        if (fs.existsSync(localFile)) {
            console.log("All live fetches failed, using existing local freetips.html...");
            return fs.readFileSync(localFile, "utf8");
        }

        throw new Error(
            "Unable to fetch freetips page via browser, axios, or local file." +
            (lastError ? ` Last error: ${lastError.message}` : "")
        );
    }

    /**
     * Uses Puppeteer to drive the system Chrome/Edge browser, waits for
     * Cloudflare's JS challenge to clear, and returns the final page HTML.
     */
    async fetchWithBrowser(chromePath, targetUrl = this.url) {
        const puppeteer = require("puppeteer");

        const browser = await puppeteer.launch({
            executablePath: chromePath,
            headless: "new",
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-blink-features=AutomationControlled",
                "--disable-dev-shm-usage",
            ],
            defaultViewport: { width: 1366, height: 768 },
        });

        try {
            const page = await browser.newPage();
            await page.setUserAgent(this.headers["User-Agent"]);
            await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9", });
            await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

            // Wait for the Cloudflare challenge to clear and real content to appear.
            const contentSelector = ".matchlist.betacctime, .matchlist, h1";
            const maxWaitMs = 60000;
            const start = Date.now();

            while (Date.now() - start < maxWaitMs) {
                const html = await page.content();

                const hasChallenge = html.includes("Just a moment...") || html.includes("challenge-platform") || html.includes("cf-mitigated");
                const hasContent = await page.$(contentSelector).then((el) => Boolean(el)).catch(() => false);

                if (!hasChallenge && hasContent) return html;

                await new Promise((resolve) => setTimeout(resolve, 2000));
            }

            // Timeout reached: return the page content if it's not still the
            // challenge page; otherwise throw.
            const finalHtml = await page.content();
            if (!finalHtml.includes("Just a moment...")) return finalHtml;

            throw new Error("Cloudflare challenge did not clear within timeout.");
        } finally {
            await browser.close();
        }
    }

    /** Plain axios fallback. Throws if Cloudflare returns the challenge page. */
    async fetchWithAxios() {
        const response = await axios.get(this.url, {
            headers: {
                ...this.headers,
                Referer: "https://www.freetips.com/",
                Origin: "https://www.freetips.com",
            },
            timeout: 30000,
            maxRedirects: 5,
        });

        const data = response.data;
        if (typeof data === "string" && data.includes("Just a moment...")) {
            throw new Error("Cloudflare challenge returned for axios request.");
        }

        return data;
    }

    async fetchWithAxiosOrBrowser(targetUrl = this.url) {
        const chromePath = this.resolveChromeExecutable();
        if (chromePath) {
            try {
                const html = await this.fetchWithBrowser(chromePath, targetUrl);
                if (html && !html.includes("Just a moment...")) return html;
            } catch (error) {
                console.log("Browser fetch for target page failed:", error.message);
            }
        }

        try {
            const response = await axios.get(targetUrl, {
                headers: { ...this.headers, Referer: "https://www.freetips.com/", Origin: "https://www.freetips.com" },
                timeout: 30000,
                maxRedirects: 5,
            });
            const data = response.data;
            if (typeof data === "string" && data.includes("Just a moment...")) {
                throw new Error("Cloudflare challenge returned for axios request.");
            }
            return data;
        } catch (error) {
            if (targetUrl === this.url && fs.existsSync(this.resolveLocalFilePath())) {
                return fs.readFileSync(this.resolveLocalFilePath(), "utf8");
            }
            throw error;
        }
    }

    /** Reads the existing local HTML file without downloading. */
    readLocalHtml(localFile) {
        console.log("Loading local freetips.html...");
        return fs.readFileSync(localFile, "utf8");
    }

    readPageSnapshot(url) {
        const snapshotPath = this.buildLocalSnapshotPath(url);
        return snapshotPath && fs.existsSync(snapshotPath) ? fs.readFileSync(snapshotPath, "utf8") : null;
    }

    isUsableSnapshot(url, html) {
        if (!html) return false;

        const $ = cheerio.load(html);
        const documentText = $("body").text().replace(/\s+/g, " ").trim();
        if (/betting\/$/i.test(url) && /Today's Betting Tips|Today’s Betting Tips/i.test(documentText)) return true;
        if (/bet-of-the-day/i.test(url) || /tennis-bet-of-the-day/i.test(url)) {
            return $(".matchlist.betacctime").length > 0 && !/Today's Betting Tips & Acca Tips|Today’s Betting Tips & Acca Tips/i.test(documentText);
        }

        if (/Today's Betting Tips|Today’s Betting Tips/i.test(documentText)) return false;

        const title = $("h1, .entry-title, .post-title, .match-title, .single-title, .article-title").first().text().trim();
        const detailData = this.extractDetailMarketData($);
        if (!title || !(detailData.selection || detailData.odds)) return false;

        try {
            const pathname = new URL(url, this.baseUrl).pathname;
            const slug = pathname.split("/").filter(Boolean).pop() || "";
            const tokens = slug
                .replace(/\d{8}-\d{4}/g, "")
                .split(/[^a-z0-9]+/i)
                .filter((token) => token.length > 3 && !/^(tips?|predictions?|betting|live|stream|and|the|vs?)$/i.test(token));
            const matchedTokens = tokens.filter((token) => documentText.toLowerCase().includes(token.toLowerCase()));
            return matchedTokens.length >= Math.min(2, tokens.length);
        } catch {
            return false;
        }
    }

    async downloadPage(url, localFallback = null) {
        if (localFallback) {
            const html = this.readLocalHtml(localFallback);
            this.writePageSnapshot(url, html);
            return html;
        }

        const savedHtml = this.readPageSnapshot(url);
        if (this.isUsableSnapshot(url, savedHtml)) return savedHtml;

        const html = await this.fetchWithAxiosOrBrowser(url);
        this.writePageSnapshot(url, html);
        return html;
    }

    async parseSavedDetailPage(url) {
        const html = this.readPageSnapshot(url);
        if (!html || !this.isUsableSnapshot(url, html)) return this.fetchDetailPage(url);

        return this.parseDetailPage(url, html);
    }

    async scrape() {
        try {
            const localFile = this.resolveLocalFilePath();

            if (!localFile) {
                throw new Error("No local HTML path available for freetips. Provide localHtmlPath or configure localHtmlCandidates.");
            }

            const useLocalFixture = Boolean(this.localHtmlPath) || fs.existsSync(localFile);
            const featuredUrls = [this.betOfTheDayUrl, this.tennisBetOfTheDayUrl];
            const featuredTips = [];

            for (const featuredUrl of featuredUrls) {
                const featuredHtml = await this.downloadPage(featuredUrl);
                const featuredTip = this.extractMainTip(cheerio.load(featuredHtml), featuredUrl);
                if (featuredTip) {
                    featuredTips.push({
                        ...featuredTip,
                        url: featuredTip.url || featuredUrl,
                        detailsUrl: featuredTip.detailsUrl || featuredUrl,
                    });
                }
            }

            const html = this.useLocalHtml ? await this.refreshLocalHtml(localFile) : this.readLocalHtml(localFile);
            this.writePageSnapshot(this.url, html);
            const $ = cheerio.load(html);
            const listingTips = this.extractListingTips($);

            const results = [];
            const seen = new Set();

            const enrichTip = (tip) => {
                const isFeaturedTip = /\/betting\/(?:bet-of-the-day|tennis-bet-of-the-day)\/?$/i.test(tip.detailsUrl || tip.url || "");
                const detail = tip.detailsUrl && !isFeaturedTip ? this.parseSavedDetailPage(tip.detailsUrl) : Promise.resolve({});
                return detail.then((detailData) => ({
                    ...tip,
                    ...detailData,
                    market: detailData.market || tip.market || null,
                    selection: detailData.selection || tip.selection || tip.prediction || null,
                    prediction: detailData.selection || tip.selection || tip.prediction || null,
                    odds: detailData.odds ?? tip.odds ?? null,
                    previewTitle: detailData.previewTitle || tip.previewTitle || "Match Preview",
                    preview: detailData.preview || tip.preview || null,
                    analytics: detailData.analytics || tip.analytics || null,
                    url: detailData.detailsUrl || tip.detailsUrl || null,
                    detailsUrl: detailData.detailsUrl || tip.detailsUrl || null,
                    fixtureId: detailData.fixtureId || tip.fixtureId || null,
                }));
            };

            for (const featuredTip of featuredTips) {
                const enrichedFeaturedTip = await enrichTip(featuredTip);
                const featuredKey = enrichedFeaturedTip.detailsUrl || enrichedFeaturedTip.url;
                if (!featuredKey || seen.has(featuredKey)) continue;
                results.push(enrichedFeaturedTip);
                seen.add(featuredKey);
            }

            for (const tip of listingTips) {
                const detailsUrl = tip.detailsUrl || tip.url;
                if (!detailsUrl || seen.has(detailsUrl)) continue;

                await this.downloadPage(detailsUrl);
                const enrichedTip = await enrichTip(tip);
                if (!enrichedTip.selection && !enrichedTip.prediction) continue;
                if (/^Raffle\.?$/i.test(enrichedTip.selection || enrichedTip.prediction || "")) continue;
                results.push(enrichedTip);
                seen.add(enrichedTip.detailsUrl || enrichedTip.url);
            }

            const orderedResults = results.sort((a, b) => {
                const aBet = /\/betting\/bet-of-the-day\/?$/i.test(a.detailsUrl || a.url || "") || /bet of the day/i.test(a.previewTitle || a.league || "");
                const bBet = /\/betting\/bet-of-the-day\/?$/i.test(b.detailsUrl || b.url || "") || /bet of the day/i.test(b.previewTitle || b.league || "");
                return Number(bBet) - Number(aBet);
            });

            console.log(`Extracted ${orderedResults.length} freetips from bet-of-day + match preview listings.`);
            return orderedResults;
        } catch (err) {
            console.error("SCRAPER ERROR:", err.message);
            return [];
        }
    }

    inferSportFromUrl(url) {
        if (!url) return "Football";

        try {
            const pathname = new URL(url, this.baseUrl).pathname.toLowerCase();
            if (/\/esports\//.test(pathname)) return "Esports";
            if (/\/horse-racing\//.test(pathname)) return "Horse Racing";
            if (/\/tennis\//.test(pathname)) return "Tennis";
            if (/\/cricket\//.test(pathname)) return "Cricket";
            if (/\/basketball\//.test(pathname)) return "Basketball";
            if (/\/australian-rules\//.test(pathname)) return "Australian Rules";
            if (/\/rugby-league\//.test(pathname)) return "Rugby League";
            if (/\/rugby-union\//.test(pathname)) return "Rugby Union";
            if (/\/volleyball\//.test(pathname)) return "Volleyball";
            if (/\/rugby\//.test(pathname)) return "Rugby";
            if (/\/boxing\//.test(pathname)) return "Boxing";
            if (/\/golf\//.test(pathname)) return "Golf";
            if (/\/baseball\//.test(pathname)) return "Baseball";
            if (/\/ice-hockey\//.test(pathname)) return "Ice Hockey";
            if (/\/darts\//.test(pathname)) return "Darts";
            if (/\/snooker\//.test(pathname)) return "Snooker";
        } catch {
            // fall through to default below
        }

        return "Football";
    }

    inferLeagueFromUrl(url) {
        if (!url) return "Betting Tips";

        try {
            const pathname = new URL(url, this.baseUrl).pathname.toLowerCase();
            if (/\/football\//.test(pathname)) return "Football";
            if (/\/esports\//.test(pathname)) return "Esports";
            if (/\/horse-racing\//.test(pathname)) return "Horse Racing";
            if (/\/tennis\//.test(pathname)) return "Tennis";
            if (/\/cricket\//.test(pathname)) return "Cricket";
            if (/\/basketball\//.test(pathname)) return "Basketball";
            if (/\/australian-rules\//.test(pathname)) return "Australian Rules";
            if (/\/rugby-league\//.test(pathname)) return "Rugby League";
            if (/\/rugby-union\//.test(pathname)) return "Rugby Union";
            if (/\/volleyball\//.test(pathname)) return "Volleyball";
        } catch {
            // fall through to default below
        }

        return "Betting Tips";
    }

    extractFixtureId(url) {
        if (!url) return null;

        try {
            const parsed = new URL(url);
            const segments = parsed.pathname.split("/").filter(Boolean);
            const last = segments[segments.length - 1] || "";
            const match = last.match(/(\d{8}-\d{4})/);
            return match ? match[1] : null;
        } catch {
            return null;
        }
    }

    splitTeams(rawTitle) {
        if (!rawTitle) return [null, null];

        const cleaned = rawTitle
            .replace(/\s+/g, " ")
            .replace(/[\u2013\u2014]/g, " - ")
            .trim();

        const vsMatch = cleaned.match(/^(.*?)\s+(?:v|vs)\s+(.*)$/i);
        if (vsMatch) {
            return [vsMatch[1].trim() || null, vsMatch[2].trim() || null];
        }

        const dashMatch = cleaned.match(/^(.*?)\s+-\s+(.*)$/);
        if (dashMatch) {
            return [dashMatch[1].trim() || null, dashMatch[2].trim() || null];
        }

        return [cleaned || null, null];
    }

    isLikelyMatchPreviewUrl(href) {
        if (!href) return false;
        if (/\/link\//i.test(href) || /betting-sites|free-bets|signup|login|sitehelp|promotion-codes|bonus\/|bookie-specials/i.test(href)) return false;

        const url = this.resolveUrl(href);
        if (!url) return false;

        try {
            const pathname = new URL(url).pathname.toLowerCase();
            if (/\/betting\/(?:bet-of-the-day|football-correct-score-accumulator|football-draw-accumulator|daily-double-tips|tasty-treble-tips|bankroll-builder-tips|mega-bet-tips|football-over-under|football-win-accumulator|football-anytime-goalscorer|football-both-teams-to-score|banker-of-the-day|tennis-bet-of-the-day|daily-treble-tips|football-first-goalscorer|football-win-accumulator-predictions-betting-tips|football-both-teams-to-score-win-accumulator)/i.test(pathname)) {
                return false;
            }

            if (/\/(?:esports|football|tennis|horse-racing|cricket|basketball|australian-rules|rugby-league|rugby-union|volleyball|rugby|boxing|golf|baseball|ice-hockey|darts|snooker|bookie-specials)\//.test(pathname)) {
                return /\/(?:tips|predictions|live-stream|betting)\//.test(pathname) || /\d{8}-\d{4}/.test(pathname);
            }

            if (/\/betting\//.test(pathname)) {
                return !/\/betting\/(?:bet-of-the-day|football-correct-score-accumulator|football-draw-accumulator|daily-double-tips|tasty-treble-tips|bankroll-builder-tips|mega-bet-tips|football-over-under|football-win-accumulator|football-anytime-goalscorer|football-both-teams-to-score|banker-of-the-day|tennis-bet-of-the-day|daily-treble-tips|football-first-goalscorer|football-win-accumulator-predictions-betting-tips|football-both-teams-to-score-win-accumulator)/i.test(pathname);
            }

            return false;
        } catch {
            return false;
        }
    }

    findTipsPreviewSection($) {
        const heading = $("h1,h2,h3,h4,h5").filter((_, el) => {
            const text = $(el).text().replace(/\s+/g, " ").trim().toLowerCase();
            return text.includes("today's tips & match previews") || text.includes("today’s tips & match previews") || text.includes("today's tips and match previews") || text.includes("today’s tips and match previews");
        }).first();

        if (heading.length) {
            const bettingTips = heading.closest(".bettingTips, .matchTips, .matchprediction");
            if (bettingTips.length) return bettingTips;

            const section = heading.closest("section, article, div");
            if (section.length) return section;
        }

        const tableSection = $(".tipTable").first().closest("section, div, article, body");
        return tableSection.length ? tableSection : $("body");
    }

    extractListingTips($) {
        const tips = [];
        const seen = new Set();
        const scope = this.findTipsPreviewSection($);
        const fallbackScope = scope.find("article, li, div, section").toArray();
        const rowCandidates = scope.find(".tipTable li:not(.head), article.tip-item, li[data-eventid], .match-row").toArray();
        const candidateBlocks = rowCandidates.length ? rowCandidates : fallbackScope;

        for (const el of candidateBlocks) {
            const $el = $(el);
            const text = $el.text().replace(/\s+/g, " ").trim();
            if (!text || /today'?s accas?/i.test(text)) continue;

            const eventLinks = $el.find("a[href]").toArray().filter((link) => this.isLikelyMatchPreviewUrl($(link).attr("href")));
            if (!eventLinks.length) continue;

            const primaryLink = $(eventLinks[0]);
            const detailsUrl = this.resolveUrl(primaryLink.attr("href"));
            if (!detailsUrl || seen.has(detailsUrl)) continue;

            const titleText = primaryLink.text().replace(/\s+/g, " ").trim();
            if (!titleText || /bet of the day|daily double|tasty treble|bankroll builder|mega bet|acca|accumulator|nap of the day|tennis bet of the day/i.test(titleText)) continue;

            const sectionText = text;
            const startsText = $el.find(".startsT, .stTime, .timeing, [class*='start']").first().text().replace(/\s+/g, " ").trim();
            const returnsEl = $el.find(".returns").first().length ? $el.find(".returns").first() : $el.find(".rtn").first();
            const returnsText = returnsEl.text().replace(/\s+/g, " ").trim();
            const returnsMatch = (returnsText && /\d+(?:\.\d+)?/.test(returnsText)) ? returnsText.match(/\d+(?:\.\d+)?/g).slice(-1)[0] : (sectionText.match(/Returns\s*\$?\s*(\d+(?:\.\d+)?)/i) || sectionText.match(/\$\s*(\d+(?:\.\d+)?)/i) || [null, null])[1];
            const odds = returnsMatch ? Number(returnsMatch) : null;
            const startsFromText = (sectionText.match(/Starts\s+([A-Za-z0-9hmsd: ]+?)(?=\s*(?:Returns|\$)\b|$)/i) || [null, null])[1];
            const startsMatch = startsText || startsFromText;
            const [homeTeam, awayTeam] = this.splitTeams(titleText);
            if (!homeTeam && !awayTeam) continue;

            if (!startsMatch && !odds) continue;

            seen.add(detailsUrl);
            tips.push({
                sport: this.inferSportFromUrl(detailsUrl),
                league: this.inferLeagueFromUrl(detailsUrl),
                homeTeam: homeTeam || titleText,
                awayTeam: awayTeam || "Event",
                time: startsMatch ? startsMatch.trim() : null,
                score: null,
                market: "Match Result",
                prediction: null,
                index: null,
                url: detailsUrl,
                previewTitle: titleText,
                preview: null,
                analytics: null,
                detailsUrl,
                fixtureId: this.extractFixtureId(detailsUrl),
                extraTips: [],
                odds,
            });
        }

        return tips;
    }

    extractMarketAndSelectionFromText(text) {
        const normalized = (text || "").replace(/\s+/g, " ").trim();
        if (!normalized) {
            return { market: null, selection: null, odds: null };
        }

        const primaryMoneyline = normalized.match(/\b([A-Z][A-Z0-9&.'/-]*(?:\s+[A-Z][A-Z0-9&.'/-]*)*?)\s+(To Win Moneyline)\s*@\s*(\d+(?:\.\d+)?)/i);
        if (primaryMoneyline) {
            return { market: primaryMoneyline[2], selection: primaryMoneyline[1].trim(), odds: Number(primaryMoneyline[3]) };
        }

        const marketTokens = [
            "To Win Moneyline",
            "Map Handicap",
            "Match Handicap",
            "Double Chance",
            "Draw No Bet",
            "Anytime Goalscorer",
            "First Goalscorer",
            "Correct Score",
            "Alternative Total Goals",
            "Total Goals",
            "Both Teams To Score",
            "Both Teams to Score",
            "BTTS Yes",
            "BTTS",
            "Home Win",
            "Away Win",
            "Win to Nil",
            "Win & BTTS",
            "Over",
            "Under",
            "Handicap",
            "Full-Time Result",
            "Full Time Result",
            "To Win",
            "Win",
        ];

        const escaped = marketTokens.map((entry) => entry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
        const marketPattern = escaped.sort((a, b) => b.length - a.length).join("|");

        const postVerdictSegments = normalized
            .split(/\b(?:Verdict|Quick Summary)\b/i)
            .filter((segment) => segment && segment.length > 10)
            .map((segment) => segment.replace(/^(?:\s*[-–—:]\s*)+/, ""));

        const patterns = [
            new RegExp(`([A-Z][A-Za-z0-9&.'/-]*(?:\\s+[A-Z][A-Za-z0-9&.'/-]*)*?)\\s+(?:${marketPattern})\\s*@\\s*(\\d+(?:\\.\\d+)?)`, "gi"),
            new RegExp(`([A-Z][A-Za-z0-9&.'/-]*?)\\s+-?\\d+(?:\\.\\d+)?\\s+(?:Maps|Map)\\s+(?:${marketPattern})\\s*@\\s*(\\d+(?:\\.\\d+)?)`, "gi"),
            new RegExp(`([A-Z][A-Za-z0-9&.'/-]*(?:\\s+[A-Z][A-Za-z0-9&.'/-]*)*)\\s+(?:${marketPattern})\\s*(?:\\(\\d+\\/\\d+\\)|\\(\\d+(?:\\.\\d+)?\\))?\\s*(\\d+(?:\\.\\d+)?)`, "gi"),
        ];

        const candidateFilter = (candidate, market) => {
            if (!candidate || candidate.length > 90) return false;
            if (/(Quick Summary|Betting Predictions|Verdict|Where to Watch|Squad & Team News|Can Do Damage|Have Yet to Meet This Season|Deposit|Claim the|Referral code|NEWBONUS|T&Cs)/i.test(candidate)) return false;
            if (/(?:^|\s)(Map|Maps)(?:\s|$)/i.test(candidate)) return false;
            if ((market || "").toLowerCase().includes("map handicap") && /(?:^|\s)(Map|Maps)(?:\s|$)/i.test(candidate)) return false;
            return /^[A-Z][A-Za-z0-9&.'/-]*(?:\s+[A-Z][A-Za-z0-9&.'/-]*)*$/.test(candidate);
        };

        const extractMatchData = (segment) => {
            for (const pattern of patterns) {
                const matches = [...segment.matchAll(pattern)];
                for (const match of matches) {
                    const selection = (match[1] || "").trim();
                    const market = (match[0].match(new RegExp(`(?:${marketPattern})`, "i")) || [null])[0] || null;
                    const oddsText = match[2] || null;
                    const odds = oddsText ? Number(oddsText) : null;

                    if (!selection || !market) continue;
                    if (!candidateFilter(selection, market)) continue;
                    return { market, selection, odds };
                }
            }
            return null;
        };

        for (const segment of [...postVerdictSegments, normalized]) {
            const hit = extractMatchData(segment);
            if (hit) return hit;
        }

        const titleMatch = normalized.match(/(?:^|\s)([A-Z][A-Za-z0-9&.' /-]+?\s+(?:v|vs)\s+[A-Z][A-Za-z0-9&.' /-]+?)(?=\s*(?:Tips|Betting Predictions|Betting Tips|Verdict|Reason for tip))/i);
        if (titleMatch) {
            return { market: null, selection: titleMatch[1].trim(), odds: null };
        }

        return { market: null, selection: null, odds: null };
    }

    extractDetailMarketData($) {
        const blocks = $("h1, h2, h3, p, li, div").toArray()
            .map((element) => $(element).text().replace(/\s+/g, " ").trim())
            .filter(Boolean)
            .sort((left, right) => left.length - right.length);

        for (const block of blocks) {
            const directMatch = block.match(/^(.+?)\s+(To Win Moneyline|Map Handicap|Match Handicap|Full-Time Result|Full Time Result|Double Chance|Draw No Bet|Anytime Goalscorer|First Goalscorer|Correct Score|Total Goals|Over|Under|BTTS|To Win|Win)\s*@\s*(\d+(?:\.\d+)?)/i);
            if (directMatch) {
                const directData = { market: directMatch[2], selection: directMatch[1].trim(), odds: Number(directMatch[3]) };
                if (/to win moneyline/i.test(directData.market)) return directData;
                if (!blocks.some((candidate) => /\bTo Win Moneyline\b/i.test(candidate))) return directData;
            }

            const data = this.extractMarketAndSelectionFromText(block);
            if (data.market && data.selection) return data;
        }

        const text = $("body").text().replace(/\s+/g, " ").trim();
        return this.extractMarketAndSelectionFromText(text);
    }

    async fetchDetailPage(url) {
        try {
            const html = await this.downloadPage(url);
            return this.parseDetailPage(url, html);
        } catch (error) {
            const fallbackText = (await axios.get(url, { headers: this.headers, timeout: 30000 }).catch(() => ({ data: "" }))).data || "";
            this.writePageSnapshot(url, fallbackText);
            return this.parseDetailPage(url, fallbackText);
        }
    }

    async parseDetailPage(url, html = null) {
        if (!url) {
            return {
                previewTitle: null,
                preview: null,
                analytics: null,
                detailsUrl: null,
                fixtureId: null,
                market: null,
                selection: null,
                odds: null,
            };
        }

        try {
            html = html || await this.fetchWithAxiosOrBrowser(url);
            this.writePageSnapshot(url, html);
            const $ = cheerio.load(html || "");
            const title = [
                "h1",
                ".entry-title",
                ".post-title",
                ".match-title",
                ".single-title",
                ".article-title",
            ]
                .map((selector) => $(selector).first().text().trim())
                .find(Boolean) || null;

            const bodyText = $("body").text().replace(/\s+/g, " ").trim();
            let preview = null;

            if (title) {
                const titleIndex = bodyText.indexOf(title);
                if (titleIndex >= 0) {
                    preview = bodyText.slice(titleIndex + title.length).trim();
                }
            }

            if (!preview) {
                const articleText = $("article, .entry-content, .post-content, main").first().text().replace(/\s+/g, " ").trim();
                preview = articleText || bodyText;
            }

            if (preview && preview.length > 1500) {
                preview = preview.slice(0, 1500).trim();
            }

            const detailData = this.extractDetailMarketData($);

            return {
                previewTitle: title,
                preview: preview || null,
                analytics: null,
                detailsUrl: url,
                fixtureId: this.extractFixtureId(url),
                market: detailData.market,
                selection: detailData.selection,
                odds: detailData.odds,
            };
        } catch (error) {
            const fallbackText = (await axios.get(url, { headers: this.headers, timeout: 30000 }).catch(() => ({ data: "" }))).data || "";
            this.writePageSnapshot(url, fallbackText);
            const $ = cheerio.load(fallbackText);
            const fallbackData = this.extractDetailMarketData($);

            return {
                previewTitle: null,
                preview: null,
                analytics: null,
                detailsUrl: url,
                fixtureId: this.extractFixtureId(url),
                market: fallbackData.market,
                selection: fallbackData.selection,
                odds: fallbackData.odds,
            };
        }
    }

    extractMainTip($, pageUrl = this.betOfTheDayUrl) {
        const item = $(".matchlist.betacctime").first();
        const isTennis = /tennis-bet-of-the-day/i.test(pageUrl);
        const sport = isTennis ? "Tennis" : "Football";
        const league = isTennis ? "Tennis Bet of the Day" : "Bet of the Day";

        if (!item.length) {
            const body = $("body").text().replace(/\s+/g, " ").trim();
            const kickoff = body.match(/Bet of the Day\s+(\d{1,2}:\d{2})/)?.[1] ?? null;
            const betLineMatch = body.match(/(Alternative Total Goals|Total Goals|To Win Moneyline|Map Handicap|Match Handicap|Double Chance|Draw No Bet|Anytime Goalscorer|First Goalscorer|Correct Score|Home Win|Away Win|Win to Nil|Both Teams to Score|BTTS|Over|Under|Handicap|Win|To Win)\s+([A-Za-z0-9&.' /-]+?)(?:\s*(?:\((?:\d+\/\d+|[0-9.]+)\))?)\s*(\d+(?:\.\d+)?)\s*(?:Reason for tip|Verdict|See full preview)/i);
            const detailData = betLineMatch ? {
                market: betLineMatch[1].trim(),
                selection: (betLineMatch[2] || "").trim().replace(/\s+(Over|Under|BTTS|Handicap|To Win|Win|Home Win|Away Win|Draw|Double Chance|Draw No Bet|To Win Moneyline|Map Handicap|Match Handicap|Anytime Goalscorer|First Goalscorer|Correct Score|Total Goals|Alternative Total Goals)\s*$/i, "").trim(),
                odds: Number(betLineMatch[3]),
            } : this.extractMarketAndSelectionFromText(body);
            const reason = body.match(/Reason for tip\s*(.*?)\s*(?:See full preview|Choose Your Stake)/i)?.[1]?.trim() ?? null;
            const previewHref = $("a").filter((_, el) => $(el).text().trim() === "See full preview").attr("href");
            const detailsUrl = this.resolveUrl(previewHref) || pageUrl;

            return {
                sport,
                league,
                homeTeam: null,
                awayTeam: null,
                time: kickoff,
                score: null,
                market: detailData.market || null,
                prediction: detailData.selection || null,
                selection: detailData.selection || null,
                odds: detailData.odds || null,
                index: null,
                url: detailsUrl,
                previewTitle: "Bet of the Day",
                preview: reason,
                analytics: null,
                detailsUrl,
                fixtureId: null,
                extraTips: [],
            };
        }

        const market = item.find(".match-name").children("span").not(".m-name").first().text().trim();
        const teamsText = item.find(".match-name .m-name").text().trim();
        const [homeTeam, awayTeam] = teamsText.split(/\s+v\s+|\s+vs\s+/i).map((team) => team.trim());
        const selection = item.find(".plr-name").text().trim();
        const oddsText = item.find(".ods").attr("data-ods") || item.find(".ods").text();
        const odds = Number(oddsText?.replace(/,/g, ".")) || null;
        const kickoff = item.find(".tm").text().trim() || null;
        const preview = (() => {
            const el = $(".reasonForTipM").first();
            if (!el.length) return null;
            const text = el.text().trim();
            return text.replace(/^Reason for tip\s*/i, "").replace(/\s*See full preview.*$/i, "").trim() || null;
        })();
        
        const detailsUrl = this.resolveUrl(item.find("a.seeFullPreviewLink").attr("href"));

        return {
            sport,
            league,
            homeTeam: homeTeam || null,
            awayTeam: awayTeam || null,
            time: kickoff,
            score: null,
            market: market || null,
            prediction: selection || market || null,
            odds,
            index: null,
            url: detailsUrl,
            previewTitle: "Bet of the Day",
            preview,
            analytics: null,
            detailsUrl,
            fixtureId: null,
            extraTips: [],
        };
    }
}

module.exports = FreeTipsMaxBetScraper;
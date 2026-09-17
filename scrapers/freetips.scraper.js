const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

// Downloads the latest page from the site FIRST, then parses it.
// This ensures we always work with the latest data.
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

        // FreeTips is protected by Cloudflare, so Chrome/Edge must remain
        // enabled for service and contract runs as well as production. Unit
        // tests that need deterministic fixtures disable it explicitly.
        this.useBrowserFetch = process.env.FREETIPS_DISABLE_BROWSER !== "true";
        this.verboseLogging = process.env.FREETIPS_VERBOSE === "true";

        // Candidate locations for the local HTML file.
        // If a path is provided, it overrides these candidates.
        // Prefer orchestrator-managed snapshot locations by default so callers
        // don't accidentally read/write into the repository `tests/` tree.
        this.localHtmlCandidates = [
            path.resolve(__dirname, "..", "orchestrator", "free-tips", "freetips.html"),
            path.resolve(__dirname, "..", "orchestrator", "free-tips.html"),
            path.resolve(process.cwd(), "freetips.html"),
            path.resolve(__dirname, "..", "tests", "freetips", "freetips.html"),
            path.resolve(__dirname, "..", "tests", "freetips.html"),
            path.resolve(__dirname, "freetips.html"),
        ];

        // Default snapshot directory moved to orchestrator/free-tips for
        // alignment with the orchestrator workflow. Tests may still override
        // this value when they need ephemeral directories.
        this.localSnapshotDir = path.resolve(__dirname, "..", "orchestrator", "free-tips");
        this.legacySnapshotDirs = [];

        // Allows tests / callers to override the exact local file path.
        this.localHtmlPath = null;

        this.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        };

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
        if (this.localHtmlPath && fs.existsSync(this.localHtmlPath)) return this.localHtmlPath;
        const existing = this.localHtmlCandidates.find((candidate) => fs.existsSync(candidate));
        return existing || this.localHtmlCandidates[0];
    }

    async resolveChromeExecutableAsync() {
        if (!this.useBrowserFetch) return null;
        const candidates = [...this.chromeExecutableCandidates];
        try {
            const puppeteer = require("puppeteer");
            const bundledPath = await puppeteer.executablePath();
            if (bundledPath) candidates.push(bundledPath);
        } catch {
            // Puppeteer may not be installed or the browser may not be available.
        }
        return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null;
    }

    resolveChromeExecutable() {
        if (!this.useBrowserFetch) return null;
        const candidates = [...this.chromeExecutableCandidates];
        try {
            const bundledPath = require("puppeteer").executablePath();
            if (bundledPath) candidates.push(bundledPath);
        } catch {
            // fall through
        }
        return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null;
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

    getSnapshotDirectories() {
        return Array.from(new Set([this.localSnapshotDir, ...this.legacySnapshotDirs].filter(Boolean)));
    }

    cleanSnapshotDirectories() {
        const staleLegacyDir = path.resolve(__dirname, "..", "tests", "freetips-pages");
        const orchestratorLegacyDir = path.resolve(__dirname, "..", "orchestrator", "free-tips-pages");

        for (const dir of [...this.getSnapshotDirectories(), staleLegacyDir, orchestratorLegacyDir]) {
            try {
                if (!fs.existsSync(dir)) continue;

                // Only remove entire legacy directories that we explicitly know
                // about and expect to be safe to delete.
                const base = path.basename(dir).toLowerCase();
                if ((base === "freetips-pages" && path.resolve(dir) === staleLegacyDir) ||
                    (base === "free-tips-pages" && path.resolve(dir) === orchestratorLegacyDir)) {
                    fs.rmSync(dir, { recursive: true, force: true });
                    continue;
                }

                // For normal snapshot directories, only remove loose HTML files.
                for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                    try {
                        if (!entry.isFile()) continue;
                        if (/\.(html?|htm)$/i.test(entry.name)) {
                            fs.rmSync(path.join(dir, entry.name), { force: true });
                        }
                    } catch {
                        // ignore per-file failures, continue best-effort cleanup
                    }
                }
            } catch {
                // best effort
            }
        }
    }

    writePageSnapshot(url, html) {
        if (!html) return;
        const snapshotPath = this.buildLocalSnapshotPath(url);
        if (!snapshotPath) return;
        const targetDir = path.dirname(snapshotPath);
        if (targetDir && targetDir !== ".") {
            fs.mkdirSync(targetDir, { recursive: true });
        }
        fs.writeFileSync(snapshotPath, html, "utf8");
    }

    readPageSnapshot(url) {
        const snapshotPath = this.buildLocalSnapshotPath(url);
        return snapshotPath && fs.existsSync(snapshotPath) ? fs.readFileSync(snapshotPath, "utf8") : null;
    }

    log(message, ...args) {
        if (this.verboseLogging) {
            console.log(message, ...args);
        }
    }

    warn(message, ...args) {
        if (this.verboseLogging) {
            console.warn(message, ...args);
        }
    }

    error(message, ...args) {
        if (this.verboseLogging) {
            console.error(message, ...args);
        }
    }

    async refreshLocalHtml(localFile) {
        this.log(`Refreshing local freetips.html from ${this.url} ...`);
        let html = null;
        let lastError = null;

        const chromePath = await this.resolveChromeExecutableAsync();
        if (chromePath) {
            try {
                html = await this.fetchWithBrowser(chromePath, this.url);
                this.log("Downloaded latest page via Puppeteer + Chrome.");
            } catch (browserError) {
                lastError = browserError;
                this.warn("Puppeteer fetch failed:", browserError.message);
            }
        } else if (this.useBrowserFetch) {
            this.log("No browser executable found; falling back to axios.");
        }

        if (!html) {
            try {
                html = await this.fetchWithAxios();
                this.log("Downloaded latest page via axios.");
            } catch (axiosError) {
                lastError = axiosError;
                this.warn("Axios fetch failed:", axiosError.message);
            }
        }

        if (html) {
            const targetDir = path.dirname(localFile);
            if (targetDir && targetDir !== ".") {
                fs.mkdirSync(targetDir, { recursive: true });
            }
            fs.writeFileSync(localFile, html, "utf8");
            this.writePageSnapshot(this.url, html);
            this.log("Local freetips.html overwritten with latest data.");
            return html;
        }

        if (fs.existsSync(localFile)) {
            this.log("All live fetches failed, using existing local freetips.html...");
            return fs.readFileSync(localFile, "utf8");
        }

        throw new Error(
            "Unable to fetch freetips page via browser, axios, or local file." +
            (lastError ? ` Last error: ${lastError.message}` : "")
        );
    }

    isCloudflareChallengePage(html) {
        return typeof html === "string" && (html.includes("Just a moment...") || html.includes("cf-mitigated"));
    }

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
            await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });
            await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

            const contentSelector = ".matchlist.betacctime, .matchlist, h1, .verdict";
            const maxWaitMs = 60000;
            const start = Date.now();

            while (Date.now() - start < maxWaitMs) {
                const html = await page.content();
                const hasChallenge = this.isCloudflareChallengePage(html);
                const hasContent = await page.$(contentSelector).then((el) => Boolean(el)).catch(() => false);

                if (!hasChallenge && hasContent) return html;
                await new Promise((resolve) => setTimeout(resolve, 2000));
            }

            const finalHtml = await page.content();
            if (!this.isCloudflareChallengePage(finalHtml)) return finalHtml;

            throw new Error("Cloudflare challenge did not clear within timeout.");
        } finally {
            await browser.close();
        }
    }

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
        const chromePath = this.useBrowserFetch ? await this.resolveChromeExecutableAsync() : null;
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

    readLocalHtml(localFile) {
        console.log("Loading local freetips.html...");
        return fs.readFileSync(localFile, "utf8");
    }

    isPlaceholderFeaturedTeam(value) {
        if (!value) return true;
        const normalized = String(value).replace(/\s+/g, " ").trim();
        return /^(?:Home Team|Away Team|Team A|Team B|Player A|Player B|TBD|To Be Confirmed)$/i.test(normalized)
            || /^(?:Home Team\s*\/\s*Away Team|Away Team\s*\/\s*Home Team)$/i.test(normalized)
            || /(?:^|\s)(?:Home Team|Away Team|Team A|Team B|Player A|Player B)(?:\s|$)/i.test(normalized);
    }

    isUsableSnapshot(url, html) {
        if (!html) return false;
        const $ = cheerio.load(html);
        const documentText = $("body").text().replace(/\s+/g, " ").trim();
        if (/betting\/$/i.test(url) && /Today's Betting Tips|Today’s Betting Tips/i.test(documentText)) return true;
        if (/bet-of-the-day/i.test(url) || /tennis-bet-of-the-day/i.test(url)) {
            const featuredItem = $(".matchlist.betacctime").first();
            if (!featuredItem.length) return false;
            const teamsText = featuredItem.find(".match-name .m-name").text().trim();
            const [homeTeam, awayTeam] = teamsText.split(/\s+v\s+|\s+vs\s+/i).map((team) => team.trim());
            if (this.isPlaceholderFeaturedTeam(homeTeam) || this.isPlaceholderFeaturedTeam(awayTeam) || /Home Team\s*\/\s*Away Team/i.test(teamsText)) return false;

            const pageDate = this.extractFeaturedDate($);
            if (!pageDate) return false;
            const now = new Date();
            return pageDate.getFullYear() === now.getFullYear() && pageDate.getMonth() === now.getMonth() && pageDate.getDate() === now.getDate();
        }

        const title = $("h1, .entry-title, .post-title, .match-title, .single-title, .article-title").first().text().trim();
        const hasVerdict = $(".verdict[data-compid='news-verdict'], .verdict, .verdictBoxItem").length > 0;
        return Boolean(title && hasVerdict);
    }

    async downloadPage(url, localFallback = null, { forceRefresh = false } = {}) {
        if (localFallback) {
            const html = this.readLocalHtml(localFallback);
            this.writePageSnapshot(url, html);
            return html;
        }

        const savedHtml = this.readPageSnapshot(url);
        if (!forceRefresh && this.isUsableSnapshot(url, savedHtml)) return savedHtml;

        let html;
        try {
            html = await this.fetchWithAxiosOrBrowser(url);
        } catch (error) {
            if (savedHtml) {
                this.log(`Live fetch failed for ${url}, reusing saved snapshot as fallback.`);
                return savedHtml;
            }
            throw error;
        }
        this.writePageSnapshot(url, html);
        return html;
    }

    async parseSavedDetailPage(url) {
        const html = this.readPageSnapshot(url);
        if (!html) return this.fetchDetailPage(url);
        return this.parseDetailPage(url, html);
    }

    async scrape() {
        try {
            const localFile = this.resolveLocalFilePath();
            if (!localFile) throw new Error("No local HTML path available for freetips.");

            const featuredUrls = [this.betOfTheDayUrl, this.tennisBetOfTheDayUrl];
            const featuredTips = [];

            const processedFixtures = new Set();

            for (const featuredUrl of featuredUrls) {
                try {
                    const featuredHtml = await this.downloadPage(featuredUrl, null, { forceRefresh: true });
                    const featuredTip = this.extractMainTip(cheerio.load(featuredHtml), featuredUrl);

                    if (featuredTip && (featuredTip.homeTeam || featuredTip.selection)) {

                        // Check if this featured tip has an expanded full preview link
                        const deepLinkUrl = featuredTip.seeFullPreviewUrl || featuredTip.detailsUrl;

                        if (deepLinkUrl && !/\/betting\/(?:bet-of-the-day|tennis-bet-of-the-day)\/?$/i.test(deepLinkUrl)) {
                            try {
                                const detailHtml = await this.downloadPage(deepLinkUrl, null, { forceRefresh: true });
                                const detailData = await this.parseDetailPage(deepLinkUrl, detailHtml);

                                if (detailData && detailData.tips && detailData.tips.length > 0) {
                                    featuredTip.verdict = detailData.verdict || featuredTip.verdict;
                                    featuredTip.tips = detailData.tips;
                                    featuredTip.extraTips = detailData.extraTips || [];
                                    featuredTip.previewTitle = detailData.previewTitle || featuredTip.previewTitle;

                                    // Pick main tip from highest units or first
                                    const main = detailData.tips[0];
                                    if (main) {
                                        featuredTip.selection = main.selection;
                                        featuredTip.market = main.market;
                                        featuredTip.odds = main.odds;
                                        featuredTip.stakeUnits = main.units;
                                    }
                                }
                            } catch (e) {
                                this.warn(`Could not expand preview for featured tip (${deepLinkUrl}):`, e.message);
                            }
                        }

                        featuredTips.push(featuredTip);
                        if (featuredTip.homeTeam && featuredTip.awayTeam) {
                            const fixtureKey = `${featuredTip.homeTeam.toLowerCase().trim()}::${featuredTip.awayTeam.toLowerCase().trim()}`;
                            processedFixtures.add(fixtureKey);
                        }
                    }
                } catch (error) {
                    this.warn(`Skipping featured page ${featuredUrl}: ${error.message}`);
                }
            }

            const html = this.useLocalHtml && !this.localHtmlPath ? await this.refreshLocalHtml(localFile) : this.readLocalHtml(localFile);
            this.writePageSnapshot(this.url, html);
            const $ = cheerio.load(html);
            const listingTips = this.extractListingTips($);

            const results = [...featuredTips];

            for (const tip of listingTips) {
                const detailsUrl = tip.detailsUrl || tip.url;
                if (!detailsUrl) continue;

                // Deduplication check: if already scraped as a featured tip, skip!
                if (tip.homeTeam && tip.awayTeam) {
                    const fixtureKey = `${tip.homeTeam.toLowerCase().trim()}::${tip.awayTeam.toLowerCase().trim()}`;
                    if (processedFixtures.has(fixtureKey)) {
                        continue;
                    }
                }

                try {
                    const detailHtml = await this.downloadPage(detailsUrl, null, { forceRefresh: true });
                    const detailData = await this.parseDetailPage(detailsUrl, detailHtml);

                    if (!detailData.tips || detailData.tips.length === 0) {
                        continue; // skip pages without structured verdict tips
                    }

                    const topTip = detailData.tips[0];
                    const enrichedTip = {
                        ...tip,
                        ...detailData,
                        selection: topTip.selection || tip.selection,
                        market: topTip.market || tip.market,
                        odds: topTip.odds ?? tip.odds,
                        stakeUnits: topTip.units ?? 2,
                        preview: detailData.verdict || tip.preview,
                        verdict: detailData.verdict || tip.preview,
                        tips: detailData.tips,
                        extraTips: detailData.extraTips || [],
                    };

                    results.push(enrichedTip);
                    if (tip.homeTeam && tip.awayTeam) {
                        const fixtureKey = `${tip.homeTeam.toLowerCase().trim()}::${tip.awayTeam.toLowerCase().trim()}`;
                        processedFixtures.add(fixtureKey);
                    }
                } catch (error) {
                    this.warn(`Skipping match preview ${detailsUrl}: ${error.message}`);
                }
            }

            this.log(`Extracted ${results.length} freetips from bet-of-day + match preview listings.`);
            return results;
        } catch (err) {
            this.error("SCRAPER ERROR:", err.message);
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
            if (/\/nfl\//.test(pathname)) return "American Football";
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
            // default
        }
        return "Football";
    }

    inferLeagueFromUrl(url, title = "") {
        if (title) {
            // Pattern 1: "in the [League Name]" at end or before separator
            const inTheMatch = title.match(/\bin\s+the\s+([A-Z][A-Za-z0-9\s&]+?)(?:$|\s*[-–—|])/);
            if (inTheMatch && inTheMatch[1].trim().length < 50) {
                return inTheMatch[1].trim();
            }

            // Pattern 2: "at the [League Name]" or "at [League Name]"
            const atTheMatch = title.match(/\bat\s+(?:the\s+)?([A-Z][A-Za-z0-9\s&]+?)(?:\s+Strong\b|\s+this\b|\s+tonight\b|$|\s*[-–—|])/);
            if (atTheMatch && atTheMatch[1].trim().length < 60) {
                const candidate = atTheMatch[1].trim();
                // Must look like a proper noun / tournament (not a verb phrase)
                if (/^[A-Z]/.test(candidate) && !/^(RLCS|EPL|UEFA|AFC|ACL|WC|EWC|ICC|NBA|NFL|MLB|NHL|EuroVolley|Asian|Europa|Champions|Premier|La Liga|Serie|Bundesliga|Ligue|Super|World|Euro|Copa|FA|DFB|Carabao|Coupe|Scottish|EFL|League|Cup|Championship|Trophy|Masters|Tour|Open|Grand|Slam)/i.test(candidate.split(" ")[0]) || candidate.split(" ").length <= 4) {
                    return candidate;
                }
            }

            // Pattern 3: Extract from dash/em-dash suffix clause — "– [clause] at/in [League]"
            const dashClause = title.match(/[–—]\s*.{0,60}\bat\s+(?:the\s+)?([A-Z][A-Za-z0-9\s&]+?)(?:\s+Strong\b|\s+this\b|\s+tonight\b|$)/);
            if (dashClause && dashClause[1].trim().length < 60) {
                return dashClause[1].trim();
            }

            // Pattern 4: Plain "at [League]" anywhere in a subtitle after dash
            const dashAt = title.match(/[–——-]\s*.+?at\s+(?:the\s+)?([A-Z][A-Za-z0-9 &]+\d{4}[A-Za-z0-9 ]*?)(?:\s+Strong\b|$)/);
            if (dashAt && dashAt[1].trim().length < 60) {
                return dashAt[1].trim();
            }
        }
        if (!url) return "Betting Tips";
        try {
            const pathname = new URL(url, this.baseUrl).pathname;
            const parts = pathname.split("/").filter(Boolean);
            if (parts.length >= 3 && !/^(tips|predictions|betting|live-stream)$/i.test(parts[1])) {
                return parts[1].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
            }
            if (parts.length >= 2 && parts[0].toLowerCase() === "nfl") return "NFL";
            if (parts.length >= 1) {
                const p0 = parts[0].toLowerCase();
                if (p0 === "betting") return "Betting Tips";
                return parts[0].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
            }
        } catch {
            // default
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

    extractFeaturedDate($) {
        const monthMap = {
            january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
            july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
        };
        const match = $("h1, .entry-title, .post-title").first().text().match(/(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})/);
        if (!match) return null;
        const day = Number(match[1]);
        const month = monthMap[(match[2] || "").toLowerCase()];
        const year = Number(match[3]);
        if (typeof month !== "number" || !day || !year) return null;
        return new Date(year, month, day);
    }

    splitTeams(rawTitle) {
        if (!rawTitle) return [null, null];
        const cleaned = rawTitle.replace(/\s+/g, " ").replace(/[\u2013\u2014]/g, " - ").trim();
        const vsMatch = cleaned.match(/^(.*?)\s+(?:v|vs|@)\s+(.*)$/i);
        if (vsMatch) return [vsMatch[1].trim() || null, vsMatch[2].trim() || null];

        const dashMatch = cleaned.match(/^(.*?)\s+-\s+(.*)$/);
        if (dashMatch) return [dashMatch[1].trim() || null, dashMatch[2].trim() || null];

        return [cleaned || null, null];
    }

    isLikelyMatchPreviewUrl(href) {
        if (!href) return false;
        if (/\/link\//i.test(href) || /betting-sites|free-bets|signup|login|sitehelp|promotion-codes|bonus\/|bookie-specials/i.test(href)) return false;

        const url = this.resolveUrl(href);
        if (!url) return false;

        try {
            const pathname = new URL(url).pathname.toLowerCase();
            // Filter out non-match roundup / accumulator categories
            if (/(?:accumulator|roundup|tournament-preview|weekend-football-predictions|daily-double-tips|tasty-treble-tips|bankroll-builder-tips|mega-bet-tips|itv-racing)/i.test(pathname)) {
                return false;
            }

            if (/\/(?:esports|football|tennis|horse-racing|cricket|basketball|nfl|australian-rules|rugby-league|rugby-union|volleyball|rugby|boxing|golf|baseball|ice-hockey|darts|snooker)\//.test(pathname)) {
                return /\/(?:tips|predictions|live-stream|betting)\//.test(pathname) || /\d{8}-\d{4}/.test(pathname);
            }

            if (/\/betting\//.test(pathname)) {
                return !/\/betting\/(?:bet-of-the-day|tennis-bet-of-the-day|accumulator)/i.test(pathname);
            }

            return false;
        } catch {
            return false;
        }
    }

    findTipsPreviewSection($) {
        const heading = $("h1,h2,h3,h4,h5").filter((_, el) => {
            const text = $(el).text().replace(/\s+/g, " ").trim().toLowerCase();
            return text.includes("today's tips & match previews") ||
                   text.includes("today’s tips & match previews") ||
                   text.includes("today's tips and match previews") ||
                   text.includes("today’s tips and match previews");
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
        const rowCandidates = scope.find(".tipTable li:not(.head), article.tip-item, li[data-eventid], .match-row").toArray();
        const candidateBlocks = rowCandidates.length ? rowCandidates : scope.find("article, li, div").toArray();

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
            if (!titleText || /bet of the day|daily double|tasty treble|bankroll builder|mega bet|acca|accumulator|nap of the day|weekend predictions/i.test(titleText)) continue;

            const startsText = $el.find(".startsT, .stTime, .timeing, [class*='start']").first().text().replace(/\s+/g, " ").trim();
            const startsFromText = (text.match(/Starts\s+([A-Za-z0-9hmsd: ]+?)(?=\s*(?:Returns|\$)\b|$)/i) || [null, null])[1];
            const startsMatch = startsText || (startsFromText ? startsFromText.trim() : null);

            const returnsEl = $el.find(".returns").first().length ? $el.find(".returns").first() : $el.find(".rtn").first();
            const returnsText = returnsEl.text().replace(/\s+/g, " ").trim();
            const returnsMatch = (returnsText && /\d+(?:\.\d+)?/.test(returnsText))
                ? returnsText.match(/\d+(?:\.\d+)?/g).slice(-1)[0]
                : (text.match(/Returns\s*\$?\s*(\d+(?:\.\d+)?)/i) || [null, null])[1];
            const odds = returnsMatch ? Number(returnsMatch) : null;

            let [homeTeam, awayTeam] = this.splitTeams(titleText);
            const sport = this.inferSportFromUrl(detailsUrl);

            if ((!homeTeam || !awayTeam) && sport === "Golf") {
                homeTeam = titleText.replace(/\s*[-–—]\s*.*$/i, "").trim() || titleText.trim();
                awayTeam = "Field";
            }

            // Non-match filter: must have 2 distinct teams and not generic "Event" or article titles.
            // Golf tournaments are commonly published as a single tournament title rather than a two-team fixture.
            if (!homeTeam || !awayTeam || awayTeam.toLowerCase() === "event" || /^freetips/i.test(homeTeam)) continue;

            seen.add(detailsUrl);
            tips.push({
                sport,
                league: this.inferLeagueFromUrl(detailsUrl, titleText),
                homeTeam,
                awayTeam,
                time: startsMatch || null,
                score: null,
                market: "Match Result",
                prediction: null,
                selection: null,
                odds,
                stakeUnits: 2,
                url: detailsUrl,
                previewTitle: titleText,
                preview: null,
                verdict: null,
                tips: [],
                detailsUrl,
                fixtureId: this.extractFixtureId(detailsUrl),
                extraTips: [],
            });
        }

        return tips;
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
                verdict: null,
                tips: [],
                market: null,
                selection: null,
                odds: null,
                stakeUnits: 2,
                extraTips: [],
                detailsUrl: null,
                fixtureId: null,
            };
        }

        try {
            html = html || (await this.fetchWithAxiosOrBrowser(url));
            this.writePageSnapshot(url, html);
            const $ = cheerio.load(html || "");

            const title = $("h1, .entry-title, .post-title, .match-title, .single-title").first().text().trim() || null;

            // Target the structured Verdict component
            const verdictEl = $(".verdict[data-compid='news-verdict'], .verdict").first();
            let verdict = null;
            const tips = [];

            if (verdictEl.length) {
                // Extract clean verdict narrative
                const clone = verdictEl.clone();
                clone.find("h1, h2, h3, h4, .heading, .verdictBoxDataMain, .placeBet, label.labtitle, div[style*='display:none'], style, script").remove();
                let rawVerdict = clone.text().replace(/\s+/g, " ").trim();
                rawVerdict = rawVerdict.replace(/^Verdict\s*[-–—:]?\s*/i, "").trim();
                // Ensure no leaked JSON schema or CSS
                if (rawVerdict && !rawVerdict.startsWith('","') && !rawVerdict.includes("articleSection")) {
                    verdict = rawVerdict;
                }

                // Extract tips from verdictBoxItems.
                // Some cards do not use .marketName classes and instead render the
                // market phrase alongside the player name as plain text, e.g.
                // "Ben James Each-Way @31.00 - 1 Unit" or
                // "Rashid Khan Best Afghanistan Bowler @3.60 - 2 Units".
                verdictEl.find(".verdictBoxItem").each((_, el) => {
                    const item = $(el);
                    const bookmaker = item.find(".logoImgVBD img").attr("alt") ||
                        item.find(".placeBetBtnVT").text().replace(/^Bet\s+at\s+/i, "").trim() ||
                        "Stake.com";

                    const lineText = item.find(".hedTextVBD").text().replace(/\s+/g, " ").trim();
                    const oddsUnitsMatch = lineText.match(/@([\d.]+)\s*-\s*(\d+(?:\.\d+)?)\s*Units?/i);
                    const odds = oddsUnitsMatch ? parseFloat(oddsUnitsMatch[1]) : null;
                    const units = oddsUnitsMatch ? parseFloat(oddsUnitsMatch[2]) : 2;

                    let selection = item.find(".hedTextVBD .hedTextOneVBD:not(.marketName)").first().text().trim();
                    let market = item.find(".hedTextVBD .marketName").text().trim() ||
                        item.find(".hedTextVBD .hedTextOneVBD.marketName").text().trim() ||
                        "Match Result";

                    const plainLabelParts = item.find(".hedTextVBD .hedTextOneVBD")
                        .map((_, el) => $(el).text().trim())
                        .get()
                        .filter(Boolean);

                    if (!market || market === "Match Result") {
                        if (plainLabelParts.length >= 2) {
                            const [firstLabel, ...remainingLabels] = plainLabelParts;
                            selection = firstLabel;
                            market = remainingLabels.join(" ") || "Match Result";
                        }
                    }

                    const betUrl = item.find("a.placeBetBtnVT").attr("href") ||
                        item.find(".logoImgVBD a").attr("href") ||
                        null;

                    if (selection && odds) {
                        tips.push({
                            bookmaker,
                            selection,
                            market: market && market !== "Match Result" ? market : (lineText.includes("Each-Way") ? "Each-Way" : "Match Result"),
                            odds,
                            units,
                            betUrl,
                        });
                    }
                });

                // Fallback to hidden display:none lines if verdictBoxItem wasn't rendered
                if (tips.length === 0) {
                    verdictEl.find("div[style*='display:none']").each((_, el) => {
                        const line = $(el).text().replace(/\s+/g, " ").trim();
                        const match = line.match(/Best\s*Bet\d*:\s*(.+?)\s+([A-Za-z0-9&.' -]+?)\s*@([\d.]+)\s*(?:at\s+([^-]+))?\s*-\s*(\d+(?:\.\d+)?)\s*Units?/i);
                        if (match) {
                            tips.push({
                                bookmaker: match[4] ? match[4].trim() : "Stake.com",
                                selection: match[1].trim(),
                                market: match[2].trim(),
                                odds: parseFloat(match[3]),
                                units: parseFloat(match[5]),
                                betUrl: $(el).find("a").attr("href") || null,
                            });
                        }
                    });
                }
            }

            // Fallback: If no .verdict component, look for text narrative within article content (never entire body)
            if (!verdict) {
                const articleBody = $("article, .entry-content, .cr-desc").first();
                articleBody.find(".newsBoxD_main, .Related-News, .sidebar, script, style").remove();
                const cleanArticleText = articleBody.text().replace(/\s+/g, " ").trim();
                const verdictMatch = cleanArticleText.match(/Verdict\s*(.*?)(?=\s*(?:Stake\.com|Best Bet|\$|Returns|Deposit|$))/i);
                if (verdictMatch && verdictMatch[1].length > 20) {
                    verdict = verdictMatch[1].trim();
                }
            }

            // Sort tips so highest unit is primary
            tips.sort((a, b) => b.units - a.units);

            const primaryTip = tips[0] || null;
            const extraTips = tips.slice(1).map((t) => ({
                selection: t.selection,
                market: t.market,
                odds: t.odds,
                stakeUnits: t.units,
            }));

            return {
                previewTitle: title,
                preview: verdict,
                verdict,
                league: this.inferLeagueFromUrl(url, title),
                tips,
                market: primaryTip ? primaryTip.market : null,
                selection: primaryTip ? primaryTip.selection : null,
                odds: primaryTip ? primaryTip.odds : null,
                stakeUnits: primaryTip ? primaryTip.units : 2,
                extraTips,
                detailsUrl: url,
                fixtureId: this.extractFixtureId(url),
            };
        } catch {
            return {
                previewTitle: null,
                preview: null,
                verdict: null,
                tips: [],
                market: null,
                selection: null,
                odds: null,
                stakeUnits: 2,
                extraTips: [],
                detailsUrl: url,
                fixtureId: this.extractFixtureId(url),
            };
        }
    }

    extractMainTip($, pageUrl = this.betOfTheDayUrl) {
        const item = $(".matchlist.betacctime, .matchlist").first();
        const isTennis = /tennis-bet-of-the-day/i.test(pageUrl);
        const sport = isTennis ? "Tennis" : "Football";
        const league = isTennis ? "Tennis Bet of the Day" : "Bet of the Day";

        if (!item.length) {
            return null;
        }

        const market = item.find(".match-name").children("span").not(".m-name").first().text().trim() || (isTennis ? "To Win Match" : "Full Time Result");
        const teamsText = item.find(".match-name .m-name").text().trim();
        const [homeTeam, awayTeam] = teamsText.split(/\s+v\s+|\s+vs\s+/i).map((team) => team.trim());
        if (this.isPlaceholderFeaturedTeam(homeTeam) || this.isPlaceholderFeaturedTeam(awayTeam)) return null;

        const selection = item.find(".plr-name").text().trim();
        const oddsText = item.find(".ods").attr("data-ods") || item.find(".ods").text();
        const odds = Number(oddsText?.replace(/,/g, ".")) || null;
        const kickoff = item.find(".tm").text().trim() || null;

        // Clean preview / reason narrative
        const reasonEl = item.find(".reasonForTipM").length ? item.find(".reasonForTipM") : $(".reasonForTipM").first();
        const seeFullPreviewHref = reasonEl.find("a.seeFullPreviewLink").attr("href") || $(".seeFullPreviewLink").attr("href");
        const seeFullPreviewUrl = this.resolveUrl(seeFullPreviewHref);

        let preview = null;
        if (reasonEl.length) {
            const clone = reasonEl.clone();
            clone.find("a, svg, .titleRFT").remove();
            preview = clone.text().replace(/\s+/g, " ").trim() || null;
        }

        const betUrl = this.resolveUrl($(".bookmakerListM a.b-tips, .placeBet a").first().attr("href")) || null;

        const primaryTip = {
            bookmaker: "Stake.com",
            selection: selection || market,
            market,
            odds,
            units: 2, // default 2 units
            betUrl,
        };

        return {
            sport,
            league,
            homeTeam: homeTeam || null,
            awayTeam: awayTeam || null,
            time: kickoff,
            market,
            prediction: selection || market,
            selection: selection || market,
            odds,
            stakeUnits: 2,
            previewTitle: league,
            preview,
            verdict: preview,
            tips: [primaryTip],
            extraTips: [],
            seeFullPreviewUrl,
            detailsUrl: seeFullPreviewUrl || pageUrl,
            url: seeFullPreviewUrl || pageUrl,
            isFeatured: true,
            featuredType: isTennis ? "tennis-bet-of-the-day" : "bet-of-the-day",
            fixtureId: this.extractFixtureId(seeFullPreviewUrl || pageUrl),
        };
    }
}

module.exports = FreeTipsMaxBetScraper;
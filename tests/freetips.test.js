const assert = require("assert");
const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const os = require("os");
const path = require("path");

const FreeTipsMaxBetScraper = require("../scrapers/freetips.scraper");
const FreeTipsNormalizer = require("../normalizers/freetips.normalizer");
const { printNormalizedTips } = require("./tip-table");
const { saveTestResults } = require("./test-results");

// ---------------------------------------------------------------------------
// Deterministic fixtures.
//
// The bet-of-the-day / tennis bet pages are regenerated at test time using the
// CURRENT date, so the scraper's stale-snapshot guard accepts them exactly as it
// would a freshly downloaded page. Team/selection/odds are placeholders only;
// assertions never depend on a specific day's published team.
// ---------------------------------------------------------------------------

const today = new Date();
const todayIso = today.toISOString().slice(0, 10); // e.g. 2026-08-24
const [todayY, todayM, todayD] = todayIso.split("-").map(Number);
const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const todayLabel = `${todayD} ${monthNames[todayM - 1]}, ${todayY}`;

const buildFeaturedHtml = ({ isTennis = false, home = "Team A", away = "Team B", selection = "Home Win Moneyline", odds = 2.2, recommendations = "" } = {}) => {
  const titleTeam = isTennis ? "Tennis Bet of the Day" : "Bet of the Day";
  const kickoff = "17:00";
  return `<!DOCTYPE html><html lang="en"><head>
    <meta charset="utf-8"> <title>${titleTeam} Tips ${todayLabel} - Best Bets Updated Daily</title>
    <meta property="og:title" content="${titleTeam} Tips ${todayLabel} - Best Bets Updated Daily">
    <meta property="article:modified_time" content="${todayIso}T08:00:00">
</head><body class="category">
    <div class="main">
        <div class="cr-row cr-heading"><h1>${titleTeam}  ${todayLabel}</h1></div>
        <div class="nw-desc DE">
            <div class="row-desc" spellcheck="false">
                <div>Our ${titleTeam} on ${todayLabel} is paying <b>${odds}</b> and features ${home} vs ${away}.<div><br></div></div>
            </div>
        </div>
        <section>
            <div class="revealArea">
                <div class="nw-desc" data-compid="MultiBet">
                    <div class="win-acc">
                        <div class="t-win-acc">
                            <div class="head-t">${titleTeam}</div>
                            <ul>
                                <li>
                                    <div class="matchlist betacctime">
                                        <span class="tm" data-bettime="${todayIso}T05:00:00 PM">${kickoff}</span>
                                        <span class="tur-name">
                                            <div class="match-name">
                                                <span>Full Time Result</span>
                                                <span class="m-name">${home} vs ${away}</span>
                                            </div>
                                            <span class="plr-name">${selection}</span>
                                        </span>
                                        <span class="ods" data-ods="${odds}">${odds}</span>
                                    </div>
                                    <div class="reasonForTipM">
                                        <div class="titleRFT">Reason for tip</div>
                                        <p>${away} are strong favourites today and should pick up the win.</p>
                                    </div>
                                    ${recommendations}
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    </div>
</body></html>`;
};

const buildNoTennisToday = () => `<!DOCTYPE html><html lang="en"><head>
    <meta charset="utf-8"> <title>Tennis Bet Of The Day Tips ${todayLabel} - Best Bets Updated Daily</title>
    <meta property="og:title" content="Tennis Bet Of The Day Tips ${todayLabel} - Best Bets Updated Daily">
    <meta property="article:modified_time" content="${todayIso}T08:00:00">
</head><body class="category">
    <div class="main">
        <div class="cr-row cr-heading"><h1>Tennis Bet of the Day  ${todayLabel}</h1></div>
        <div class="cr-row cr-desc">
            <div class="row-desc" spellcheck="false">
                <div>There is no tennis bet of the day published today. Check back tomorrow for the latest tennis tip from our experts.</div>
            </div>
        </div>
    </div>
</body></html>`;

const sampleHtml = `
  <section class="betting-list">
    <article class="tip-item">
      <a href="/betting/team-secret-vs-onside-gaming/">
        <h3>Team Secret vs ONSIDE GAMING</h3>
      </a>
      <div>Starts 6h 30m</div>
      <div>Returns $27.50</div>
    </article>
    <article class="tip-item">
      <a href="/betting/tyloo-vs-jd-gaming/">
        <h3>TYLOO vs JD Gaming</h3>
      </a>
      <div>Starts 6h 30m</div>
      <div>Returns $45.00</div>
    </article>
    <article class="tip-item">
      <a href="/betting/apia-leichhardt-vs-melbourne-victory/">
        <h3>APIA Leichhardt vs Melbourne Victory</h3>
      </a>
      <div>Starts 7h</div>
      <div>Returns $19.00</div>
    </article>
  </section>
`;

const isFeaturedUrl = (url) => /\/betting\/(?:bet-of-the-day|tennis-bet-of-the-day)\/?$/i.test(url || "");

(async () => {
    const testSnapshotDir = fs.mkdtempSync(path.join(os.tmpdir(), "freetips-test-"));
    const scraper = new FreeTipsMaxBetScraper();
    assert.strictEqual(scraper.useBrowserFetch, true, "FreeTips should use a browser by default to pass Cloudflare");
    assert.strictEqual(
      scraper.isCloudflareChallengePage("<h1>Real page</h1><script src='/cdn-cgi/challenge-platform/scripts/main.js'></script>"),
      false,
      "Cloudflare's shared challenge-platform script must not delay a real page"
    );
    assert.strictEqual(scraper.isCloudflareChallengePage("<title>Just a moment...</title>"), true);

  const refreshProbePath = path.resolve(__dirname, "freetips-refresh-probe.html");
  const staleLegacyDir = path.resolve(__dirname, "freetips-pages");
  const freshListingsHtml = "<html><body>FRESH-LISTINGS-PAGE</body></html>";
  fs.rmSync(refreshProbePath, { force: true });
  fs.rmSync(staleLegacyDir, { recursive: true, force: true });
  scraper.localHtmlPath = null;
  scraper.localHtmlCandidates = [refreshProbePath];
  scraper.localSnapshotDir = testSnapshotDir;
  scraper.chromeExecutableCandidates = [];
  scraper.useBrowserFetch = false;
  scraper.fetchWithAxios = async () => freshListingsHtml;
  const refreshedListingsHtml = await scraper.refreshLocalHtml(refreshProbePath);
  assert.strictEqual(refreshedListingsHtml, freshListingsHtml, "Listings should be refreshed from the live fetch path");
  assert.strictEqual(fs.readFileSync(refreshProbePath, "utf8"), freshListingsHtml, "Fresh listings HTML should overwrite the local file");
  assert.strictEqual(fs.readFileSync(scraper.buildLocalSnapshotPath(scraper.url), "utf8"), freshListingsHtml, "Fresh listings HTML should overwrite the listings snapshot");
  fs.rmSync(refreshProbePath, { force: true });

  const cachedFeaturedHtml = buildFeaturedHtml({ home: "Cached FC", away: "Cached United" });
  const liveFeaturedHtml = buildFeaturedHtml({ home: "Live FC", away: "Live United" });
  const originalFetchWithAxiosOrBrowser = scraper.fetchWithAxiosOrBrowser;
  scraper.writePageSnapshot(scraper.betOfTheDayUrl, cachedFeaturedHtml);
  let forcedFeaturedFetches = 0;
  scraper.fetchWithAxiosOrBrowser = async () => {
    forcedFeaturedFetches += 1;
    return liveFeaturedHtml;
  };
  const refreshedFeaturedHtml = await scraper.downloadPage(scraper.betOfTheDayUrl, null, { forceRefresh: true });
  assert.strictEqual(forcedFeaturedFetches, 1, "A forced featured refresh must not reuse its cached snapshot");
  assert.strictEqual(refreshedFeaturedHtml, liveFeaturedHtml, "A forced featured refresh must return live content");
  scraper.fetchWithAxiosOrBrowser = originalFetchWithAxiosOrBrowser;

    const $ = cheerio.load(sampleHtml);

    const extracted = scraper.extractListingTips($);
    assert.strictEqual(extracted.length, 3, "Should extract three items from the listing page");
    assert.strictEqual(extracted[0].homeTeam, "Team Secret");
    assert.strictEqual(extracted[0].awayTeam, "ONSIDE GAMING");
    assert.strictEqual(extracted[0].time, "6h 30m");
    assert.strictEqual(extracted[0].odds, 27.5);
    assert.strictEqual(extracted[0].detailsUrl, "https://www.freetips.com/betting/team-secret-vs-onside-gaming/");

    const firstItem = extracted[0];
    assert.strictEqual(firstItem.league, "Betting Tips");
    assert.strictEqual(firstItem.sport, "Football");

    const placeholderFeaturedHtml = `<!DOCTYPE html><html><head><title>Bet of the Day Tips ${todayLabel} - Best Bets Updated Daily</title></head><body>
      <h1>Bet of the Day ${todayLabel}</h1>
      <div class="matchlist betacctime">
        <span class="tm">17:00</span>
        <span class="match-name"><span>Full Time Result</span><span class="m-name">Home Team / Away Team</span></span>
        <span class="plr-name">Home Win</span>
        <span class="ods" data-ods="2.20">2.20</span>
      </div>
    </body></html>`;
    assert.strictEqual(scraper.isUsableSnapshot(scraper.betOfTheDayUrl, placeholderFeaturedHtml), false, "Placeholder featured page should be rejected as stale");
    assert.strictEqual(scraper.extractMainTip(cheerio.load(placeholderFeaturedHtml), scraper.betOfTheDayUrl), null, "Placeholder featured main tip should be ignored");

    const detailHtml = `
      <html><body>
        <h1>Team Secret vs ONSIDE GAMING Tips – Team Secret to Struggle in VCT Pacific Stage 2 Play-In</h1>
        <div>Quick Summary</div>
        <div>ONSIDE GAMING To Win Moneyline @1.57 - 2 Units</div>
        <div>Stake.com Deposit $1500 Get $3000 with referral code NEWBONUS</div>
        <div>Verdict</div>
        <div>ONSIDE -1.5 Maps Map Handicap @2.75 - 5 Units</div>
        <div>ONSIDE GAMING Correct Score @4.00 - 3 Units</div>
      </body></html>
    `;
    const snapshotDir = testSnapshotDir;
    const originalAxiosGet = axios.get;
    axios.get = async () => ({ data: detailHtml });
    try {
      scraper.chromeExecutableCandidates = [];
      scraper.useBrowserFetch = false;
      scraper.localSnapshotDir = snapshotDir;
      const detailUrl = "https://www.freetips.com/esports/team-secret-vs-onside-gaming-tips-20260817-0028/";
      fs.rmSync(scraper.buildLocalSnapshotPath(detailUrl), { force: true });
      const detail = await scraper.fetchDetailPage(detailUrl);
      assert.ok(["To Win Moneyline", "Map Handicap"].includes(detail.market), "Detail market should be a supported prediction market");
      assert.ok(detail.selection, "Detail selection should be present");
      assert.ok(Number.isFinite(detail.odds), "Detail odds should be numeric");
      assert.ok(detail.preview && detail.preview.includes("Quick Summary"), "Detail page preview should be captured");
      assert.strictEqual(detail.selection, "ONSIDE -1.5 Maps", "The highest-unit listing recommendation should be primary");
      assert.strictEqual(detail.market, "Map Handicap", "The primary market should come from the highest-unit recommendation");
      assert.deepStrictEqual(detail.extraTips, [
        { selection: "ONSIDE GAMING", market: "Correct Score", odds: 4, stakeUnits: 3 },
        { selection: "ONSIDE GAMING", market: "To Win Moneyline", odds: 1.57, stakeUnits: 2 },
      ], "All lower-unit listing recommendations should be retained as extraTips");
      const snapshotPath = path.join(snapshotDir, "team-secret-vs-onside-gaming-tips-20260817-0028.html");
      assert.ok(fs.existsSync(snapshotPath), "Detail page HTML should be saved under tests before parsing");
    } finally {
      axios.get = originalAxiosGet;
    }

    // -----------------------------------------------------------------------
    // Live-congruent scrape test.
    //
    // The featured pages are regenerated NOW with today's date - so the
    // scraper's freshness guard accepts them exactly as a fresh live download.
    // No assertion depends on any particular team published on a given day.
    // -----------------------------------------------------------------------
    scraper.useLocalHtml = true;
    const listingsFixturePath = path.resolve(__dirname, "freetips-listings.html");
    fs.writeFileSync(listingsFixturePath, sampleHtml, "utf8");
    scraper.localHtmlPath = listingsFixturePath;
    scraper.chromeExecutableCandidates = [];
    scraper.useBrowserFetch = false;
    fs.rmSync(scraper.buildLocalSnapshotPath(scraper.betOfTheDayUrl), { force: true });
    fs.rmSync(scraper.buildLocalSnapshotPath(scraper.tennisBetOfTheDayUrl), { force: true });

    scraper.fetchWithAxiosOrBrowser = async (url) => {
      if (url === scraper.betOfTheDayUrl) return buildFeaturedHtml({
        home: "Lions FC",
        away: "Tigers United",
        recommendations: "<div>Tigers United To Win Moneyline @2.4 - 5 Units</div><div>Over 2.5 Goals Total Goals @1.9 - 3 Units</div>",
      });
      if (url === scraper.tennisBetOfTheDayUrl) return buildFeaturedHtml({
        isTennis: true,
        home: "Alex Morgan",
        away: "Jamie Lee",
        selection: "Alex Morgan to Win",
        odds: 1.8,
      });

      const slug = new URL(url).pathname.split("/").filter(Boolean).pop() || "event";
      const titleSlug = slug.replace(/-\d{8}-\d{4}$/, "").replace(/-(?:tips|predictions|betting|live|stream)$/, "");
      const [home = "Home", away = "Away"] = titleSlug.split(/-vs-|@/i);
      const selection = away.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
      const title = `${home.replace(/-/g, " ")} vs ${selection} Tips`;
      return `<html><body><h1>${title}</h1><div>Verdict</div><p>${selection} To Win Moneyline @2.6 - 3 Units</p></body></html>`;
    };

    const rawTips = await scraper.scrape();
    const normalizer = new FreeTipsNormalizer();
    const tips = normalizer.normalize(rawTips);
    assert.ok(tips.length > 0, "Normalized output should include at least one tip");

    // Featured pages are generated with today's date, exercising the same
    // freshness guard without introducing a network or Cloudflare dependency.
    const featured = rawTips.filter((tip) => isFeaturedUrl(tip.detailsUrl || tip.url));
    const listings = rawTips.filter((tip) => !isFeaturedUrl(tip.detailsUrl || tip.url));
    assert.ok(featured.length >= 1, "At least the football bet-of-the-day should be extracted from the live site");
    assert.strictEqual(tips.length, featured.length + listings.length, "Normalized and raw tip counts must agree");

    const betDay = featured.find((tip) => /bet-of-the-day/i.test(tip.detailsUrl || tip.url || "") && !/tennis/i.test(tip.detailsUrl || tip.url || ""));
    assert.ok(betDay, "Football bet-of-the-day should be present");
    assert.ok(betDay.homeTeam && betDay.awayTeam, "Bet of the day must carry home and away teams");
    assert.ok(Number.isFinite(betDay.odds), "Bet of the day odds must be numeric");
    assert.ok(betDay.selection, "Bet of the day should carry a selection");
    assert.strictEqual(betDay.selection, "Home Win Moneyline", "Bet of the Day must keep its main-page selection as primary");
    assert.deepStrictEqual(betDay.extraTips, [
      { selection: "Tigers United", market: "To Win Moneyline", odds: 2.4, stakeUnits: 5 },
      { selection: "Over 2.5 Goals", market: "Total Goals", odds: 1.9, stakeUnits: 3 },
    ], "Bet of the Day should expose its other page recommendations as extraTips");

    const tennisFeatured = featured.find((tip) => /tennis-bet-of-the-day/i.test(tip.detailsUrl || tip.url || ""));
    if (tennisFeatured) {
      assert.ok(tennisFeatured.homeTeam && tennisFeatured.awayTeam, "Tennis bet of the day must carry both players");
      assert.ok(tennisFeatured.selection, "Tennis bet of the day should carry a selection");
    }

    assert.ok(fs.existsSync(scraper.buildLocalSnapshotPath(scraper.betOfTheDayUrl)), "Football bet of the day page should be saved locally");
    assert.ok(fs.existsSync(scraper.buildLocalSnapshotPath(scraper.tennisBetOfTheDayUrl)), "Tennis bet of the day page should be saved locally");

    // Listing details are mocked, so assertions remain independent of the
    // changing contents and availability of the live site.
    assert.ok(listings.length > 0, "Listings should include at least one match preview");
    assert.ok(listings.every((tip) => tip.sport && tip.homeTeam && tip.awayTeam), "Every listing must carry sport and both teams");
    assert.ok(new Set([...featured, ...listings].map((tip) => tip.sport)).size > 1, "FreeTips output should span more than one sport");
    assert.ok(tips.every((tip) => tip.selection && tip.selection !== "Raffle."), "Every normalized tip should have a real selection");
    assert.ok(new Set(rawTips.slice(featured.length).map((tip) => tip.selection)).size > 1, "Listing details should not all reuse one selection");

    fs.rmSync(listingsFixturePath, { force: true });

    // Run the actual premium source once, show the same compact table as the
    // other providers, and persist its result for the contract test below.
    const liveScraper = new FreeTipsMaxBetScraper();
    const liveTips = new FreeTipsNormalizer().normalize(await liveScraper.scrape());
    assert.ok(liveTips.length > 0, "FreeTips live scraper should return at least one tip");
    printNormalizedTips("FreeTips", liveTips);
    saveTestResults("freetips", liveTips);

    fs.rmSync(testSnapshotDir, { recursive: true, force: true });

    console.log(`FreeTips fixture tests passed. Normalized ${tips.length} fixture tip(s).`);
})();

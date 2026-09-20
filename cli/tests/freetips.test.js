const assert = require("assert");
const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const os = require("os");
const path = require("path");

const FreeTipsMaxBetScraper = require("../scrapers/freetips.scraper");
const FreeTipsNormalizer = require("../normalizers/freetips.normalizer");
const { printNormalizedTips } = require("./tip-table");
// Orchestrator is responsible for saving snapshots; tests should not write files.

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

    const golfListingHtml = `
      <section class="betting-list">
        <article class="tip-item">
          <a href="/golf/biltmore-championship-asheville-tips-20260916-0049/">
            <h3>Biltmore Championship Asheville</h3>
          </a>
          <div>Starts 2h 35m</div>
          <div>Returns $2.10</div>
        </article>
      </section>
    `;
    const golfListings = scraper.extractListingTips(cheerio.load(golfListingHtml));
    assert.strictEqual(golfListings.length, 1, "Golf tournament listings should not be filtered out just because they are single-title fixtures");
    assert.strictEqual(golfListings[0].sport, "Golf", "Golf listing should map to the Golf sport bucket");
    assert.strictEqual(golfListings[0].homeTeam, "Biltmore Championship Asheville", "Golf tournament name should be preserved as the fixture label");
    assert.strictEqual(golfListings[0].awayTeam, "Field", "Golf compensation should use the Field placeholder for the opposing side");

    const rawMarketDetailHtml = `
      <html><body>
        <div class="verdict" data-compid="news-verdict">
          <div class="verdictBoxItem">
            <div class="hedTextVBD">
              <div class="hedTextOneVBD">Ben James</div>
              <div class="hedTextOneVBD">Each-Way</div>
              <div class="hedTextTwoVBD">@31.00 - 1 Unit</div>
            </div>
          </div>
          <div class="verdictBoxItem">
            <div class="hedTextVBD">
              <div class="hedTextOneVBD">Rashid Khan</div>
              <div class="hedTextOneVBD">Best Afghanistan Bowler</div>
              <div class="hedTextTwoVBD">@3.60 - 2 Units</div>
            </div>
          </div>
          <div class="verdictBoxItem">
            <div class="hedTextVBD">
              <div class="hedTextOneVBD">Harry Kane</div>
              <div class="hedTextOneVBD">To Score Anytime</div>
              <div class="hedTextTwoVBD">@2.10 - 1 Unit</div>
            </div>
          </div>
        </div>
      </body></html>
    `;
    const rawMarketParsed = await scraper.parseDetailPage("https://www.freetips.com/football/harry-kane-to-score-anytime/", rawMarketDetailHtml);
    assert.ok(rawMarketParsed.tips.some((tip) => tip.selection === "Ben James" && tip.market === "Each-Way"), "Golf rows should preserve the market label when it sits after the player name");
    assert.ok(rawMarketParsed.tips.some((tip) => tip.selection === "Rashid Khan" && /Best Afghanistan Bowler/i.test(tip.market)), "Cricket rows should keep the market label when the site writes a descriptive market phrase");
    assert.ok(rawMarketParsed.tips.some((tip) => tip.selection === "Harry Kane" && /To Score Anytime/i.test(tip.market)), "Football rows with descriptive markets should still be parsed");

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
        <div class="verdict" data-compid="news-verdict">
          <h2>Verdict</h2>
          <div>ONSIDE GAMING are in great form and should claim victory.</div>
          <div class="verdictBoxDataMain">
            <div class="verdictBoxItem">
              <div class="logoImgVBD"><img alt="Stake.com" src="https://imagedelivery.net/stake.svg"></div>
              <div class="hedTextVBD">
                <div class="hedTextOneVBD">ONSIDE -1.5 Maps</div>
                <div class="hedTextOneVBD marketName">Map Handicap</div>
                <div class="hedTextTwoVBD">@2.75 - 5 Units</div>
              </div>
              <a class="placeBetBtnVT" href="https://www.freetips.com/link/123">Bet at Stake.com</a>
            </div>
            <div class="verdictBoxItem">
              <div class="logoImgVBD"><img alt="Stake.com" src="https://imagedelivery.net/stake.svg"></div>
              <div class="hedTextVBD">
                <div class="hedTextOneVBD">ONSIDE GAMING</div>
                <div class="hedTextOneVBD marketName">Correct Score</div>
                <div class="hedTextTwoVBD">@4.00 - 3 Units</div>
              </div>
              <a class="placeBetBtnVT" href="https://www.freetips.com/link/123">Bet at Stake.com</a>
            </div>
            <div class="verdictBoxItem">
              <div class="logoImgVBD"><img alt="Stake.com" src="https://imagedelivery.net/stake.svg"></div>
              <div class="hedTextVBD">
                <div class="hedTextOneVBD">ONSIDE GAMING</div>
                <div class="hedTextOneVBD marketName">To Win Moneyline</div>
                <div class="hedTextTwoVBD">@1.57 - 2 Units</div>
              </div>
              <a class="placeBetBtnVT" href="https://www.freetips.com/link/123">Bet at Stake.com</a>
            </div>
          </div>
        </div>
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
      assert.strictEqual(detail.verdict, "ONSIDE GAMING are in great form and should claim victory.");
      assert.strictEqual(detail.tips.length, 3, "Detail should extract all 3 verdictBoxItems");
      assert.strictEqual(detail.selection, "ONSIDE -1.5 Maps", "Highest-unit tip should be primary selection");
      assert.strictEqual(detail.market, "Map Handicap");
      assert.strictEqual(detail.odds, 2.75);
      assert.strictEqual(detail.stakeUnits, 5);
      assert.strictEqual(detail.tips[0].bookmaker, "Stake.com");
      assert.strictEqual(detail.tips[0].units, 5);
      assert.strictEqual(detail.tips[0].betUrl, "https://www.freetips.com/link/123");
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
      return `<html><body><h1>${title}</h1><div class="verdict" data-compid="news-verdict"><h2>Verdict</h2><div>Expect an entertaining matchup.</div><div class="verdictBoxDataMain"><div class="verdictBoxItem"><div class="logoImgVBD"><img alt="Stake.com"></div><div class="hedTextVBD"><div class="hedTextOneVBD">${selection}</div><div class="hedTextOneVBD marketName">To Win Moneyline</div><div class="hedTextTwoVBD">@2.60 - 3 Units</div></div><a class="placeBetBtnVT" href="https://www.freetips.com/link/123">Bet at Stake.com</a></div></div></div></body></html>`;
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
    assert.ok(Array.isArray(betDay.tips) && betDay.tips.length > 0, "Bet of the day must have structured tips");
    assert.strictEqual(betDay.tips[0].units, 2, "Featured tip default units should be 2 when not set");

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
    assert.ok(tips.every((tip) => tip.selection && tip.selection !== "Raffle."), "Every normalized tip should have a real selection");
    assert.ok(tips.every((tip) => tip.verdict && Array.isArray(tip.tips) && tip.tips.length > 0), "Every normalized tip must carry structured verdict and tips");

    fs.rmSync(listingsFixturePath, { force: true });

    // The orchestrator is responsible for producing the saved JSON snapshots
    // consumed by the contract test. Tests should not perform live scraping
    // or overwrite the authoritative test snapshots.

    // Verify a saved snapshot exists and is loadable by the contract test.
    const { loadTestResults } = require('../orchestrator/test-results');
    const saved = loadTestResults('freetips');
    assert.ok(Array.isArray(saved) && saved.length > 0, 'Saved freetips snapshot must exist and contain tips');

    fs.rmSync(testSnapshotDir, { recursive: true, force: true });

    console.log(`FreeTips fixture tests passed. Normalized ${tips.length} fixture tip(s).`);
})();
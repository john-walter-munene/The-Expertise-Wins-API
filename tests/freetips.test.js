const assert = require("assert");
const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

const FreeTipsMaxBetScraper = require("../scrapers/freetips.scraper");
const FreeTipsNormalizer = require("../normalizers/freetips.normalizer");
const { printNormalizedTips } = require("./tip-table");

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

(async () => {
    const scraper = new FreeTipsMaxBetScraper();

  const refreshProbePath = path.resolve(__dirname, "freetips-refresh-probe.html");
  const freshListingsHtml = "<html><body>FRESH-LISTINGS-PAGE</body></html>";
  scraper.localHtmlPath = null;
  scraper.localHtmlCandidates = [refreshProbePath];
  scraper.localSnapshotDir = path.resolve(__dirname, "freetips-pages");
  scraper.chromeExecutableCandidates = [];
  scraper.fetchWithAxios = async () => freshListingsHtml;
  const refreshedListingsHtml = await scraper.refreshLocalHtml(refreshProbePath);
  assert.strictEqual(refreshedListingsHtml, freshListingsHtml, "Listings should be refreshed from the live fetch path");
  assert.strictEqual(fs.readFileSync(refreshProbePath, "utf8"), freshListingsHtml, "Fresh listings HTML should overwrite the local file");
  assert.strictEqual(fs.readFileSync(scraper.buildLocalSnapshotPath(scraper.url), "utf8"), freshListingsHtml, "Fresh listings HTML should overwrite the listings snapshot");
  fs.rmSync(refreshProbePath, { force: true });

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

    const detailHtml = `
      <html><body>
        <h1>Team Secret vs ONSIDE GAMING Tips – Team Secret to Struggle in VCT Pacific Stage 2 Play-In</h1>
        <div>Quick Summary</div>
        <div>ONSIDE GAMING To Win Moneyline @1.57 - 3 Units</div>
        <div>Stake.com Deposit $1500 Get $3000 with referral code NEWBONUS</div>
        <div>Verdict</div>
        <div>ONSIDE -1.5 Maps Map Handicap @2.75 - 3 Units</div>
      </body></html>
    `;
    const snapshotDir = path.resolve(__dirname, "freetips-pages");
    const originalAxiosGet = axios.get;
    axios.get = async () => ({ data: detailHtml });
    try {
      scraper.chromeExecutableCandidates = [];
      scraper.localSnapshotDir = snapshotDir;
      const detailUrl = "https://www.freetips.com/esports/team-secret-vs-onside-gaming-tips-20260817-0028/";
      fs.rmSync(scraper.buildLocalSnapshotPath(detailUrl), { force: true });
      const detail = await scraper.fetchDetailPage(detailUrl);
      assert.ok(["To Win Moneyline", "Map Handicap"].includes(detail.market), "Detail market should be a supported prediction market");
      assert.ok(detail.selection, "Detail selection should be present");
      assert.ok(Number.isFinite(detail.odds), "Detail odds should be numeric");
      assert.ok(detail.preview && detail.preview.includes("Quick Summary"), "Detail page preview should be captured");
      const snapshotPath = path.join(snapshotDir, "team-secret-vs-onside-gaming-tips-20260817-0028.html");
      assert.ok(fs.existsSync(snapshotPath), "Detail page HTML should be saved under tests before parsing");
    } finally {
      axios.get = originalAxiosGet;
    }

    scraper.useLocalHtml = true;
    scraper.localHtmlPath = path.resolve(__dirname, "freetips.html");
    scraper.chromeExecutableCandidates = [];
    scraper.fetchWithAxiosOrBrowser = async (url) => {
      if (url === scraper.betOfTheDayUrl || url === scraper.tennisBetOfTheDayUrl) {
        return fs.readFileSync(scraper.buildLocalSnapshotPath(url), "utf8");
      }

      const slug = new URL(url).pathname.split("/").filter(Boolean).pop() || "event";
      const titleSlug = slug.replace(/-\d{8}-\d{4}$/, "").replace(/-(?:tips|predictions|betting|live|stream)$/, "");
      const [home = "Home", away = "Away"] = titleSlug.split(/-vs-/i);
      const selection = away.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
      const title = `${home.replace(/-/g, " ")} vs ${selection} Tips`;
      return `<html><body><h1>${title}</h1><div>Verdict</div><p>${selection} To Win Moneyline @2.62 - 3 Units</p></body></html>`;
    };
    const rawTips = await scraper.scrape();
    const normalizer = new FreeTipsNormalizer();
    const tips = normalizer.normalize(rawTips);
    assert.ok(tips.length > 0, "Normalized output should include at least one tip");
    assert.strictEqual(tips.length, 22, "FreeTips should return two featured tips plus twenty listings");
    assert.ok(rawTips[0] && rawTips[0].detailsUrl && rawTips[0].detailsUrl.includes("bet-of-the-day"), "First result should be the bet-of-day tip");
    assert.ok(rawTips[1] && rawTips[1].detailsUrl && rawTips[1].detailsUrl.includes("tennis-bet-of-the-day"), "Second result should be the tennis bet-of-day tip");
    assert.strictEqual(rawTips[0].homeTeam, "Petrolul Ploiesti", "Bet of the day should come from its own saved page");
    assert.strictEqual(rawTips[0].selection, "Home Win (12/5)", "Bet of the day selection should be normalized from its own page");
    assert.strictEqual(rawTips[1].homeTeam, "Lorenzo Musetti", "Tennis bet of the day should come from its own saved page");
    assert.strictEqual(rawTips[1].selection, "Frances Tiafoe (1/1)", "Tennis selection should be normalized from its own page");
    assert.ok(fs.existsSync(scraper.buildLocalSnapshotPath(scraper.betOfTheDayUrl)), "Bet of the day page should be saved locally");
    assert.ok(fs.existsSync(scraper.buildLocalSnapshotPath(scraper.tennisBetOfTheDayUrl)), "Tennis bet of the day page should be saved locally");
    assert.ok(rawTips.some((tip) => tip.sport === "Tennis"), "Consolidated output should include a tennis prediction");
    assert.ok(rawTips.some((tip) => tip.sport === "Australian Rules"), "Listings should include Australian Rules tips");
    assert.ok(rawTips.some((tip) => tip.sport === "Rugby League"), "Listings should include Rugby League tips");
    assert.ok(rawTips.some((tip) => tip.sport === "Rugby Union"), "Listings should include Rugby Union tips");
    assert.ok(rawTips.some((tip) => tip.sport === "Volleyball"), "Listings should include Volleyball tips");
    assert.ok(tips.every((tip) => tip.selection && tip.selection !== "Raffle."), "Every normalized tip should have a real selection");
    assert.ok(new Set(rawTips.slice(2).map((tip) => tip.selection)).size > 1, "Listing details should not all reuse one prediction");

    printNormalizedTips("FreeTips", tips);
    console.log(`Freetips tests passed. Normalized ${tips.length} tip(s).`);
})();
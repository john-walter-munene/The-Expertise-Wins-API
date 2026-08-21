const TipsBetScraper = require("../scrapers/tipsbet.scraper");
const TipsBetNormalizer = require("../normalizers/tipsbet.normalizer");
const { printNormalizedTips } = require("./tip-table");

(async () => {
    const scraper = new TipsBetScraper();
    const rawTips = await scraper.scrape();
    const normalizer = new TipsBetNormalizer();
    const tips = normalizer.normalize(rawTips);

    printNormalizedTips("TipsBet", tips);
})();
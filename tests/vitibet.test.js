const VitiBetScraper = require("../scrapers/vitibet.scraper");
const VitiBetNormalizer = require("../normalizers/vitibet.normalizer");
const { printNormalizedTips } = require("./tip-table");

(async () => {
    const scraper = new VitiBetScraper();
    const rawTips = await scraper.scrape();
    const normalizer = new VitiBetNormalizer();
    const tips = normalizer.normalize(rawTips);

    if (!tips.length) throw new Error("No tips were extracted from Vitibet");

    printNormalizedTips("Vitibet", tips);

})();
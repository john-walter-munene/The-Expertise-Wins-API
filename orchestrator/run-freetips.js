#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const FreeTipsMaxBetScraper = require("../scrapers/freetips.scraper");
const FreeTipsNormalizer = require("../normalizers/freetips.normalizer");
const { saveTestResults } = require("./test-results");
// minimist is tiny and commonly available; include a fallback parser if missing
try { require.resolve('minimist'); } catch { /* will still work, but recommend installing minimist for --date support */ }

async function run() {
    try {
        console.log("Running freetips scraper...");
        const scraper = new FreeTipsMaxBetScraper();

        // Parse CLI args for optional `--date=YYYY-MM-DD` (defaults to today)
        const argv = process.argv.slice(2);
        let dateArg = null;
        for (let i = 0; i < argv.length; i++) {
            const a = argv[i];
            if (a.startsWith("--date=")) dateArg = a.split("=")[1];
            else if (a === "--date" && argv[i+1]) { dateArg = argv[i+1]; i++; }
            else if (a === "-d" && argv[i+1]) { dateArg = argv[i+1]; i++; }
        }
        const now = new Date();
        const todayIso = (dateArg && /^\d{4}-\d{2}-\d{2}$/.test(dateArg)) ? dateArg : now.toISOString().slice(0, 10);

        // Ensure the scraper writes/reads local HTML snapshots under the
        // orchestrator free-tips directory instead of the repo `tests/`.
        const freeTipsDir = path.resolve(__dirname, "free-tips");
        const freetipsSnapshotDir = freeTipsDir;
        fs.mkdirSync(freetipsSnapshotDir, { recursive: true });

        // Point the scraper to use the orchestrator snapshot locations.
        scraper.localSnapshotDir = freetipsSnapshotDir;
        scraper.localHtmlCandidates = [
            path.join(freetipsSnapshotDir, "freetips.html"),
            path.join(__dirname, "free-tips.html"),
            path.resolve(process.cwd(), "freetips.html"),
        ];

        const raw = await scraper.scrape();
        console.log(`Scraped ${Array.isArray(raw) ? raw.length : 0} raw tips.`);

        const normalizer = new FreeTipsNormalizer();
        const normalized = normalizer.normalize(Array.isArray(raw) ? raw : []);

        console.log(`Normalized ${Array.isArray(normalized) ? normalized.length : 0} tips.`);

        saveTestResults("freetips", normalized, { date: todayIso });
        console.log(`Saved freetips test results to orchestrator/test-results/${todayIso}/freetips.json`);

        // Run the test suite so the orchestrator validates the saved snapshot.
        try {
            console.log("Running test suite to validate saved snapshot...");
            execSync("npm test", { stdio: "inherit" });
        } catch (testErr) {
            console.error("Tests failed after orchestration:", testErr && testErr.message ? testErr.message : testErr);
            // Do not abort the orchestrator run; continue to cleanup.
        }

        // Cleanup: remove any HTML snapshot files written under the orchestrator
        // freetips snapshot directory, keeping only the JSON snapshot.
        try {
            const entries = fs.readdirSync(freetipsSnapshotDir, { withFileTypes: true });
            for (const entry of entries) {
                const entryPath = path.join(freetipsSnapshotDir, entry.name);
                if (entry.isFile() && /\.html?$/i.test(entry.name)) {
                    fs.rmSync(entryPath, { force: true });
                }
            }
            console.log("Cleaned up HTML snapshots under orchestrator/free-tips/");
        } catch (cleanupErr) {
            console.warn("Snapshot cleanup failed:", cleanupErr && cleanupErr.message ? cleanupErr.message : cleanupErr);
        }

        // Optionally remove obsolete test fixtures under `tests/` that are
        // now managed by the orchestrator. This is opt-in to avoid surprise
        // deletions; pass `--cleanup-old-tests` or set
        // `CLEANUP_OLD_TESTS=true` to enable.
        try {
            const argv = process.argv.slice(2);
            const cleanupOld = argv.includes("--cleanup-old-tests") || process.env.CLEANUP_OLD_TESTS === "true";
            const repoTestsDir = path.resolve(__dirname, "..", "tests");
            const repoTestsSnapshots = path.join(repoTestsDir, "test-results");
            const repoFreetipsSnapshots = path.join(repoTestsDir, "freetips");

            if (cleanupOld) {
                fs.rmSync(repoTestsSnapshots, { recursive: true, force: true });
                fs.rmSync(repoFreetipsSnapshots, { recursive: true, force: true });
                console.log("Removed obsolete snapshots under tests/");
            } else {
                // Informative message when snapshots still exist.
                if (fs.existsSync(repoTestsSnapshots) || fs.existsSync(repoFreetipsSnapshots)) {
                    console.log("Obsolete snapshots remain under tests/. Run the orchestrator with --cleanup-old-tests to remove them.");
                }
            }
        } catch (rmErr) {
            console.warn("Could not inspect or remove old test snapshots:", rmErr && rmErr.message ? rmErr.message : rmErr);
        }
    } catch (err) {
        console.error("Orchestrator error:", err && err.message ? err.message : err);
        process.exitCode = 2;
    }
}

if (require.main === module) run();
module.exports = { run };
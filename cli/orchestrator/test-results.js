const fs = require("fs");
const path = require("path");

const resultsRoot = path.resolve(__dirname, "test-results");
const htmlSnapshotDir = path.resolve(__dirname, "free-tips");
// The settlement layer owns its own dump directory so the previous day's
// results live next to the settlement tooling that reads them.
const previousDayResultsRoot = path.resolve(__dirname, "..", "settlement", "previous-day-results");

function getFormattedDate(dateIso) {
    const d = dateIso ? new Date(dateIso) : new Date();
    const day = d.getDate();
    const suffix = ["th", "st", "nd", "rd"][day % 10 > 3 ? 0 : (day % 100 - day % 10 !== 10) * day % 10];
    const month = d.toLocaleString('en-GB', { month: 'short' });
    const year = d.getFullYear();
    return `${day}${suffix} ${month} ${year}`;
}

function resultPath(source) {
    // Save directly under test-results, not in a date folder
    return path.join(resultsRoot, `${source}.json`);
}

function clearDownloadedHtmlFiles() {
    const snapshotDir = htmlSnapshotDir;
    const targetFiles = [
        path.resolve(__dirname, "free-tips.html"),
        path.join(snapshotDir, "freetips.html"),
    ];

    for (const target of targetFiles) {
        try {
            if (fs.existsSync(target)) fs.rmSync(target, { force: true });
        } catch {
            // best effort
        }
    }

    try {
        if (!fs.existsSync(snapshotDir)) return;
        for (const entry of fs.readdirSync(snapshotDir, { withFileTypes: true })) {
            if (!entry.isFile()) continue;
            if (/\.(html?|htm)$/i.test(entry.name)) {
                fs.rmSync(path.join(snapshotDir, entry.name), { force: true });
            }
        }
    } catch {
        // best effort
    }
}

/**
 * Save test results directly into `orchestrator/test-results/<source>.json`.
 * It updates existing tips for the same day without overwriting them.
 * It also exports a dump into `previous-day-results/<source>-<formatted-date>.json`.
 */
function saveTestResults(source, tips, opts = {}) {
    const dateIso = opts.date; // e.g. YYYY-MM-DD
    fs.mkdirSync(resultsRoot, { recursive: true });
    const targetFile = resultPath(source);
    
    let existingTips = [];
    if (fs.existsSync(targetFile)) {
        try {
            existingTips = JSON.parse(fs.readFileSync(targetFile, "utf8"));
            if (!Array.isArray(existingTips)) existingTips = [];
        } catch (err) {
            existingTips = [];
        }
    }

    // Filter existing tips to only keep those from the current day.
    // If the file contains yesterday's tips, we drop them here because they're
    // already safely saved in the previous day dump.
    if (dateIso) {
        existingTips = existingTips.filter(t => {
            if (!t.scrapedAt) return false;
            return t.scrapedAt.startsWith(dateIso);
        });
    }

    // Merge tips based on unique identifiers to update (not overwrite)
    const map = new Map();
    const getKey = (t) => `${t.homeTeam}|${t.awayTeam}|${t.selection}|${t.market}`;
    
    existingTips.forEach(t => map.set(getKey(t), t));
    tips.forEach(t => map.set(getKey(t), t));
    
    const mergedTips = Array.from(map.values());

    // Save current day's tips directly to test-results/freetips.json
    fs.writeFileSync(targetFile, JSON.stringify(mergedTips, null, 2), "utf8");

    // Export the dump to the previous day results dir (settlement layer)
    fs.mkdirSync(previousDayResultsRoot, { recursive: true });
    const formattedDate = getFormattedDate(dateIso);
    const exportFile = path.join(previousDayResultsRoot, `${source}-${formattedDate}.json`);
    fs.writeFileSync(exportFile, JSON.stringify(mergedTips, null, 2), "utf8");
}

function loadTestResults(source, opts = {}) {
    // Load from test-results/<source>.json directly
    const filePath = resultPath(source);
    
    if (!fs.existsSync(filePath)) {
        throw new Error(`Missing ${source} test results at ${filePath}. Run the orchestrator before running contract tests.`);
    }

    const tips = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!Array.isArray(tips)) throw new Error(`Saved ${source} test results must be an array.`);
    return tips;
}

module.exports = { saveTestResults, loadTestResults, clearDownloadedHtmlFiles };
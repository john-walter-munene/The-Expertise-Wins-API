const fs = require("fs");
const path = require("path");

const resultsRoot = path.resolve(__dirname, "test-results");
const htmlSnapshotDir = path.resolve(__dirname, "free-tips");

function resultPath(source, dateIso) {
    const dir = dateIso ? path.join(resultsRoot, dateIso) : resultsRoot;
    return path.join(dir, `${source}.json`);
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
 * Save test results into `orchestrator/test-results/<YYYY-MM-DD>/<source>.json` when
 * `dateIso` is provided, otherwise into `orchestrator/test-results/<source>.json`.
 */
function saveTestResults(source, tips, opts = {}) {
    const dateIso = opts.date;
    const targetDir = dateIso ? path.join(resultsRoot, dateIso) : resultsRoot;
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(resultPath(source, dateIso), JSON.stringify(tips, null, 2), "utf8");
    // Keep the HTML snapshot dir for debugging by default; caller may clean it.
}

function loadTestResults(source, opts = {}) {
    const dateIso = opts.date;
    const filePath = resultPath(source, dateIso);
    if (!fs.existsSync(filePath)) {
        // If a specific date wasn't requested, try to find the most recent
        // dated snapshot under `test-results/YYYY-MM-DD/` for convenience.
        if (!dateIso && fs.existsSync(resultsRoot)) {
            try {
                const entries = fs.readdirSync(resultsRoot, { withFileTypes: true });
                const dateDirs = entries.filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name)).map((d) => d.name);
                if (dateDirs.length > 0) {
                    // choose the latest date string
                    dateDirs.sort();
                    const latest = dateDirs[dateDirs.length - 1];
                    const candidate = resultPath(source, latest);
                    if (fs.existsSync(candidate)) return JSON.parse(fs.readFileSync(candidate, "utf8"));
                }
            } catch {
                // ignore and throw below
            }
        }
        throw new Error(`Missing ${source} test results at ${filePath}. Run the orchestrator before running contract tests.`);
    }

    const tips = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!Array.isArray(tips)) throw new Error(`Saved ${source} test results must be an array.`);
    return tips;
}

module.exports = { saveTestResults, loadTestResults };
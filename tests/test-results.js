const fs = require("fs");
const path = require("path");

const resultsDirectory = path.resolve(__dirname, "test-results");

function resultPath(source) {
    return path.join(resultsDirectory, `${source}.json`);
}

function clearDownloadedHtmlFiles() {
    const snapshotDir = path.resolve(__dirname, "freetips");
    const targetFiles = [
        path.resolve(__dirname, "freetips.html"),
        path.join(snapshotDir, "freetips.html"),
    ];

    for (const target of targetFiles) {
        try {
            if (fs.existsSync(target)) fs.rmSync(target, { force: true });
        } catch {
            // best effort: snapshot cleanup should never block saving results
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
        // best effort: snapshot cleanup should never block saving results
    }
}

function saveTestResults(source, tips) {
    fs.mkdirSync(resultsDirectory, { recursive: true });
    fs.writeFileSync(resultPath(source), JSON.stringify(tips, null, 2), "utf8");
    clearDownloadedHtmlFiles();
}

function loadTestResults(source) {
    const filePath = resultPath(source);
    if (!fs.existsSync(filePath)) {
        throw new Error(`Missing ${source} test results. Run its scraper test before the contract test.`);
    }

    const tips = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!Array.isArray(tips)) throw new Error(`Saved ${source} test results must be an array.`);
    return tips;
}

module.exports = { saveTestResults, loadTestResults };

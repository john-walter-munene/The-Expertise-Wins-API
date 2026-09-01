const fs = require("fs");
const path = require("path");

const resultsDirectory = path.resolve(__dirname, "test-results");

function resultPath(source) {
    return path.join(resultsDirectory, `${source}.json`);
}

function saveTestResults(source, tips) {
    fs.mkdirSync(resultsDirectory, { recursive: true });
    fs.writeFileSync(resultPath(source), JSON.stringify(tips, null, 2), "utf8");
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

const fs = require("fs");
const path = require("path");

function getFormattedDate(dateIso) {
    const d = dateIso ? new Date(dateIso) : new Date();
    const day = d.getDate();
    const suffix = ["th", "st", "nd", "rd"][day % 10 > 3 ? 0 : (day % 100 - day % 10 !== 10) * day % 10];
    const month = d.toLocaleString('en-GB', { month: 'short' });
    const year = d.getFullYear();
    return `${day}${suffix} ${month} ${year}`;
}

function determineOutcome(textLine) {
    if (textLine.includes("✅✅")) return "win";
    if (textLine.includes("❎❎")) return "lose";
    return null;
}

function resolveJsonPath(dateIso) {
    const jsonDir = path.resolve(__dirname, "previous-day-results");
    const formattedDate = getFormattedDate(dateIso);
    const dated = path.join(jsonDir, `freetips-${formattedDate}.json`);
    if (fs.existsSync(dated)) return dated;

    // Fall back to the most recent dump available so a bare `npm run settlement`
    // settles the latest scraped batch without needing --date.
    if (!fs.existsSync(jsonDir)) return dated;
    const candidates = fs.readdirSync(jsonDir)
        .filter((name) => /^freetips-.*\.json$/i.test(name))
        .map((name) => ({ name, time: fs.statSync(path.join(jsonDir, name)).mtimeMs }))
        .sort((a, b) => b.time - a.time);
    return candidates.length > 0 ? path.join(jsonDir, candidates[0].name) : dated;
}

function processSettlement(dateIso, txtFilePath) {
    const jsonPath = resolveJsonPath(dateIso);

    if (!fs.existsSync(jsonPath)) {
        console.error(`Error: JSON dump not found for date ${dateIso} at ${jsonPath}`);
        process.exit(1);
    }
    if (!fs.existsSync(txtFilePath)) {
        console.error(`Error: Text file not found at ${txtFilePath}`);
        process.exit(1);
    }

    const tips = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    const txtContent = fs.readFileSync(txtFilePath, "utf8");

    // Helper to find outcome in a block of text
    function checkTipOutcome(selection, blockText, defaultOutcome = null) {
        if (!blockText) return defaultOutcome;
        
        // Find line with the selection
        const lines = blockText.split("\n");
        // Look for the selection text in the line (case insensitive)
        const cleanSelection = selection.replace(/[()]/g, "").trim().toLowerCase();
        
        for (const line of lines) {
            if (line.toLowerCase().replace(/[()]/g, "").includes(cleanSelection)) {
                const outcome = determineOutcome(line);
                if (outcome) return outcome;
            }
        }
        
        return defaultOutcome;
    }

    let settledCount = 0;

    // Process each tip
    tips.forEach(tip => {
        const home = (tip.homeTeam || "").toLowerCase();
        const away = (tip.awayTeam || "").toLowerCase();
        
        // If it's a free tip (not featured), we know missing = loss.
        const combinedText = `${tip.competition || ""} ${tip.previewTitle || ""}`.toLowerCase();
        const isFeatured = Boolean(tip.isFeatured) || /bet of the day/.test(combinedText);
        const isFreeTip = !isFeatured;
        
        let blockText = null;
        if (home && away) {
            // Find the index of the fixture in the text
            const homeIndex = txtContent.toLowerCase().indexOf(home);
            if (homeIndex !== -1) {
                // Extract a chunk of text around it to search for the selection
                blockText = txtContent.substring(homeIndex, homeIndex + 1000); 
            }
        } else if (tip.selection) {
            // For tips without home/away (like outrights), search selection directly
            const selIndex = txtContent.toLowerCase().indexOf(tip.selection.toLowerCase());
            if (selIndex !== -1) {
                blockText = txtContent.substring(selIndex, selIndex + 500);
            }
        }

        const defaultOutcome = isFreeTip ? "lose" : null;

        if (!blockText && isFreeTip) {
            tip.outcome = "lose";
            tip.status = "settled";
            if (Array.isArray(tip.tips)) tip.tips.forEach(t => { t.outcome = "lose"; t.status = "settled"; });
            if (Array.isArray(tip.extraTips)) tip.extraTips.forEach(t => { t.outcome = "lose"; t.status = "settled"; });
            settledCount++;
        } else if (blockText) {
            // Main tip
            if (tip.selection) {
                const outcome = checkTipOutcome(tip.selection, blockText, defaultOutcome);
                if (outcome) {
                    tip.outcome = outcome;
                    tip.status = "settled";
                    settledCount++;
                }
            }

            // Extra tips / nested tips
            if (Array.isArray(tip.tips)) {
                tip.tips.forEach(t => {
                    const out = checkTipOutcome(t.selection, blockText, defaultOutcome);
                    if (out) {
                        t.outcome = out;
                        t.status = "settled"; // wait, the contract doesn't explicitly have status on nested, but we can set it
                    }
                });
            }
            if (Array.isArray(tip.extraTips)) {
                tip.extraTips.forEach(t => {
                    const out = checkTipOutcome(t.selection, blockText, defaultOutcome);
                    if (out) {
                        t.outcome = out;
                        t.status = "settled";
                    }
                });
            }
        }
    });

    // Save back to previous day results
    fs.writeFileSync(jsonPath, JSON.stringify(tips, null, 2), "utf8");
    console.log(`✅ Settled ${settledCount} tips in ${jsonPath}`);
    
    return tips;
}

module.exports = { processSettlement, resolveJsonPath, getFormattedDate };
const path = require("path");
const { processSettlement } = require("./settlement");
const { TipsConsumptionClient } = require("../services/tips.client");

// The settlement layer marks paid (VIP) winning tips with a fire emoji after the
// ticks so they read differently from the free picks. Losses (❎) never get
// heat. The tips client itself stays heat-free; this decoration lives only here.
function withHeat(card) {
    if (!card) return card;
    // Consume each whole run of ✅ ticks plus an optional trailing 🔥 so a
    // greedy match can never be split mid-run. Only add fire when absent.
    // The `u` flag is required because 🔥 is a surrogate pair.
    return card.replace(/(✅+)(🔥?)/gu, (_match, ticks, fire) => `${ticks}${fire || "🔥"}`);
}

function parseArgs(argv) {
    let dateArg = null;
    let txtArg = null;

    for (const arg of argv) {
        if (arg.startsWith("--date=")) dateArg = arg.split("=")[1];
        else if (arg === "--date" && argv[argv.indexOf(arg) + 1]) dateArg = argv[argv.indexOf(arg) + 1];
        else if (!arg.startsWith("--")) txtArg = arg;
    }

    // Default to the checked-in template so `npm run settlement` settles whatever
    // data has been pasted into settlement/settlement-template.txt.
    if (!txtArg) {
        txtArg = path.resolve(__dirname, "settlement-template.txt");
    }

    return { dateArg, txtArg };
}

async function run(argv = process.argv.slice(2)) {
    const { dateArg, txtArg } = parseArgs(argv);
    const tips = processSettlement(dateArg || new Date().toISOString().slice(0, 10), txtArg);

    const result = await new TipsConsumptionClient().loadFromData(tips);
    const freeTips = result.freeTips || [];
    const premiumTips = result.premiumTips || [];

    console.log("\n========================================");
    console.log("     SETTLEMENT OUTPUT");
    console.log("========================================\n");

    console.log("💰 MAXBET TIPS");
    console.log("----------------------------------------");
    result.maxbetVipCards.forEach((card, index) => {
        console.log(`\nCARD ${index + 1}\n`);
        console.log(withHeat(card));
        console.log("\n----------------------------------------");
    });

    console.log("\n💎 VIP TIPS");
    console.log("----------------------------------------");
    result.pikkBetterVipCards.forEach((card, index) => {
        console.log(`\nCARD ${index + 1}\n`);
        console.log(withHeat(card));
        console.log("\n----------------------------------------");
    });

    console.log("\n🆓 The Expertise Wins Free Tips 📣 \n");
    result.freeCards.forEach((card, index) => {
        console.log(card);
        if (index < result.freeCards.length - 1) console.log("");
    });

    console.log("\n========================================");
    console.log("             SUMMARY");
    console.log("==========================================");
    console.log(`Maxbet tips:      ${result.maxbetVipCards.length}`);
    console.log(`VIP tips:         ${result.pikkBetterVipCards.length}`);
    console.log(`Free tips:        ${result.freeCards.length}`);
    console.log("----------------------------------------");
    console.log(`Total tips:       ${freeTips.length + premiumTips.length}`);
    console.log("========================================\n");
}

if (require.main === module) {
    run();
}

module.exports = { withHeat, run, parseArgs };
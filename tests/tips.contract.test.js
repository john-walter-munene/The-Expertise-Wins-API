const { adminTips } = require("../services/index");
const { TIP_CONTRACT_FIELDS } = require("../normalizers/contract");

(async () => {
    console.log(" TIPS CONTRACT TEST ");

    const freeTips = await adminTips.getFreeTips();
    const premiumTips = await adminTips.getPremiumTips();

    const allTips = [...freeTips, ...premiumTips];

    console.log(`Free tips: ${freeTips.length}`);
    console.log(`Premium tips: ${premiumTips.length}`);

    // Basic service checks
    if (!Array.isArray(freeTips)) throw new Error("Free service must return an array");
    if (!Array.isArray(premiumTips)) throw new Error("Premium service must return an array");
    if (allTips.length === 0) throw new Error("No tips returned from services");

    console.log("\nSample:");
    console.table(allTips.slice(0, 5));
    console.log("\nChecking contract...\n");

    let invalidCount = 0;
    const sources = new Set();

    for (const tip of allTips) {
        sources.add(tip.source || "unknown");
        const missing = [];
        const extra = [];

        // 1. Every contract field must be present.
        for (const field of TIP_CONTRACT_FIELDS) {
            if (!(field in tip)) missing.push(field);
        }

        // 2. No extra fields beyond the contract (identical shape).
        for (const key of Object.keys(tip)) {
            if (!TIP_CONTRACT_FIELDS.includes(key)) extra.push(key);
        }

        // 3. Required core fields must have values.
        if (!tip.sport) missing.push("sport (value)");
        if (!tip.homeTeam) missing.push("homeTeam (value)");
        if (!tip.awayTeam) missing.push("awayTeam (value)");
        if (!tip.market && !tip.prediction) missing.push("market/prediction (value)");

        if (missing.length > 0 || extra.length > 0) {
            invalidCount++;
            console.log("⚠️ Invalid tip found");
            console.log("Source:", tip.source || "unknown");
            if (missing.length) console.log("Missing:", missing);
            if (extra.length) console.log("Extra fields:", extra);
            console.dir(tip, { depth: null });
            console.log("--------------------------------");
        }
    }

    console.log(`Sources checked: ${[...sources].join(", ")}`);

    if (invalidCount > 0) {
        console.log(`\n⚠️ Found ${invalidCount} tips not conforming to the contract`);
        process.exitCode = 1;
    } else {
        console.log(`\n✅ All ${allTips.length} tips satisfy the identical contract (${TIP_CONTRACT_FIELDS.length} fields)`);
    }
})();
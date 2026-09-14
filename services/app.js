const { TipsService } = require("./services");

(async () => {
    const payload = await TipsService.loadSnapshot("freetips");
    const freeTips = payload.freeTips || [];
    const premiumTips = payload.premiumTips || [];
    const result = payload;

    console.log("\n========================================");
    console.log("     SERVICE BOX OUTPUT");
    console.log("========================================\n");

    console.log("💎 MAXBET TIPS");
    console.log("----------------------------------------");
    result.maxbetVipCards.forEach((card, index) => {
        console.log(`\nCARD ${index + 1}\n`);
        console.log(card);
        console.log("\n----------------------------------------");
    });

    console.log("\n💎 PREMIUM TIPS");
    console.log("----------------------------------------");
    result.premiumCards.forEach((card, index) => {
        console.log(`\nCARD ${index + 1}\n`);
        console.log(card);
        console.log("\n----------------------------------------");
    });

    console.log("\n🆓 FREE TIPS");
    console.log("----------------------------------------");
    result.freeCards.forEach((card, index) => {
        console.log(`\nCARD ${index + 1}\n`);
        console.log(card);
        console.log("\n----------------------------------------");
    });

    console.log("\n========================================");
    console.log("             SUMMARY");
    console.log("========================================");
    console.log(`Maxbet tips:      ${result.maxbetVipCards.length}`);
    console.log(`Premium tips:     ${result.premiumCards.length}`);
    console.log(`Free tips:        ${result.freeCards.length}`);
    console.log("----------------------------------------");
    console.log(`Total tips:       ${freeTips.length + premiumTips.length}`);
    console.log("========================================\n");
})();
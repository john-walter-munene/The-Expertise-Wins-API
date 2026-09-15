const { TipsService } = require("./services");

(async () => {
    const payload = await TipsService.loadSnapshot("freetips");
    const freeTips = payload.freeTips || [];
    const premiumTips = payload.premiumTips || [];
    const result = payload;

    console.log("\n========================================");
    console.log("     SERVICE BOX OUTPUT");
    console.log("========================================\n");

    console.log("💰 MAXBET TIPS");
    console.log("----------------------------------------");
    result.maxbetVipCards.forEach((card, index) => {
        console.log(`\nCARD ${index + 1}\n`);
        console.log(card);
        console.log("\n----------------------------------------");
    });

    console.log("\n💎 VIP TIPS");
    console.log("----------------------------------------");
    result.pikkBetterVipCards.forEach((card, index) => {
        console.log(`\nCARD ${index + 1}\n`);
        console.log(card);
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
})();
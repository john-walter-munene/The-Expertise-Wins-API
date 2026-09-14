const { TipsConsumptionClient } = require("./tips.client");

class TipsService {
    static async loadSnapshot(source = "freetips") {
        const client = new TipsConsumptionClient();
        return client.loadFromJson(source);
    }

    static async getFreeTips() {
        try {
            const payload = await TipsService.loadSnapshot("freetips");
            return payload.freeTips || [];
        } catch (error) {
            console.error("Free tips source failed:", error.message);
            return [];
        }
    }

    static async getPremiumTips() {
        try {
            const payload = await TipsService.loadSnapshot("freetips");
            return payload.premiumTips || [];
        } catch (error) {
            console.error("Premium source failed:", error.message);
            return [];
        }
    }
}

class FreeTipsService {
    async getTips() {
        return TipsService.getFreeTips();
    }
}

class PremiumTipsService {
    async getTips() {
        return TipsService.getPremiumTips();
    }
}

module.exports = { TipsService, FreeTipsService, PremiumTipsService, };
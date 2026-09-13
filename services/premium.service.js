const { loadTestResults } = require("../tests/test-results");

class PremiumTipsService {
    async getTips() {
        try {
            return loadTestResults("freetips");
        } catch (error) {
            console.error("Premium source failed:", error.message);
            return [];
        }
    }
}

module.exports = PremiumTipsService;
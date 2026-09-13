const { loadTestResults } = require("../tests/test-results");

class FreeTipsService {
    async getTips() {
        try {
            return loadTestResults("freetips");
        } catch (error) {
            console.error("Free tips source failed:", error.message);
            return [];
        }
    }
}

module.exports = FreeTipsService;
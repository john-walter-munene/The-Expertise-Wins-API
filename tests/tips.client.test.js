const assert = require("assert");
const { TipsConsumptionClient } = require("../services/tips.client");

const client = new TipsConsumptionClient();

const featuredFootball = {
  source: "freetips",
  sport: "Football",
  competition: "Bet of the Day",
  homeTeam: "Estoril",
  awayTeam: "FC Arouca",
  kickoff: "23:15",
  market: "Over 4.5 Goals",
  selection: "Over 4.5 Goals",
  odds: 1.85,
  stakeUnits: 4,
  previewTitle: "Bet of the Day",
  verdict: "Estoril have seen over 4.5 goals in 5 of their last 6 matches against Arouca.",
  isFeatured: true,
  tips: [
    { bookmaker: "Stake.com", selection: "BTTS Yes", market: "Both Teams to Score", odds: 1.67, units: 4 },
    { bookmaker: "Stake.com", selection: "Over 4.5 Goals", market: "Goals", odds: 1.85, units: 4 }
  ]
};

const listedFootball = {
  source: "freetips",
  sport: "Football",
  competition: "Primeira Liga",
  homeTeam: "Estoril",
  awayTeam: "Porto",
  kickoff: "20:00",
  market: "BTTS",
  selection: "BTTS Yes",
  odds: 1.85,
  stakeUnits: 3,
  previewTitle: "Estoril vs Porto",
  verdict: "This should be open and competitive.",
  tips: [
    { bookmaker: "Stake.com", selection: "BTTS Yes & Over 3.5", market: "Double Chance", odds: 3.2, units: 1 },
    { bookmaker: "Stake.com", selection: "BTTS Yes & Over 2.5", market: "Goals", odds: 2.25, units: 2 },
    { bookmaker: "Stake.com", selection: "BTTS Yes", market: "Both Teams to Score", odds: 1.85, units: 3 }
  ]
};

const featuredTennis = {
  source: "freetips",
  sport: "Tennis",
  competition: "Tennis Bet of the Day",
  homeTeam: "Arthur Gea",
  awayTeam: "Botic Van De Zandschulp",
  kickoff: "13h 33m",
  market: "Winner",
  selection: "Van de Zandschulp Win",
  odds: 1.65,
  stakeUnits: 4,
  previewTitle: "Tennis Bet of the Day",
  verdict: "Van de Zandschulp should be too good for Gea.",
  isFeatured: true,
  tips: [
    { bookmaker: "Stake.com", selection: "Van de Zandschulp Win", market: "Winner", odds: 1.65, units: 4 }
  ]
};

const basketballTip = {
  source: "freetips",
  sport: "Basketball",
  competition: "Basketball",
  homeTeam: "Japan",
  awayTeam: "South Korea",
  kickoff: "2h 3m",
  market: "Total Points",
  selection: "Over 157.5",
  odds: 1.9,
  stakeUnits: 2,
  previewTitle: "Japan vs South Korea",
  verdict: "Both sides are playing at a high tempo.",
  tips: [
    { bookmaker: "Stake.com", selection: "Over 157.5", market: "Total Points", odds: 1.9, units: 2 }
  ]
};

const result = client.consume({ free: [featuredFootball, listedFootball, featuredTennis, basketballTip], premium: [] });

assert.ok(Array.isArray(result.maxbetVipCards), "MaxBet VIP cards should exist");
assert.ok(Array.isArray(result.expertiseWinsFreeCards), "Expertise Wins free cards should exist");
assert.ok(Array.isArray(result.pikkBetterVipCards), "PikkBetter VIP cards should exist");
assert.strictEqual(result.maxbetVipCards.length, 2, "Featured tips should be routed to MaxBet VIP");
assert.strictEqual(result.expertiseWinsFreeCards.length, 1, "Football listings should be sent to Expertise Wins");
assert.strictEqual(result.pikkBetterVipCards.length, 1, "Other sports should be sent to PikkBetter VIP");
assert.strictEqual(result.freeCards.length, 1, "Only plain football listings should be in the free bucket");
assert.strictEqual(result.premiumCards.length, 3, "Featured and non-football tips should be in the premium bucket");

const maxbetText = result.maxbetVipCards[0];
assert.ok(String(maxbetText).includes("Pikk Maxbet VIP"), "MaxBet format should include the VIP channel header");
assert.ok(String(maxbetText).includes("Bet of the day"), "Featured card should include the featured format header");

const freeText = result.expertiseWinsFreeCards[0];
assert.ok(String(freeText).includes("The Expertise Wins Free Tips"), "Free tips should include the main channel header");
assert.ok(String(freeText).includes("Estoril vs Porto"), "Football listing should keep the match fixture header");

const freeBucketText = result.freeCards[0];
assert.ok(String(freeBucketText).includes("Estoril vs Porto"), "Free bucket should contain the plain football fixture");
assert.ok(!String(freeBucketText).includes("This should be open and competitive"), "Free bucket should stay plain and not include premium detail");

const vipText = result.pikkBetterVipCards[0];
assert.ok(String(vipText).includes("PikkBetter VIP"), "Other sports should use the PikkBetter VIP channel");
assert.ok(String(vipText).includes("Japan vs South Korea"), "Other-sport matches should remain in the card output");

const premiumBucketText = result.premiumCards[0];
assert.ok(String(premiumBucketText).includes("Bet of the day") || String(premiumBucketText).includes("Tennis Bet of the Day") || String(premiumBucketText).includes("Japan vs South Korea"), "Premium bucket should keep the detailed cards");

console.log("tips.client grouping test passed");

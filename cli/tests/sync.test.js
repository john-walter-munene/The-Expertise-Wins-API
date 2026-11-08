/**
 * Guards for the scan → dump → database path.
 *
 * These cover the failure modes that made scraped tips go missing from the UI
 * while still counting as present in the JSON dumps:
 *
 *   1. A tip in the database with no PUBLISHED product row is invisible to
 *      every API list, even though the row exists.
 *   2. A dump was filed one day early because `scrapedAt` was stamped in UTC
 *      while the UI buckets by the Nairobi business day.
 *   3. A sync stamped `publishedAt` with the wall clock, which moved old days
 *      forward on every re-run.
 *   4. Merging the working results could silently drop tips.
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

// Route dump writes to a throwaway directory so a test run cannot touch the real
// dumps or the working file used by later assertions in this script. Read at
// require time, so this must be set before test-results is loaded.
const TEST_DUMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tew-dump-"));
process.env.CLI_DUMP_DIR = TEST_DUMP_DIR;

const { businessDayKey, parseDumpDay, scrapeStampForDay } = require("../lib/dump-day");
const { getFormattedDate } = require("../orchestrator/test-results");
const seed = require("../../backend/scripts/seed");

let passed = 0;
const test = (name, fn) => {
  try {
    fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (error) {
    console.error(`  FAIL ${name}`);
    throw error;
  }
};

console.log("\ndump-day helpers");

// 05:35 Nairobi is still the previous day in UTC. The scrape must be filed
// under the day the operator asked for, not the UTC date.
test("scrapeStampForDay files an early-morning scrape under the dump day", () => {
  const now = new Date("2026-10-23T02:35:46.871Z"); // 05:35 Nairobi
  const stamp = scrapeStampForDay("2026-10-23", now);
  assert.strictEqual(businessDayKey(stamp), "2026-10-23");
  // The real scrape time is preserved when it already falls inside the day.
  assert.strictEqual(stamp.toISOString(), now.toISOString());
});

test("scrapeStampForDay moves a wrong-day scrape onto the dump day", () => {
  // A UTC "today" of the 23rd while the operator asked for the 24th.
  const now = new Date("2026-10-23T02:35:46.871Z");
  const stamp = scrapeStampForDay("2026-10-24", now);
  assert.strictEqual(businessDayKey(stamp), "2026-10-24");
});

test("businessDayKey uses the Nairobi day, not UTC", () => {
  assert.strictEqual(businessDayKey("2026-10-22T22:30:00.000Z"), "2026-10-23");
  assert.strictEqual(businessDayKey("2026-10-23T02:35:46.871Z"), "2026-10-23");
  assert.strictEqual(businessDayKey("2026-10-23T20:59:59.999Z"), "2026-10-23");
  assert.strictEqual(businessDayKey("2026-10-23T21:00:00.000Z"), "2026-10-24");
});

test("parseDumpDay handles September, whose short name broke the old parser", () => {
  assert.strictEqual(parseDumpDay("freetips-25th Sept 2026.json"), "2026-09-25");
  assert.strictEqual(parseDumpDay("freetips-30th Sept 2026.json"), "2026-09-30");
  assert.strictEqual(parseDumpDay("freetips-1st Oct 2026.json"), "2026-10-01");
  assert.strictEqual(parseDumpDay("freetips-3rd Nov 2026.json"), "2026-11-03");
  assert.strictEqual(parseDumpDay("freetips-31st Feb 2026.json"), null); // impossible date
  assert.strictEqual(parseDumpDay("not-a-dump.json"), null);
});

test("settlement.parseDumpDate now resolves September dumps", () => {
  const { parseDumpDate } = require("../settlement/settlement");
  assert.strictEqual(parseDumpDate("freetips-25th Sept 2026.json"), "2026-09-25");
});

console.log("\nseed day alignment");

test("alignScrapedAt keeps a timestamp that already belongs to the dump day", () => {
  const iso = "2026-10-23T02:35:46.871Z"; // 05:35 Nairobi on the 23rd
  const out = seed.alignScrapedAt("freetips-23rd Oct 2026.json", "2026-10-23", [{}], iso);
  assert.strictEqual(out.toISOString(), iso);
});

test("alignScrapedAt re-anchors a timestamp filed on the wrong day", () => {
  // The real 14th dump carried the 13th's scrapedAt, so its tips were served
  // under the 13th and the 14th looked empty.
  const out = seed.alignScrapedAt("freetips-14th Oct 2026.json", "2026-10-14", [{}], "2026-10-13T05:00:00.000Z");
  assert.strictEqual(businessDayKey(out), "2026-10-14");
});

test("alignScrapedAt clamps an early-UTC scrape that would land on the previous day", () => {
  // 21:19 UTC is 00:19 Nairobi the NEXT day, so keeping the hour would misfile it.
  const out = seed.alignScrapedAt("freetips-25th Sept 2026.json", "2026-09-25", [{}], "2026-09-25T21:19:29.699Z");
  assert.strictEqual(businessDayKey(out), "2026-09-25");
});

test("getDumpDay prefers the file name over an off-by-one scrapedAt", () => {
  assert.strictEqual(
    seed.getDumpDay("freetips-14th Oct 2026.json", [{ scrapedAt: "2026-10-13T05:00:00.000Z" }]),
    "2026-10-14",
  );
});

console.log("\ndump counts");

test("every real dump keeps all of its tips, and every day is unique", () => {
  const dir = path.resolve(__dirname, "..", "settlement", "previous-day-results");
  if (!fs.existsSync(dir)) return; // fixtures only; nothing to check in a bare checkout

  const files = fs.readdirSync(dir).filter((file) => /^freetips-.*\.json$/i.test(file));
  const seenDays = new Map();

  for (const file of files) {
    const tips = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    const dayKey = seed.getDumpDay(file, tips);

    assert.ok(dayKey, `${file}: could not resolve a dump day`);
    assert.ok(Array.isArray(tips), `${file}: expected a JSON array`);

    // A dump must resolve to the day in its own name, or the archive will
    // serve its tips under a day the operator never scraped.
    const named = parseDumpDay(file);
    if (named) assert.strictEqual(dayKey, named, `${file}: resolved to ${dayKey}, not its file-name day`);

    assert.ok(!seenDays.has(dayKey), `${file} and ${seenDays.get(dayKey)} both resolve to ${dayKey}`);
    seenDays.set(dayKey, file);

    // Every record must survive validation, so a bad record cannot abort a sync
    // after some rows were already written.
    tips.forEach((tip, index) => {
      assert.doesNotThrow(() => seed.toTipData(tip, index, file), `${file}[${index}] is invalid`);
      assert.ok(
        seed.getProductSlug(tip),
        `${file}[${index}] has no product tier, so it would have no publication and stay invisible`,
      );
    });
  }
});

test("every tier a tip can belong to is a real product slug", () => {
  const slugs = new Set(seed.defaultProducts.map((product) => product.slug));
  const samples = [
    { sport: "Football", competition: "Bet of the Day" },
    { sport: "Football", competition: "Premier League" },
    { sport: "Tennis", competition: "Ningbo Open" },
    { sport: "Esports", competition: "LoL Worlds 2026" },
  ];
  for (const tip of samples) {
    assert.ok(slugs.has(seed.getProductSlug(tip)), `${JSON.stringify(tip)} resolved outside the products`);
  }
});

console.log("\nsaveTestResults");

test("saveTestResults stamps the given instant and reports the count", () => {
  const { saveTestResults } = require("../orchestrator/test-results");
  const stamp = new Date("1999-03-04T02:00:00.000Z");
  const dumpPath = path.join(TEST_DUMP_DIR, "freetips-4th Mar 1999.json");

  const tips = [
    { homeTeam: "A", awayTeam: "B", selection: "Win", market: "1X2", scrapedAt: "1999-03-03T21:00:00.000Z" },
    { homeTeam: "C", awayTeam: "D", selection: "Win", market: "1X2", scrapedAt: "1999-03-03T21:00:00.000Z" },
  ];

  const result = saveTestResults("freetips", tips, { date: "1999-03-04", scrapedAt: stamp });
  assert.strictEqual(result.count, 2, "both tips must be reported");
  assert.strictEqual(result.written, true, "a missing dump must be written");

  const written = JSON.parse(fs.readFileSync(dumpPath, "utf8"));
  assert.strictEqual(written.length, 2);
  for (const tip of written) {
    assert.strictEqual(tip.scrapedAt, stamp.toISOString(), "the caller's instant must win over the tip's own");
    assert.strictEqual(businessDayKey(tip.scrapedAt), "1999-03-04", "the tip must be filed under the dump day");
  }
});

test("saveTestResults refuses to drop tips during the merge", () => {
  const { saveTestResults } = require("../orchestrator/test-results");

  // Same fixture, two different markets: the identity key includes the market,
  // so both must survive. If the key ever stops doing that, the merge would
  // silently return one tip and this assertion catches it.
  const tips = [
    { homeTeam: "A", awayTeam: "B", selection: "Over", market: "Total Goals", scrapedAt: "1999-03-05T10:00:00.000Z" },
    { homeTeam: "A", awayTeam: "B", selection: "Yes", market: "BTTS", scrapedAt: "1999-03-05T10:00:00.000Z" },
  ];
  const result = saveTestResults("freetips", tips, { date: "1999-03-05" });
  assert.ok(result.count >= 2, `merge returned ${result.count} tips; both must survive`);
});

test("saveTestResults keeps earlier dump tips when a later scrape finds new games", () => {
  const { saveTestResults } = require("../orchestrator/test-results");
  const date = "1999-03-06";
  const dumpPath = path.join(TEST_DUMP_DIR, "freetips-6th Mar 1999.json");
  const workingPath = path.join(TEST_DUMP_DIR, "working", "freetips.json");

  saveTestResults("freetips", [
    { homeTeam: "A", awayTeam: "B", selection: "Win", market: "1X2" },
    { homeTeam: "C", awayTeam: "D", selection: "Over", market: "Total Goals" },
  ], { date });

  // The dated dump must be sufficient to continue accumulating even if the
  // replaceable working snapshot is lost between scrape runs.
  fs.rmSync(workingPath, { force: true });

  const result = saveTestResults("freetips", [
    { homeTeam: "E", awayTeam: "F", selection: "Win", market: "1X2" },
  ], { date });
  const dumpedTips = JSON.parse(fs.readFileSync(dumpPath, "utf8"));

  assert.strictEqual(result.dumpCount, 3, "the reported count must include the earlier dump records");
  assert.deepStrictEqual(
    dumpedTips.map(({ homeTeam, awayTeam }) => `${homeTeam} vs ${awayTeam}`).sort(),
    ["A vs B", "C vs D", "E vs F"],
    "a shorter later scrape must append new games without removing earlier ones",
  );
});

  // A dump that lists one tip twice would collapse onto one row, so the sync
  // must refuse it before touching the database.
  test("sync refuses a dump that carries the same tip twice", () => {
    const { findDuplicateTips } = require("../sync");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tew-dupes-"));
    const file = path.join(dir, "freetips-6th Mar 1999.json");

    try {
      fs.writeFileSync(file, JSON.stringify([
        { homeTeam: "A", awayTeam: "B", selection: "Win", market: "1X2" },
        { homeTeam: "A", awayTeam: "B", selection: "Win", market: "1X2" },
        { homeTeam: "A", awayTeam: "B", selection: "Win", market: "BTTS" },
      ]), "utf8");

      const duplicates = findDuplicateTips(dir);
      assert.strictEqual(duplicates.length, 1, "only the true duplicate may be reported");
      assert.strictEqual(duplicates[0].count, 2);
      assert.match(duplicates[0].key, /A\|B\|Win\|1X2/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the real dumps carry no duplicate tips", () => {
    const { findDuplicateTips } = require("../sync");
    const dir = path.resolve(__dirname, "..", "settlement", "previous-day-results");
    assert.deepStrictEqual(findDuplicateTips(dir), [], "a real dump lists one tip once");
  });

  // The database is made to match the dumps, not merely updated by them. The
  // fake client answers the one query inspectDumpDays makes, so this exercises
  // the real classification logic without a database.
  const fakePrisma = (rows) => {
    return { tip: { findMany: async () => rows }};
  };
  const storedTip = (overrides) => {
    const base = {
      id: "row", homeTeam: "A", awayTeam: "B", market: "1X2", selection: "Win",
      sport: "Football", competition: null, kickoff: null, predictedScore: null,
      odds: 1.9, stakeUnits: 2, confidenceIndex: null, tips: null, extraTips: null, analytics: null,
      status: "PUBLISHED", outcome: "PENDING", createdById: null, publishedById: null,
      publications: [{ status: "PUBLISHED", productId: "p-free" }],
    };
    return Object.assign(base, overrides);
  };

  test("reconcile removes an older copy of a tip the dump now serves under a new id", () => {
    const record = {
      id: "new-id", dayKey: "2026-10-05",
      data: { homeTeam: "A", awayTeam: "B", market: "1X2", selection: "Win", sport: "Football", odds: 1.9 },
    };
    const rows = [
      storedTip({ id: "new-id", scrapedAt: new Date("2026-10-05T09:00:00.000Z") }),
      storedTip({ id: "old-id", scrapedAt: new Date("2026-10-05T09:00:00.000Z") }),
    ];

    return seed.inspectDumpDays(fakePrisma(rows), [record]).then((result) => {
      assert.deepStrictEqual(result.removedIds, ["old-id"], "the stale copy must go, the dumped one must stay");
    });
  });

  test("reconcile keeps settled rows, authored rows and a different bet", () => {
    const record = {
      id: "new-id", dayKey: "2026-10-05",
      data: { homeTeam: "A", awayTeam: "B", market: "1X2", selection: "Win", sport: "Football", odds: 1.9 },
    };
    const rows = [
      storedTip({ id: "old-settled", outcome: "WON", scrapedAt: new Date("2026-10-05T09:00:00.000Z") }),
      storedTip({ id: "old-manual", createdById: "admin", scrapedAt: new Date("2026-10-05T09:00:00.000Z") }),
      storedTip({ id: "old-different-odds", odds: 3.4, scrapedAt: new Date("2026-10-05T09:00:00.000Z") }),
    ];

    return seed.inspectDumpDays(fakePrisma(rows), [record]).then((result) => {
      assert.deepStrictEqual(result.removedIds, [], "settled, authored and different bets must all stay");
    });
  });

  test("reconcile re-dates a dumped row filed on the wrong day and flags a hidden one", () => {
    const record = {
      id: "row", dayKey: "2026-10-06",
      data: { homeTeam: "A", awayTeam: "B", market: "1X2", selection: "Win", sport: "Football", odds: 1.9 },
    };
    // The row's stamp is a day early, which is how it vanished from the 6th
    // (it was no longer inside the 6th's business-day window).
    const rows = [storedTip({ id: "row", scrapedAt: new Date("2026-10-05T15:00:00.000Z"), publications: [] })];

    return seed.inspectDumpDays(fakePrisma(rows), [record]).then((result) => {
      assert.strictEqual(result.repairs.length, 1, "the row must be put back on its dump day");
      assert.strictEqual(result.repairs[0].dayKey, "2026-10-06");
      assert.strictEqual(result.hidden.length, 1, "a row with no publication is invisible and must be named");
      assert.strictEqual(businessDayKey(seed.publishStampForDay("2026-10-06", new Date("2026-10-05T09:00:00.000Z"))), "2026-10-06");
    });
  });

  // A scraped row carries no author, so both stamp repairs must apply: first
  // when the row is missing scrapedAt, then when it has one.
  test("reconcile re-dates a dumped row that has no scrapedAt at all", () => {
    const record = {
      id: "row", dayKey: "2026-10-07",
      data: { homeTeam: "A", awayTeam: "B", market: "1X2", selection: "Win", sport: "Football", odds: 1.9 },
    };
    const rows = [storedTip({ id: "row", scrapedAt: null, publications: [] })];

    return seed.inspectDumpDays(fakePrisma(rows), [record]).then((result) => {
      assert.strictEqual(result.repairs.length, 1, "an undated row must be put on its dump day");
      assert.strictEqual(result.repairs[0].dayKey, "2026-10-07");
      assert.strictEqual(result.hidden.length, 1);
    });
  });

console.log("\nsync.js guards");

// This is the bug that made yesterday's scraped tips look missing: the tip row
// existed, but it had no publication, so every API list filtered it out. The
// seed must publish every tip it writes, or fail instead of leaving a gap.
test("every seeded tip resolves to exactly one product publication", () => {
  const { records } = seed.loadSeedRecords();
  assert.ok(records.length > 0, "expected at least one dump record");

  const slugs = new Set(seed.defaultProducts.map((product) => product.slug));
  const perTip = new Map();

  for (const { id, data } of records) {
    const slug = seed.getProductSlug(data);
    assert.ok(slugs.has(slug), `${id} resolved to unknown product "${slug}"`);
    perTip.set(id, (perTip.get(id) || 0) + 1);
  }

  // One tier per tip: the seed retires stale publications using this same rule.
  for (const [id, count] of perTip) assert.strictEqual(count, 1, `${id} resolved to ${count} tiers`);
});

test("sync refuses dumps dated after today", () => {
  const { findMissingDate } = require("../sync");
  const dir = path.resolve(__dirname, "..", "settlement", "previous-day-results");
  const futureFile = path.join(dir, "freetips-1st Jan 2999.json");
  fs.writeFileSync(futureFile, "[]", "utf8");
  try {
    const problem = findMissingDate("local");
    assert.ok(problem, "a future-dated dump must be rejected");
    assert.match(problem, /dated after today/);
  } finally {
    fs.rmSync(futureFile, { force: true });
  }
  // A re-scrape of one tip leaves exactly one copy of it in the dump, and the
  // copy is updated rather than appended, whether the site reorders its card.
  test("a re-scrape updates a tip in place instead of duplicating it", () => {
    const { saveTestResults } = require("../orchestrator/test-results");
    const date = "1999-04-01";
    const dumpPath = path.join(TEST_DUMP_DIR, `freetips-${getFormattedDate(date)}.json`);

    saveTestResults("freetips", [
      { homeTeam: "Arsenal", awayTeam: "Chelsea", selection: "Arsenal Win", market: "1X2", odds: 1.8 },
      { homeTeam: "Spurs", awayTeam: "Everton", selection: "Spurs Win", market: "1X2", odds: 2.1 },
    ], { date });

    // The site reorders the card and the odds moved. One tip is missing from
    // this scrape: it must still be there afterwards.
    const result = saveTestResults("freetips", [
      { homeTeam: "Spurs", awayTeam: "Everton", selection: "Spurs Win", market: "1X2", odds: 2.3 },
      { homeTeam: "Arsenal", awayTeam: "Chelsea", selection: "Arsenal Win", market: "1X2", odds: 1.72 },
    ], { date });

    const dump = JSON.parse(fs.readFileSync(dumpPath, "utf8"));
    assert.strictEqual(dump.length, 2, "the missing tip must survive and no tip may be duplicated");
    assert.strictEqual(result.dumpCount, 2);
    assert.strictEqual(dump.find((t) => t.homeTeam === "Arsenal").odds, 1.72, "a re-scrape must refresh the odds");
  });

  // The site pushes a game off the list after it is settled. A later scrape of
  // the same day returns only the games still listed; the dump must keep the
  // pushed game and its result.
  test("a tip pushed off the site is kept in the dump, with its settlement", () => {
    const { saveTestResults } = require("../orchestrator/test-results");
    const date = "1999-04-02";
    const dumpPath = path.join(TEST_DUMP_DIR, `freetips-${getFormattedDate(date)}.json`);

    saveTestResults("freetips", [
      { homeTeam: "Morning", awayTeam: "Game", selection: "Home Win", market: "1X2", odds: 2.0, status: "pending", outcome: null },
    ], { date });

    const dump = JSON.parse(fs.readFileSync(dumpPath, "utf8"));
    dump[0].status = "settled";
    dump[0].outcome = "win";
    fs.writeFileSync(dumpPath, JSON.stringify(dump, null, 2), "utf8");

    // The evening scrape no longer lists the settled game at all.
    saveTestResults("freetips", [
      { homeTeam: "Evening", awayTeam: "Game", selection: "Away Win", market: "1X2", odds: 3.0 },
    ], { date });

    const after = JSON.parse(fs.readFileSync(dumpPath, "utf8"));
    const kept = after.find((t) => t.homeTeam === "Morning");
    assert.ok(kept, "the game the site pushed off the list must stay in the dump");
    assert.strictEqual(kept.outcome, "win", "its settlement must be kept");
    assert.ok(after.some((t) => t.homeTeam === "Evening"), "the evening scrape must be added");
  });

  // Seeing a settled tip again at the source must not unsettle it, and must not
  // wipe the fields the site no longer prints (preview, verdict, nested tips).
  test("a re-scrape never clears a settlement or the detail the site dropped", () => {
    const { saveTestResults } = require("../orchestrator/test-results");
    const date = "1999-04-03";
    const dumpPath = path.join(TEST_DUMP_DIR, `freetips-${getFormattedDate(date)}.json`);

    saveTestResults("freetips", [
      {
        homeTeam: "Bayern", awayTeam: "Dortmund", selection: "Over 2.5", market: "Total Goals",
        odds: 1.9, verdict: "Goals expected.", previewTitle: "Der Klassiker",
        tips: [{ selection: "Over 1.5", market: "Total Goals", odds: 1.3 }],
        status: "pending", outcome: null,
      },
    ], { date });

    const dump = JSON.parse(fs.readFileSync(dumpPath, "utf8"));
    dump[0].status = "settled";
    dump[0].outcome = "lose";
    fs.writeFileSync(dumpPath, JSON.stringify(dump, null, 2), "utf8");

    // The card now renders without its verdict, title or nested tips.
    saveTestResults("freetips", [
      { homeTeam: "Bayern", awayTeam: "Dortmund", selection: "Over 2.5", market: "Total Goals", odds: 1.85, verdict: null, tips: [] },
    ], { date });

    const tip = JSON.parse(fs.readFileSync(dumpPath, "utf8"))[0];
    assert.strictEqual(tip.outcome, "lose", "a re-scrape must not clear a settled outcome");
    assert.strictEqual(tip.status, "settled", "a re-scrape must not reopen a settled tip");
    assert.strictEqual(tip.verdict, "Goals expected.", "a dropped verdict must be kept");
    assert.strictEqual(tip.previewTitle, "Der Klassiker", "a dropped title must be kept");
    assert.strictEqual(tip.tips.length, 1, "dropped nested tips must be kept");
    assert.strictEqual(tip.odds, 1.85, "the fresh odds must still win");
  });

  // The id must follow the tip, not its position: the same tip in a reordered
  // dump keeps its row, and two tips never share one.
  test("seed ids follow the tip, not its position in the dump", () => {
    const day = "freetips-3rd Apr 2026.json";
    const first = { source: "freetips", sport: "Football", market: "1X2", selection: "Home Win", homeTeam: "A", awayTeam: "B" };
    const second = { ...first, homeTeam: "C", awayTeam: "D" };

    assert.strictEqual(
      seed.getTipId(day, 0, first),
      seed.getTipId(day, 7, first),
      "a reorder must not move a tip to a new row",
    );
    assert.notStrictEqual(seed.getTipId(day, 0, first), seed.getTipId(day, 1, second));
    assert.notStrictEqual(
      seed.getTipId(day, 0, first),
      seed.getTipId(day, 0, { ...first, selection: "Away Win" }),
      "two bets on one fixture are two tips",
    );
  });

  fs.rmSync(TEST_DUMP_DIR, { recursive: true, force: true });
});

console.log(`\n${passed} test(s) passed.`);

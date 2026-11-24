const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createTipSchema,
  updateTipSchema,
  updateTipsBulkSchema,
  settleTipSchema,
  settleTipsBulkSchema,
  tipIdsBodySchema,
  updateUserSchema,
  createAccessTokenSchema,
  createAccessTokensBulkSchema,
  updateAccessTokenSchema,
  extendAccessTokenSchema,
  createProductSchema,
  adminTipListQuerySchema,
  adminUserListQuerySchema,
  adminAccessTokenListQuerySchema,
  idParamsSchema,
} = require("../schemas/admin.schema");
const {
  redeemTokenSchema,
  verifyTokenSchema,
  renewSubscriptionSchema,
} = require("../schemas/subscription.schema");

const {
  archiveQuerySchema,
  publicTipListQuerySchema,
} = require("../schemas/admin.schema");

const CID = "c1234567890abcdefghijklmn";

// --- Strictness: mass assignment -----------------------------------------

test("strict schemas reject keys that are not allowlisted", () => {
  const cases = [
    [updateUserSchema, { role: "ADMIN", visitorId: "abc" }],
    [updateTipSchema, { selection: "Home", createdById: CID }],
    [adminTipListQuerySchema, { page: "1", include: "password" }],
    [adminUserListQuerySchema, { role: "ADMIN", select: "password" }],
  ];

  for (const [schema, payload] of cases) {
    const { success, error } = schema.safeParse(payload);
    assert.equal(success, false, `${schema.description ?? "schema"} should reject ${JSON.stringify(payload)}`);
    assert.ok(error.issues.some((issue) => issue.code === "unrecognized_keys"));
  }
});

test("update schemas require at least one field", () => {
  assert.equal(updateTipSchema.safeParse({}).success, false);
  assert.equal(updateUserSchema.safeParse({}).success, false);
  assert.equal(updateAccessTokenSchema.safeParse({}).success, false);
});

// --- Item 4: bounded bulk payloads ---------------------------------------

test("bulk id arrays are capped at 100 entries, deduped, and format checked", () => {
  const hundred = Array.from({ length: 100 }, (_, index) => `c${String(index).padStart(10, "0")}`);
  assert.equal(tipIdsBodySchema.safeParse({ ids: hundred }).success, true);

  const hundredAndOne = [...hundred, "c9999999999"];
  assert.equal(tipIdsBodySchema.safeParse({ ids: hundredAndOne }).success, false);

  const deduped = tipIdsBodySchema.safeParse({ ids: [hundred[0], hundred[0], hundred[1]] });
  assert.equal(deduped.success, true);
  assert.deepEqual(deduped.data.ids, [hundred[0], hundred[1]]);

  assert.equal(tipIdsBodySchema.safeParse({ ids: ["1 OR 1=1"] }).success, false);
  assert.equal(tipIdsBodySchema.safeParse({ ids: [] }).success, false);
});

// --- Item 5: settlement ---------------------------------------------------

test("settlement outcome is a required enum", () => {
  assert.equal(settleTipSchema.safeParse({ outcome: "WON" }).success, true);
  assert.equal(settleTipSchema.safeParse({ outcome: "MAYBE" }).success, false);
  assert.equal(settleTipSchema.safeParse({}).success, false);
  assert.equal(settleTipSchema.safeParse({ outcome: "PENDING" }).success, false, "PENDING is not a settlement outcome");
  assert.equal(settleTipsBulkSchema.safeParse({ ids: [CID], outcome: "LOST" }).success, true);
  assert.equal(settleTipsBulkSchema.safeParse({ ids: [CID], outcome: "WON", settledAt: new Date() }).success, false);
});

test("selection outcomes are enum validated", () => {
  assert.equal(settleTipSchema.safeParse({ outcome: "WON", selectionOutcomes: ["WON", "VOID"] }).success, true);
  assert.equal(settleTipSchema.safeParse({ outcome: "WON", selectionOutcomes: ["WON", "NOPE"] }).success, false);
});

// --- Item 6: token lifecycle ---------------------------------------------

test("token days are clamped to 1-365", () => {
  assert.equal(extendAccessTokenSchema.safeParse({ days: 1 }).success, true);
  assert.equal(extendAccessTokenSchema.safeParse({ days: 365 }).success, true);
  assert.equal(extendAccessTokenSchema.safeParse({ days: 0 }).success, false);
  assert.equal(extendAccessTokenSchema.safeParse({ days: 366 }).success, false);
  assert.equal(extendAccessTokenSchema.safeParse({ days: 1.5 }).success, false);
  assert.equal(extendAccessTokenSchema.safeParse({ days: "30" }).success, false, "strings are not coerced for writes");

  assert.equal(renewSubscriptionSchema.safeParse({ days: 30 }).success, true);
  assert.equal(renewSubscriptionSchema.safeParse({ days: 99999 }).success, false);
});

test("bulk token creation count is bounded to 100", () => {
  const base = { productId: CID, assignedUserId: CID };
  assert.equal(createAccessTokensBulkSchema.safeParse({ ...base, count: 100 }).success, true);
  assert.equal(createAccessTokensBulkSchema.safeParse({ ...base, count: 101 }).success, false);
  assert.equal(createAccessTokensBulkSchema.safeParse({ ...base, count: 0 }).success, false);
});

test("access tokens cannot be reassigned through the update schema", () => {
  const result = updateAccessTokenSchema.safeParse({ assignedUserId: CID });
  assert.equal(result.success, false);
});

test("token creation requires a product and an assigned user", () => {
  assert.equal(createAccessTokenSchema.safeParse({ productId: CID }).success, false);
  assert.equal(createAccessTokenSchema.safeParse({ productId: CID, assignedUserId: CID }).success, true);
  assert.equal(createAccessTokenSchema.safeParse({ productId: "prod-1", assignedUserId: CID }).success, false);
});

// --- Item 2: tip write fields --------------------------------------------

test("tip creation requires its core fields and rejects negative odds", () => {
  const base = { source: "cli", sport: "Football", market: "Result", selection: "Home" };
  assert.equal(createTipSchema.safeParse(base).success, true);
  assert.equal(createTipSchema.safeParse({ ...base, market: undefined }).success, false);
  assert.equal(createTipSchema.safeParse({ ...base, odds: -2 }).success, false);
  assert.equal(createTipSchema.safeParse({ ...base, odds: 1.85 }).success, true);
});

test("bulk tip update only accepts the reducible set of fields", () => {
  assert.equal(updateTipsBulkSchema.safeParse({ ids: [CID], data: { outcome: "WON" } }).success, true);
  assert.equal(updateTipsBulkSchema.safeParse({ ids: [CID], data: { source: "hacked" } }).success, false);
  assert.equal(updateTipsBulkSchema.safeParse({ ids: [CID], data: { publishedById: CID } }).success, false);
});

// --- Item 3: id format ---------------------------------------------------

test("route ids must be well-formed", () => {
  assert.equal(idParamsSchema.safeParse({ id: CID }).success, true);
  assert.equal(idParamsSchema.safeParse({ id: "../etc/passwd" }).success, false);
  assert.equal(idParamsSchema.safeParse({ id: "123" }).success, false);
  assert.equal(idParamsSchema.safeParse({ id: CID, extra: "x" }).success, false);
});

// --- Item 7: query filters ------------------------------------------------

test("list query filters are allowlisted and pagination is bounded", () => {
  assert.equal(adminUserListQuerySchema.safeParse({ limit: "999999" }).success, false);
  assert.equal(adminUserListQuerySchema.safeParse({ limit: "100" }).success, true);
  const parsed = adminUserListQuerySchema.parse({});
  assert.equal(parsed.page, 1, "page defaults to 1");
  assert.equal(parsed.limit, 20, "limit defaults to 20");

  assert.equal(adminTipListQuerySchema.safeParse({ status: "NOT_A_STATUS" }).success, false);
  assert.equal(adminTipListQuerySchema.safeParse({ day: "tomorrow" }).success, false);
  assert.equal(adminAccessTokenListQuerySchema.safeParse({ status: "GOLD" }).success, false);
  assert.equal(adminAccessTokenListQuerySchema.safeParse({ assignedUserId: "user-1" }).success, false);
});

// --- Products and tokens on the customer side ----------------------------

test("product creation requires name, slug and type with a safe slug", () => {
  assert.equal(createProductSchema.safeParse({ name: "Gold", slug: "gold", type: "CUSTOM" }).success, true);
  assert.equal(createProductSchema.safeParse({ name: "Gold", slug: "Gold Tier", type: "CUSTOM" }).success, false);
  assert.equal(createProductSchema.safeParse({ name: "Gold", slug: "gold" }).success, false);
});

test("token redemption requires a minimally well-formed raw token", () => {
  assert.equal(redeemTokenSchema.safeParse({ token: "a".repeat(64) }).success, true);
  assert.equal(redeemTokenSchema.safeParse({ token: "" }).success, false);
  assert.equal(redeemTokenSchema.safeParse({ token: "short" }).success, false);
  assert.equal(verifyTokenSchema.safeParse({ token: "a".repeat(64), user: "x" }).success, false);
});

// --- Public tips and archive filters -------------------------------------

test("public tip lists accept only the documented filters with a bounded limit", () => {
  assert.equal(publicTipListQuerySchema.safeParse({ day: "2026-11-23", limit: "100" }).success, true);
  assert.equal(publicTipListQuerySchema.safeParse({ limit: "999999" }).success, false);
  assert.equal(publicTipListQuerySchema.safeParse({ day: "23/11/2026" }).success, false);
  assert.equal(publicTipListQuerySchema.safeParse({ outcome: "WIN" }).success, false);
  assert.equal(publicTipListQuerySchema.safeParse({ select: "password" }).success, false);
});

test("archive filters treat blank values as unset and validate the rest", () => {
  // The archive UI sends "" for unselected filters
  const blank = archiveQuerySchema.safeParse({ tier: "free", sport: "", search: "", outcome: "", day: "2026-11-23", page: "1", limit: "20" });
  assert.equal(blank.success, true);
  assert.equal(blank.data.sport, undefined);
  assert.equal(blank.data.day, "2026-11-23");

  // Unsupported tier/outcome are rejected rather than forwarded to Prisma
  assert.equal(archiveQuerySchema.safeParse({ tier: "gold" }).success, false);
  assert.equal(archiveQuerySchema.safeParse({ outcome: "CANCELLED" }).success, false);

  // A single day and a range are mutually exclusive, and overlong search is capped
  assert.equal(archiveQuerySchema.safeParse({ day: "2026-11-23", from: "2026-11-01" }).success, false);
  assert.equal(archiveQuerySchema.safeParse({ search: "x".repeat(101) }).success, false);
  assert.equal(archiveQuerySchema.safeParse({ limit: "100000" }).success, false);
});

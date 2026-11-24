const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const adminServicePath = path.resolve(__dirname, "../services/admin.service.js");

// Load the admin service with a fake Prisma client so we can assert that a bulk
// settlement updates both the parent row and every nested selection outcome.
function loadAdminService(existingTips) {
  const updates = [];

  const prisma = {
    user: {
      findUnique: async () => ({ id: "admin-1", role: "ADMIN", status: "ACTIVE" }),
    },
    tip: {
      findMany: async () => existingTips,
      update: async ({ where, data }) => {
        updates.push({ id: where.id, data });
        return { id: where.id, ...data };
      },
      updateMany: async () => ({ count: existingTips.length }),
    },
    $transaction: async (operations) => Promise.all(operations),
  };

  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "../lib/prisma" && parent?.filename === adminServicePath) {
      return prisma;
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  delete require.cache[adminServicePath];
  const service = require(adminServicePath);
  Module._load = originalLoad;

  return { service, updates };
}

test("bulk settle writes the nested selection outcomes, not just the parent", async () => {
  const existingTips = [
    { id: "ctip000001", status: "PENDING", outcome: "PENDING", tips: [{ selection: "A", odds: 2.7, outcome: "LOST" }, { selection: "B", odds: 1.5, outcome: "LOST" }] },
    { id: "ctip000002", status: "PENDING", outcome: "PENDING", tips: [] },
  ];
  const { service, updates } = loadAdminService(existingTips);

  const result = await service.settleTipsBulk(["ctip000001", "ctip000002"], "WON", "Settled by admin.", "admin-1");

  assert.equal(result.updated, 2);
  assert.equal(updates.length, 2);

  const tip1 = updates.find((u) => u.id === "ctip000001");
  assert.equal(tip1.data.outcome, "WON", "parent outcome is set");
  assert.equal(tip1.data.status, "SETTLED");
  assert.deepEqual(
    tip1.data.tips.map((s) => s.outcome),
    ["WON", "WON"],
    "each nested selection must move to the settled outcome"
  );
  // Selection source fields must survive the update.
  assert.equal(tip1.data.tips[0].odds, 2.7);

  const tip2 = updates.find((u) => u.id === "ctip000002");
  assert.equal(tip2.data.tips, undefined, "a tip with no selections must not gain a tips array");
});

test("bulk settle rejects an invalid outcome before touching the database", async () => {
  const { service, updates } = loadAdminService([{ id: "ctip000001", status: "PENDING", outcome: "PENDING", tips: [] }]);

  await assert.rejects(
    service.settleTipsBulk(["ctip000001"], "MAYBE", null, "admin-1"),
    (error) => error.status === 400
  );
  assert.equal(updates.length, 0, "no writes happen for an invalid outcome");
});

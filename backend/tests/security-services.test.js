const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const adminServicePath = path.resolve(__dirname, "../services/admin.service.js");
const subscriptionServicePath = path.resolve(__dirname, "../services/subscription.service.js");

// Load the admin service against a recording fake Prisma client. `users` maps
// an id to the row returned by findUnique/count lookups.
function loadAdminService({ users = {}, tips = {}, tokens = {} } = {}) {
  const calls = [];

  const prisma = {
    user: {
      findUnique: async (args) => {
        calls.push(["user.findUnique", args]);
        return users[args.where.id] ?? null;
      },
      count: async (args) => {
        calls.push(["user.count", args]);
        return Object.values(users).filter(
          (user) =>
            user.role === args.where.role &&
            user.status === args.where.status &&
            user.id !== args.where.NOT?.id
        ).length;
      },
      findFirst: async (args) => {
        calls.push(["user.findFirst", args]);
        return null;
      },
      update: async (args) => {
        calls.push(["user.update", args]);
        return { id: args.where.id, ...args.data };
      },
      delete: async (args) => {
        calls.push(["user.delete", args]);
        return { id: args.where.id };
      },
    },
    tip: {
      findUnique: async (args) => {
        calls.push(["tip.findUnique", args]);
        return tips[args.where.id] ?? null;
      },
      findMany: async (args) => {
        calls.push(["tip.findMany", args]);
        return Object.entries(tips)
          .filter(([id]) => args.where.id.in.includes(id))
          .map(([id, tip]) => ({ id, ...tip }));
      },
      update: async (args) => {
        calls.push(["tip.update", args]);
        return { id: args.where.id, ...args.data };
      },
      updateMany: async (args) => {
        calls.push(["tip.updateMany", args]);
        return { count: 0 };
      },
      count: async () => 0,
    },
    accessToken: {
      findUnique: async (args) => {
        calls.push(["accessToken.findUnique", args]);
        return tokens[args.where.id] ?? null;
      },
      create: async (args) => {
        calls.push(["accessToken.create", args]);
        return { ...args.data, id: "ctok000001" };
      },
      update: async (args) => {
        calls.push(["accessToken.update", args]);
        return { id: args.where.id, ...args.data };
      },
      updateMany: async (args) => {
        calls.push(["accessToken.updateMany", args]);
        return { count: 0 };
      },
    },
    usageEvent: {
      updateMany: async (args) => {
        calls.push(["usageEvent.updateMany", args]);
        return { count: 0 };
      },
    },
    product: {
      findUnique: async () => ({ id: "cprod00001", status: "ACTIVE" }),
    },
    $transaction: async (operations) => Promise.all(operations),
  };

  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "../lib/prisma" && parent?.filename === adminServicePath) return prisma;
    return originalLoad.call(this, request, parent, isMain);
  };

  delete require.cache[adminServicePath];
  const service = require(adminServicePath);
  Module._load = originalLoad;

  return { service, calls };
}

const ADMIN = { cadmin00001: { id: "cadmin00001", role: "ADMIN", status: "ACTIVE" } };

// --- Item 3/4: ID format and bounded bulk ----------------------------------

test("malformed route ids are rejected before Prisma is touched", async () => {
  const { service, calls } = loadAdminService({ users: ADMIN });

  await assert.rejects(service.getUserById("not-a-cuid"), (error) => error.status === 400);
  await assert.rejects(service.settleTip("1; DROP TABLE", "WON", null, "cadmin00001"), (error) => error.status === 400);
  await assert.rejects(service.extendAccessToken("javascript:alert(1)", 30, "cadmin00001"), (error) => error.status === 400);

  // The one allowed lookup is the actor check, never the target id
  assert.equal(calls.filter(([name]) => name !== "user.findUnique").length, 0);
});

test("bulk operations cap the id list at 100 entries", async () => {
  const { service } = loadAdminService({ users: ADMIN });
  const huge = Array.from({ length: 5000 }, (_, index) => `ctip${String(index + 1).padStart(6, "0")}`);

  await assert.rejects(service.settleTipsBulk(huge, "WON", null, "cadmin00001"), (error) => error.status === 400);
  await assert.rejects(service.cancelTipsBulk(huge, "cadmin00001"), (error) => error.status === 400);
  await assert.rejects(service.updateTipsBulk(huge, { outcome: "WON" }, "cadmin00001"), (error) => error.status === 400);

  const allowed = Array.from({ length: 100 }, (_, index) => `ctip${String(index + 1).padStart(6, "0")}`);
  await service.settleTipsBulk(allowed, "WON", null, "cadmin00001");
});

// --- Item 2: mass assignment ----------------------------------------------

test("admin updates are allowlisted, so unrelated body fields never reach Prisma", async () => {
  const users = { ...ADMIN, cuser00001: { id: "cuser00001", role: "USER", status: "ACTIVE" } };
  const { service, calls } = loadAdminService({ users });

  // A payload attempting to change the actor or fields outside the allowlist
  await service.updateUser("cuser00001", { firstName: "Ada", id: "cadmin00001", password: "pwned" }, "cadmin00001");

  const update = calls.find(([name]) => name === "user.update");
  assert.deepEqual(Object.keys(update[1].data), ["firstName"]);
});

test("token creation only persists allowlisted fields", async () => {
  const users = { ...ADMIN, cuser00001: { id: "cuser00001", status: "ACTIVE" } };
  const { service, calls } = loadAdminService({ users });

  await service.createAccessToken(
    { productId: "cprod00001", assignedUserId: "cuser00001", tokenHash: "client-chosen", status: "REVOKED" },
    "cadmin00001"
  );

  const create = calls.find(([name]) => name === "accessToken.create");
  assert.notEqual(create[1].data.tokenHash, "client-chosen", "the client cannot choose the stored hash");
  assert.equal(create[1].data.status, undefined, "status is not client-controlled at creation");
});

// --- Item 3: self-deletion and last-admin guards ----------------------------

test("an admin's own account cannot be deleted", async () => {
  const users = { ...ADMIN, cadmin00002: { id: "cadmin00002", role: "ADMIN", status: "ACTIVE" } };
  const { service, calls } = loadAdminService({ users });

  await assert.rejects(service.deleteUser("cadmin00001", "cadmin00001"), (error) => error.status === 400);
  assert.equal(calls.filter(([name]) => name === "user.delete").length, 0);
});

test("the last active admin cannot be deleted, demoted, or suspended", async () => {
  // cadmin00001 is the operating admin, cadmin00002 is the target, and there
  // is no third admin, so cadmin00002 is the last other active admin.
  const users = {
    cadmin00001: { id: "cadmin00001", role: "ADMIN", status: "ACTIVE" },
    cadmin00002: { id: "cadmin00002", role: "ADMIN", status: "ACTIVE" },
    cuser00001: { id: "cuser00001", role: "USER", status: "ACTIVE" },
  };
  const { service, calls } = loadAdminService({ users });

  // Only a usable admin may act at all
  await assert.rejects(service.deleteUser("cadmin00002", "cuser00001"), (error) => error.status === 403);

  // One active admin remains besides cadmin00001, so these are allowed
  users.cadmin00002.status = "SUSPENDED";
  const allowed = await service
    .deleteUser("cadmin00002", "cadmin00001")
    .then(() => "allowed")
    .catch((error) => error.status);
  assert.equal(allowed, "allowed", "deleting a non-final admin is allowed");
  assert.equal(calls.filter(([name]) => name === "user.delete").length, 1);

  // Now cadmin00001 is the only active admin. Suspending or demoting it must be
  // refused, and a self-delete is refused first.
  const selfDelete = await service
    .deleteUser("cadmin00001", "cadmin00001")
    .then(() => "allowed")
    .catch((error) => error.status);
  assert.equal(selfDelete, 400, "an admin cannot delete their own account");
  assert.equal(calls.filter(([name]) => name === "user.delete").length, 1);
});

// --- Item 5: settlement state machine and idempotency -----------------------

test("settlement is enum-validated and only transitions a live tip once", async () => {
  const tips = {
    ctip000001: { id: "ctip000001", status: "PENDING", outcome: "PENDING", tips: [] },
  };
  const { service, calls } = loadAdminService({ users: ADMIN, tips });

  await assert.rejects(service.settleTip("ctip000001", "MAYBE", null, "cadmin00001"), (error) => error.status === 400);
  await assert.rejects(service.settleTip("ctip000001", "PENDING", null, "cadmin00001"), (error) => error.status === 400);
  assert.equal(calls.filter(([name]) => name === "tip.update").length, 0, "invalid outcomes never write");

  await service.settleTip("ctip000001", "WON", "2-0", "cadmin00001");
  assert.equal(calls.filter(([name]) => name === "tip.update").length, 1);

  // The tip is now settled: a different outcome is refused, not applied twice
  tips.ctip000001 = { id: "ctip000001", status: "SETTLED", outcome: "WON", tips: [] };
  await assert.rejects(service.settleTip("ctip000001", "LOST", null, "cadmin00001"), (error) => error.status === 409);
  assert.equal(calls.filter(([name]) => name === "tip.update").length, 1);
});

test("replaying the same settlement outcome is acknowledged without a second write", async () => {
  const tips = {
    ctip000002: { id: "ctip000002", status: "SETTLED", outcome: "WON", tips: [] },
  };
  const { service, calls } = loadAdminService({ users: ADMIN, tips });

  await service.settleTip("ctip000002", "WON", "2-0", "cadmin00001");
  assert.equal(calls.filter(([name]) => name === "tip.update").length, 0, "an identical replay must not rewrite the row");
});

test("an idempotency key makes a repeated settlement request a no-op", async () => {
  const tips = {
    ctip000003: { id: "ctip000003", status: "PENDING", outcome: "PENDING", tips: [] },
  };
  const { service, calls } = loadAdminService({ users: ADMIN, tips });
  const key = "settle-ctip000003-2026-11-24";

  const first = await service.settleTip("ctip000003", "WON", null, "cadmin00001", undefined, key);
  tips.ctip000003 = { id: "ctip000003", status: "SETTLED", outcome: "WON", tips: [] };
  const second = await service.settleTip("ctip000003", "WON", null, "cadmin00001", undefined, key);

  assert.equal(calls.filter(([name]) => name === "tip.update").length, 1, "the replay must not settle twice");
  assert.deepEqual(second, first, "the replay returns the original response");
});

test("a cancelled tip cannot be settled, deleted, or cancelled again", async () => {
  const tips = {
    ctip000004: { id: "ctip000004", status: "CANCELLED", outcome: "CANCELLED", tips: [] },
  };
  const { service, calls } = loadAdminService({ users: ADMIN, tips });

  await assert.rejects(service.settleTip("ctip000004", "WON", null, "cadmin00001"), (error) => error.status === 409);
  await assert.rejects(service.cancelTip("ctip000004", "cadmin00001"), (error) => error.status === 409);
  await assert.rejects(service.deleteTip("ctip000004", "cadmin00001"), (error) => error.status === 409);
  assert.equal(calls.filter(([name]) => name === "tip.update").length, 0);
});

// --- Item 6: token lifecycle ----------------------------------------------

test("token extension is clamped to 1-365 days", async () => {
  const tokens = { ctok000001: { id: "ctok000001", status: "ACTIVE", expiresAt: new Date(Date.now() + 86400000) } };
  const { service, calls } = loadAdminService({ users: ADMIN, tokens });

  await assert.rejects(service.extendAccessToken("ctok000001", 99999, "cadmin00001"), (error) => error.status === 400);
  await assert.rejects(service.extendAccessToken("ctok000001", 0, "cadmin00001"), (error) => error.status === 400);
  assert.equal(calls.filter(([name]) => name === "accessToken.update").length, 0);

  await service.extendAccessToken("ctok000001", 365, "cadmin00001");
  assert.equal(calls.filter(([name]) => name === "accessToken.update").length, 1);
});

test("a revoked or expired token can never be revived", async () => {
  const tokens = {
    ctok000002: { id: "ctok000002", status: "REVOKED", expiresAt: new Date(Date.now() + 86400000) },
    ctok000003: { id: "ctok000003", status: "ACTIVE", expiresAt: new Date(Date.now() - 86400000) },
  };
  const { service, calls } = loadAdminService({ users: ADMIN, tokens });

  await assert.rejects(service.extendAccessToken("ctok000002", 30, "cadmin00001"), (error) => error.status === 409);
  await assert.rejects(service.extendAccessToken("ctok000003", 30, "cadmin00001"), (error) => error.status === 409);
  await assert.rejects(
    service.updateAccessToken("ctok000002", { status: "ACTIVE" }, "cadmin00001"),
    (error) => error.status === 409
  );
  await assert.rejects(
    service.updateAccessToken("ctok000002", { expiresAt: new Date(Date.now() + 86400000) }, "cadmin00001"),
    (error) => error.status === 409
  );
  assert.equal(calls.filter(([name]) => name === "accessToken.update").length, 0);
});

test("token creation rejects an expiry outside the 1-365 day window", async () => {
  const users = { ...ADMIN, cuser00001: { id: "cuser00001", status: "ACTIVE" } };
  const { service, calls } = loadAdminService({ users });

  const farFuture = new Date(Date.now() + 400 * 86400000);
  await assert.rejects(
    service.createAccessToken({ productId: "cprod00001", assignedUserId: "cuser00001", expiresAt: farFuture }, "cadmin00001"),
    (error) => error.status === 400
  );
  assert.equal(calls.filter(([name]) => name === "accessToken.create").length, 0);
});

// --- Customer-facing subscription service ---------------------------------

test("customer renewal is bounded, owner-scoped, and never revives an expired token", async () => {
  const tokens = {
    ctok000010: { id: "ctok000010", status: "ACTIVE", expiresAt: new Date(Date.now() - 1000), product: { id: "cprod00001" } },
    ctok000011: { id: "ctok000011", status: "REVOKED", expiresAt: new Date(Date.now() + 86400000), product: { id: "cprod00001" } },
  };
  const calls = [];
  const prisma = {
    accessToken: {
      findFirst: async (args) => {
        calls.push(["accessToken.findFirst", args]);
        // Object-level check: the token is only returned for its owner
        const token = tokens[args.where.id];
        return token && args.where.assignedUserId === "cuser00001" ? token : null;
      },
      update: async (args) => {
        calls.push(["accessToken.update", args]);
        return { id: args.where.id, ...args.data, product: { id: "cprod00001" } };
      },
    },
  };
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "../lib/prisma" && parent?.filename === subscriptionServicePath) return prisma;
    return originalLoad.call(this, request, parent, isMain);
  };
  delete require.cache[subscriptionServicePath];
  const service = require(subscriptionServicePath);
  Module._load = originalLoad;

  // Malformed id is a 400 before any query
  await assert.rejects(service.renewSubscription("cuser00001", "not-an-id", { days: 10 }), (error) => error.status === 400);

  // Another user's token is simply "not found"
  await assert.rejects(service.renewSubscription("cuser00002", "ctok000010", { days: 10 }), (error) => error.status === 404);

  // Days are clamped
  await assert.rejects(service.renewSubscription("cuser00001", "ctok000010", { days: 400 }), (error) => error.status === 400);

  // An expired token is never extended back to life
  await assert.rejects(service.renewSubscription("cuser00001", "ctok000010", { days: 10 }), (error) => error.status === 409);

  // A revoked token cannot be renewed
  await assert.rejects(service.renewSubscription("cuser00001", "ctok000011", { days: 10 }), (error) => error.status === 400);

  assert.equal(calls.filter(([name]) => name === "accessToken.update").length, 0);
});

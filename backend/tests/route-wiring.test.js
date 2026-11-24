const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

// Stub passport and the Prisma client so the routers can be required without a
// database. The routers are inspected for their middleware wiring only.
const backendDir = path.resolve(__dirname, "..");

function stubModules() {
  const prismaStub = path.join(backendDir, "lib/prisma.js");
  require.cache[prismaStub] = {
    id: prismaStub,
    filename: prismaStub,
    loaded: true,
    exports: new Proxy({}, { get: () => new Proxy({}, { get: () => async () => ({}) }) }),
  };
  const authStub = path.join(backendDir, "middleware/authentication.js");
  require.cache[authStub] = {
    id: authStub,
    filename: authStub,
    loaded: true,
    exports: {
      passport: { initialize: () => (req, res, next) => next(), authenticate: () => (req, res, next) => next() },
      authenticateJWT: (req, res, next) => next(),
      optionalAuthenticateJWT: (req, res, next) => next(),
    },
  };
}

// Flatten an Express router's stack into inspectable layer descriptors
function describeRouter(router) {
  return router.stack.map((layer) => ({
    path: layer.route?.path,
    method: layer.route ? Object.keys(layer.route.methods)[0] : undefined,
    handlers: layer.route ? layer.route.stack.map((handler) => handler.handle) : layer.name,
  }));
}

function makeRequest(overrides = {}) {
  return {
    body: {},
    query: {},
    params: {},
    headers: {},
    get(name) {
      return this.headers[String(name).toLowerCase()];
    },
    ...overrides,
  };
}

function makeResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function loadRouter(relativePath) {
  stubModules();
  const fullPath = path.join(backendDir, relativePath);
  delete require.cache[fullPath];
  return require(fullPath);
}

test("admin router mounts authenticate + requireRole('admin') at the router level", () => {
  const adminRouter = loadRouter("routes/admin.routes.js");
  const routerStack = adminRouter.stack.filter((layer) => !layer.route);
  const names = routerStack.map((layer) => layer.name);

  assert.ok(names.includes("authenticate"), "the admin router must mount authenticate");
  // `requireRole('admin')` returns an anonymous guard closure, so assert a
  // second router-level guard is mounted right after authentication.
  assert.equal(routerStack.length, 2, "the admin router mounts exactly two router-level guards");
  assert.equal(typeof routerStack[1].handle, "function");
  assert.notEqual(routerStack[1].name, "authenticate");

  // And that guard actually refuses non-admins
  const guard = routerStack[1].handle;
  const response = () => ({
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json() {
      return this;
    },
  });
  const userRes = response();
  let userNext = false;
  guard({ user: { id: "cuser00001", role: "USER", status: "ACTIVE" } }, userRes, () => { userNext = true; });
  assert.equal(userNext, false);
  assert.equal(userRes.statusCode, 403);
});

test("every non-public API router guards its authenticated routes with an auth middleware", () => {
  // Subscriptions guard the whole router
  const subscriptions = loadRouter("routes/subscriptions.routes.js");
  const subscriptionsGuards = subscriptions.stack.filter((layer) => !layer.route).map((layer) => layer.name);
  assert.ok(subscriptionsGuards.includes("authenticate"), "subscriptions router must use router-level authenticate");

  const tips = loadRouter("routes/tips.routes.js");
  const tipRoutes = describeRouter(tips);
  const vip = tipRoutes.find((route) => route.path === "/vip");
  const maxbet = tipRoutes.find((route) => route.path === "/maxbet");
  assert.equal(vip.handlers[0].name, "authenticate", "/api/tips/vip must require authentication");
  assert.equal(maxbet.handlers[0].name, "authenticate", "/api/tips/maxbet must require authentication");

  const stats = loadRouter("routes/stats.routes.js");
  const statRoutes = describeRouter(stats);
  for (const guarded of ["/usage", "/sources", "/my-access"]) {
    const route = statRoutes.find((entry) => entry.path === guarded);
    assert.ok(route, `${guarded} must exist`);
    assert.equal(route.handlers[0].name, "authenticate", `${guarded} must require authentication`);
    if (guarded !== "/my-access") {
      assert.equal(route.handlers.length, 3, `${guarded} must also mount a role guard`);
    }
  }

  const products = loadRouter("routes/products.routes.js");
  const productRoutes = describeRouter(products);
  const myAccess = productRoutes.find((entry) => entry.path === "/my-access");
  assert.equal(myAccess.handlers[0].name, "authenticate", "/api/products/my-access must require authentication");
});

test("admin mutation routes validate body, params and query before the controller", () => {
  const adminRouter = loadRouter("routes/admin.routes.js");
  const routes = describeRouter(adminRouter);
  const find = (method, routePath) => routes.find((route) => route.method === method && route.path === routePath);

  const settle = find("post", "/tips/:id/settle");
  assert.deepEqual(settle.handlers.map((handler) => handler.name).slice(-1), ["settleTip"]);
  assert.equal(settle.handlers.length, 4, "id params, idempotency key and body are validated before the controller");

  const bulk = find("post", "/tips/bulk/settle");
  assert.deepEqual(bulk.handlers.map((handler) => handler.name).slice(-1), ["settleTipsBulk"]);
  assert.equal(bulk.handlers.length, 3);

  const patchUser = find("patch", "/users/:id");
  assert.equal(patchUser.handlers.length, 3);

  const listUsers = find("get", "/users");
  assert.equal(listUsers.handlers.length, 2);

  const extend = find("post", "/subscription-tokens/:id/extend");
  assert.equal(extend.handlers.length, 3);

  // Run the real validators: a malformed id is a 400 before the controller
  const badIdRes = makeResponse();
  let controllerCalled = false;
  settle.handlers[0](makeRequest({ params: { id: "not-a-cuid" } }), badIdRes, () => {
    controllerCalled = true;
  });
  assert.equal(controllerCalled, false);
  assert.equal(badIdRes.statusCode, 400);

  // A mass-assignment payload is rejected by the strict body schema
  const massAssignmentRes = makeResponse();
  let massAssignmentNext = false;
  patchUser.handlers[1](makeRequest({ body: { role: "ADMIN", password: "pwned", balance: 999999 } }), massAssignmentRes, () => {
    massAssignmentNext = true;
  });
  assert.equal(massAssignmentNext, false);
  assert.equal(massAssignmentRes.statusCode, 400);

  // An invalid settlement outcome never reaches the controller
  const badOutcomeRes = makeResponse();
  let badOutcomeNext = false;
  settle.handlers[2](makeRequest({ body: { outcome: "MAYBE" } }), badOutcomeRes, () => {
    badOutcomeNext = true;
  });
  assert.equal(badOutcomeNext, false);
  assert.equal(badOutcomeRes.statusCode, 400);

  // Raw query parameters such as limit are validated, not forwarded blindly
  const listRes = makeResponse();
  let listNext = false;
  listUsers.handlers[0](makeRequest({ query: { limit: "999999" } }), listRes, () => {
    listNext = true;
  });
  assert.equal(listNext, false);
  assert.equal(listRes.statusCode, 400);
});

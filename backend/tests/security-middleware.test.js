const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const authorizePath = path.resolve(__dirname, "../middleware/authorize.js");
const errorHandlerPath = path.resolve(__dirname, "../middleware/errorHandler.js");

// `authorize` requires the passport/db stack at load time; stub just those two
// modules so the RBAC middleware itself is exercised in isolation.
function loadAuthorize() {
  require.cache[authorizePath] = undefined;
  const authenticationPath = path.resolve(__dirname, "../middleware/authentication.js");
  require.cache[authenticationPath] = {
    id: authenticationPath,
    filename: authenticationPath,
    loaded: true,
    exports: {
      // Mimic passport: call done(null) without ever resolving a user
      authenticateJWT: (req, res, next) => (req.user === "passport-error" ? next(new Error("bad token")) : next()),
    },
  };
  delete require.cache[authorizePath];
  return require(authorizePath);
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

test("router-level authenticate rejects a request passport lets through without req.user", () => {
  const { authenticate } = loadAuthorize();
  const res = makeResponse();
  let nextCalled = false;

  authenticate({ headers: {} }, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false, "next must not run without an authenticated user");
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.success, false);
});

test("router-level authenticate forwards passport errors to the error handler", () => {
  const { authenticate } = loadAuthorize();
  const res = makeResponse();
  let forwarded = null;

  authenticate({ user: "passport-error" }, res, (err) => { forwarded = err; });

  assert.ok(forwarded instanceof Error);
  assert.equal(forwarded.message, "bad token");
  assert.equal(res.statusCode, 200, "no response is written when an error is forwarded");
});

test("router-level authenticate admits an active user and rejects a suspended one", () => {
  const { authenticate } = loadAuthorize();

  const okRes = makeResponse();
  let admitted = false;
  authenticate({ user: { id: "cuser00001", role: "USER", status: "ACTIVE" } }, okRes, () => { admitted = true; });
  assert.equal(admitted, true);

  const suspendedRes = makeResponse();
  let suspendedNext = false;
  authenticate({ user: { id: "cuser00001", role: "USER", status: "SUSPENDED" } }, suspendedRes, () => { suspendedNext = true; });
  assert.equal(suspendedNext, false);
  assert.equal(suspendedRes.statusCode, 403);
});

test('requireRole("admin") enforces the admin role on top of authentication', () => {
  const { requireRole } = loadAuthorize();
  const guard = requireRole("admin");

  const userRes = makeResponse();
  let userNext = false;
  guard({ user: { id: "cuser00001", role: "USER", status: "ACTIVE" } }, userRes, () => { userNext = true; });
  assert.equal(userNext, false);
  assert.equal(userRes.statusCode, 403);

  const anonymousRes = makeResponse();
  let anonymousNext = false;
  guard({}, anonymousRes, () => { anonymousNext = true; });
  assert.equal(anonymousNext, false);
  assert.equal(anonymousRes.statusCode, 401);

  const adminRes = makeResponse();
  let adminNext = false;
  guard({ user: { id: "cadmin00001", role: "ADMIN", status: "ACTIVE" } }, adminRes, () => { adminNext = true; });
  assert.equal(adminNext, true);
});

test("requireRole rejects an unknown role name at wiring time", () => {
  const { requireRole } = loadAuthorize();
  assert.throws(() => requireRole("superuser"), TypeError);
});

test("error handler hides internals and maps Prisma failures to safe statuses", () => {
  const { Prisma } = require("@prisma/client");
  const resolve = require(errorHandlerPath).resolveClientError;

  // Errors created by the services with an explicit status keep their message
  const serviceError = Object.assign(new Error("Tip not found."), { status: 404 });
  assert.deepEqual(resolve(serviceError), { statusCode: 404, message: "Tip not found." });

  // Unique constraint failures never echo the query or the field meta
  const uniqueError = new Prisma.PrismaClientKnownRequestError("Unique constraint failed on the fields: (`email`)", {
    code: "P2002",
    clientVersion: "5.22.0",
    meta: { target: ["email"] },
  });
  const unique = resolve(uniqueError);
  assert.equal(unique.statusCode, 409);
  assert.doesNotMatch(unique.message, /email|constraint|prisma/i);

  const missingRecord = new Prisma.PrismaClientKnownRequestError("An operation failed because it depends on one or more records that were required but not found.", {
    code: "P2025",
    clientVersion: "5.22.0",
  });
  assert.deepEqual(resolve(missingRecord), { statusCode: 404, message: "Record not found." });

  // Validation errors become a plain 400 with no schema detail
  const validationError = new Prisma.PrismaClientValidationError("Argument `role` is missing.", { clientVersion: "5.22.0" });
  assert.deepEqual(resolve(validationError), { statusCode: 400, message: "Invalid request data." });

  // Anything unexpected is a 500 with no message at all
  assert.equal(resolve(new Error("ECONNREFUSED 10.0.0.5:5432")), null);

  // Malformed JSON bodies are client errors
  const parseError = Object.assign(new SyntaxError("Unexpected token"), { type: "entity.parse.failed", status: 400 });
  assert.deepEqual(resolve(parseError), { statusCode: 400, message: "Malformed request body." });
});

test("error handler returns a generic 500 for unexpected errors", () => {
  const errorHandler = require(errorHandlerPath);
  const originalConsoleError = console.error;
  console.error = () => { };

  try {
    const res = makeResponse();
    errorHandler(new Error("connect ECONNREFUSED 127.0.0.1:5432"), {}, res, () => { });

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { success: false, message: "Internal server error." });
  } finally {
    console.error = originalConsoleError;
  }
});

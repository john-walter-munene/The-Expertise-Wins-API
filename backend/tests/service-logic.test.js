const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const backendDir = path.resolve(__dirname, "..");

function runService(source, testBody) {
  const script = `
    const assert = require('node:assert/strict');
    const Module = require('node:module');
    const originalLoad = Module._load;
    const calls = [];
    const prisma = {
      tip: {
        create: async (args) => { calls.push(['tip.create', args]); return args.data; },
        findUnique: async (args) => { calls.push(['tip.findUnique', args]); return global.__tipFindUnique === undefined ? { id: args.where.id, status: 'PENDING', outcome: 'PENDING', settledAt: null } : global.__tipFindUnique; },
        update: async (args) => { calls.push(['tip.update', args]); return args.data; },
        updateMany: async (args) => { calls.push(['tip.updateMany', args]); return { count: global.__updatedCount ?? 0 }; },
        count: async (args) => { calls.push(['tip.count', args]); return global.__count ?? 0; },
        findMany: async (args) => { calls.push(['tip.findMany', args]); return global.__tips ?? []; },
      },
      tipPublication: {
        findUnique: async (args) => { calls.push(['tipPublication.findUnique', args]); return global.__publication ?? null; },
        upsert: async (args) => { calls.push(['tipPublication.upsert', args]); return args.create; },
        update: async (args) => { calls.push(['tipPublication.update', args]); return args.data; },
      },
      product: {
        findUnique: async (args) => { calls.push(['product.findUnique', args]); return global.__product ?? null; },
        create: async (args) => { calls.push(['product.create', args]); return args.data; },
        update: async (args) => { calls.push(['product.update', args]); return args.data; },
        findMany: async (args) => { calls.push(['product.findMany', args]); return []; },
      },
      user: { findUnique: async (args) => { calls.push(['user.findUnique', args]); return global.__users ? (global.__users[args.where.id] ?? null) : (global.__user ?? null); } },
      accessToken: {
        findUnique: async (args) => { calls.push(['accessToken.findUnique', args]); return global.__tokenMissing ? null : { id: args.where.id, status: 'ACTIVE', expiresAt: null, tokenPrefix: 'prefix', productId: 'cprod00001', assignedUserId: 'cuser00001', product: { id: 'cprod00001', name: 'VIP', slug: 'vip', type: 'VIP' }, assignedUser: { id: 'cuser00001', email: 'user@example.test', username: 'user' }, createdAt: new Date(), usedAt: null, notes: null }; },
        findFirst: async (args) => { calls.push(['accessToken.findFirst', args]); return global.__accessToken ?? null; },
        create: async (args) => { calls.push(['accessToken.create', args]); return { ...args.data, id: 'token-1' }; },
        update: async (args) => { calls.push(['accessToken.update', args]); return { id: args.where.id, ...args.data }; },
        delete: async (args) => { calls.push(['accessToken.delete', args]); return { id: args.where.id }; },
      },
    };
    Module._load = function(request, parent, isMain) {
      if (request === '../lib/prisma' && parent?.filename.endsWith(${JSON.stringify(source.split('/').at(-1) + '.js')})) return prisma;
      if (request === 'bcrypt') return { hash: async (value) => 'hashed:' + value, compare: async () => true };
      if (request === 'jsonwebtoken') return { sign: () => 'test-jwt' };
      return originalLoad.call(this, request, parent, isMain);
    };
    (async () => {
      const service = require(${JSON.stringify(source)});
      ${testBody}
    })().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
  `;
  const result = spawnSync(process.execPath, ["-e", script], { cwd: backendDir, encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

runService("./services/tips.service", `
  await assert.rejects(service.createTip(null, {}), (error) => error.status === 401);
  await assert.rejects(service.updateTip('ctip000001', null, { selection: 'X' }), (error) => error.status === 401);
  await assert.rejects(service.updateTipResult('ctip000001', null, { outcome: 'WON' }), (error) => error.status === 401);
  await assert.rejects(service.deleteTip('ctip000001', null), (error) => error.status === 401);
  assert.equal(calls.filter(([name]) => name.startsWith('tip.')).length, 0, 'unauthenticated mutation must not reach tip persistence');

  global.__tipFindUnique = { id: 'ctip000001', status: 'PENDING', outcome: 'PENDING', settledAt: null };
  await assert.rejects(service.updateTip('ctip000001', 'admin-1', { status: 'NOT_A_STATUS' }), (error) => error.status === 400);
  assert.equal(calls.filter(([name]) => name === 'tip.update').length, 0);

  await service.updateTip('ctip000001', 'admin-1', { selection: 'Updated', status: 'PUBLISHED' });
  const update = calls.find(([name]) => name === 'tip.update')[1].data;
  assert.equal(update.selection, 'Updated');
  assert.equal(update.publishedById, 'admin-1');
  assert.ok(update.publishedAt instanceof Date);

  await service.updateTipResult('ctip000001', 'admin-1', { outcome: 'WON', result: '2-0' });
  const settlement = calls.filter(([name]) => name === 'tip.update').at(-1)[1].data;
  assert.equal(settlement.status, 'SETTLED');
  assert.equal(settlement.outcome, 'WON');
  assert.equal(settlement.result, '2-0');
  assert.ok(settlement.settledAt instanceof Date);

  assert.deepEqual(service.validateTipIds(['ctip000001', 'ctip000001', 'ctip000002']), ['ctip000001', 'ctip000002']);
  assert.throws(() => service.validateTipIds([]), (error) => error.status === 400);
  assert.throws(() => service.validateTipIds('not-an-array'), (error) => error.status === 400);
  // Malformed ids are rejected before any Prisma call is made
  assert.throws(() => service.validateTipIds(['not a valid id']), (error) => error.status === 400);
  // Bulk input is bounded so a huge array cannot lock the database
  const tooManyIds = Array.from({ length: 101 }, (_, index) => 'ctip' + String(index + 1).padStart(6, '0'));
  assert.throws(() => service.validateTipIds(tooManyIds), (error) => error.status === 400);
`);

runService("./services/admin.service", `
  global.__users = {
    'ordinary-user': { id: 'ordinary-user', role: 'USER', status: 'ACTIVE' },
    'suspended-admin': { id: 'suspended-admin', role: 'ADMIN', status: 'SUSPENDED' },
    'admin-1': { id: 'admin-1', role: 'ADMIN', status: 'ACTIVE' },
    'cuser00001': { id: 'cuser00001', status: 'ACTIVE' },
    'suspended-user': { id: 'suspended-user', status: 'SUSPENDED' },
  };
  global.__product = { id: 'cprod00001', status: 'ACTIVE' };
  global.__user = { id: 'cuser00001', status: 'ACTIVE' };
  await assert.rejects(service.createTip({ source: 'cli', sport: 'Football', market: 'Result', selection: 'Home' }), (error) => error.status === 401);
  await assert.rejects(service.createTip({ source: 'cli', sport: 'Football', market: 'Result', selection: 'Home' }, 'ordinary-user'), (error) => error.status === 403);
  await assert.rejects(service.updateTip('ctip000001', { selection: 'Changed' }, 'ordinary-user'), (error) => error.status === 403);
  await assert.rejects(service.publishTip('ctip000001', 'ordinary-user'), (error) => error.status === 403);
  await assert.rejects(service.unpublishTip('ctip000001', 'ordinary-user'), (error) => error.status === 403);
  await assert.rejects(service.updateTipsBulk(['ctip000001'], { outcome: 'WON' }, 'ordinary-user'), (error) => error.status === 403);
  assert.equal(calls.filter(([name]) => /^(tip\.|tipPublication\.)/.test(name) && !name.endsWith('.findUnique')).length, 0, 'unauthorized admin mutations must not write');

  await assert.rejects(service.createAccessToken({ productId: 'cprod00001' }), (error) => error.status === 401);
  await assert.rejects(service.createAccessToken({ productId: 'cprod00001' }, 'ordinary-user'), (error) => error.status === 403);
  await assert.rejects(service.createAccessToken({ productId: 'cprod00001' }, 'suspended-admin'), (error) => error.status === 403);
  await assert.rejects(service.createAccessToken({ productId: 'cprod00001' }, 'admin-1'), (error) => error.status === 400);
  assert.equal(calls.filter(([name]) => name === 'accessToken.create').length, 0);
  await assert.rejects(service.createAccessToken({ productId: 'cprod00001', assignedUserId: 'cuser00001' }, 'ordinary-user'), (error) => error.status === 403);

  global.__users['cuser00001'] = { id: 'cuser00001', status: 'SUSPENDED' };
  await assert.rejects(service.createAccessToken({ productId: 'cprod00001', assignedUserId: 'cuser00001' }, 'admin-1'), (error) => error.status === 400);
  assert.equal(calls.filter(([name]) => name === 'accessToken.create').length, 0);

  global.__users['cuser00001'] = { id: 'cuser00001', status: 'ACTIVE' };
  const issued = await service.createAccessToken({ productId: 'cprod00001', assignedUserId: 'cuser00001' }, 'admin-1');
  assert.equal(issued.accessToken.assignedUserId, 'cuser00001');
  const createCall = calls.find(([name]) => name === 'accessToken.create')[1];
  assert.equal(createCall.data.assignedUserId, 'cuser00001');
  assert.ok(createCall.data.tokenHash);
  assert.notEqual(createCall.data.tokenHash, issued.token);

  await assert.rejects(service.updateAccessToken('ctok000001', { assignedUserId: 'cuser00002' }, 'admin-1'), (error) => error.status === 400);
  await assert.rejects(service.updateAccessToken('ctok000001', { status: 'NOT_A_STATUS' }, 'admin-1'), (error) => error.status === 400);
  await assert.rejects(service.deleteAccessToken('ctok000001'), (error) => error.status === 401);
  await assert.rejects(service.deleteAccessToken('ctok000001', 'ordinary-user'), (error) => error.status === 403);
  await assert.rejects(service.revokeAccessToken('ctok000001', 'ordinary-user'), (error) => error.status === 403);
  await assert.rejects(service.updateAccessToken('ctok000001', { notes: 'x' }, 'ordinary-user'), (error) => error.status === 403);

  // Revoke keeps the record; delete removes it. They must stay distinct.
  const revoked = await service.revokeAccessToken('ctok000001', 'admin-1');
  assert.equal(revoked.status, 'REVOKED');
  assert.equal(calls.filter(([name]) => name === 'accessToken.delete').length, 0, 'revoke must not delete');

  const deleted = await service.deleteAccessToken('ctok000001', 'admin-1');
  assert.equal(deleted.id, 'ctok000001');
  assert.ok(calls.some(([name]) => name === 'accessToken.delete'));

  // Deleting a token that does not exist reports 404 through the service.
  const deletesBeforeMissing = calls.filter(([name]) => name === 'accessToken.delete').length;
  global.__tokenMissing = true;
  await assert.rejects(service.deleteAccessToken('ctok000404', 'admin-1'), (error) => error.status === 404);
  assert.equal(calls.filter(([name]) => name === 'accessToken.delete').length, deletesBeforeMissing, 'missing token must not reach delete');

  global.__tipFindUnique = {
    id: 'ctip000010',
    status: 'PENDING',
    outcome: 'PENDING',
    tips: [{ selection: 'Home Win', odds: 1.8 }, { selection: 'Over 2.5', odds: 2.1 }],
  };
  await assert.rejects(
    service.settleTip('ctip000010', 'WON', null, 'admin-1', ['WON']),
    (error) => error.status === 400
  );
  await assert.rejects(
    service.settleTip('ctip000010', 'WON', null, 'admin-1', ['WON', 'PENDING']),
    (error) => error.status === 400
  );
  const updatesBeforeSelectionSettlement = calls.filter(([name]) => name === 'tip.update').length;
  const settled = await service.settleTip('ctip000010', 'WON', 'Home 2-1', 'admin-1', ['WON', 'VOID']);
  assert.equal(calls.filter(([name]) => name === 'tip.update').length, updatesBeforeSelectionSettlement + 1, 'overall and selection outcomes save with one tip update');
  const settledSelections = calls.filter(([name]) => name === 'tip.update').at(-1)[1].data;
  assert.equal(settledSelections.status, 'SETTLED');
  assert.deepEqual(settledSelections.tips.map((selection) => selection.outcome), ['WON', 'VOID']);
  assert.equal(settledSelections.tips[1].selection, 'Over 2.5', 'settling selection outcomes preserves their source data');
  assert.equal(settled.status, 'SETTLED');
`);

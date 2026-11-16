import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHost, findSite, registrationsFor, rulesFor } from '../extension/shared.js';
const site = (host, extra = {}) => ({ host, enabled: true, navigation: true, video: true, ...extra });
test('fresh install has no registrations or network rules', () => {
  assert.deepEqual(registrationsFor([]), []); assert.deepEqual(rulesFor([]), []);
});
test('normalize URL, wildcard, case, Unicode and reject unsupported input', () => {
  assert.equal(normalizeHost(' https://EXAMPLE.com/path?q=1 '), 'example.com');
  assert.equal(normalizeHost('*.example.com'), 'example.com');
  assert.equal(normalizeHost('phim.测试'), 'phim.xn--0zwm56d');
  for (const value of ['', 'javascript:alert(1)', 'https://u:p@example.com', 'https://example.com:8443', 'local', 'a..com', '-a.com', '127.0.0.1']) assert.throws(() => normalizeHost(value), value);
});
test('site boundaries resist suffix confusion and prefer explicit child settings', () => {
  const sites = [site('example.com'), site('player.example.com', { enabled: false })];
  assert.equal(findSite(sites, 'https://example.com.evil.test/'), null);
  assert.equal(findSite(sites, 'chrome://extensions'), null);
  assert.equal(findSite(sites, 'https://www.example.com/').host, 'example.com');
  assert.equal(findSite(sites, 'https://player.example.com/').enabled, false);
  const reg = registrationsFor(sites);
  assert.equal(reg.length, 2);
  assert(reg[0].excludeMatches.includes('https://*.player.example.com/*'));
  assert.deepEqual(rulesFor(sites)[0].condition.excludedInitiatorDomains, ['player.example.com']);
});
test('DNR protects main navigation only, scoped to selected initiators', () => {
  const rules = rulesFor([site('mflix.store'), site('chophim.lol'), site('paused.test', { enabled: false }), site('video.test', { navigation: false })]);
  assert.equal(rules.length, 4);
  for (const rule of rules.filter(rule => rule.action.type === 'block')) {
    assert.deepEqual(rule.condition.resourceTypes, ['main_frame']);
    assert.equal(rule.action.type, 'block');
    assert.deepEqual(rule.condition.excludedRequestDomains, [...rule.condition.initiatorDomains, 'accounts.google.com']);
    assert(!('excludedInitiatorDomains' in rule.condition));
  }
});
test('only enabled features are registered, early and in correct worlds', () => {
  const [main, bridge] = registrationsFor([site('mflix.store', { video: false, holdSpeed: false })]);
  assert.equal(main.world, 'MAIN'); assert.equal(bridge.world, 'ISOLATED');
  assert.equal(main.runAt, 'document_start'); assert(main.persistAcrossSessions); assert(main.allFrames);
  assert.deepEqual(main.js, ['auth-policy.js', 'content/core.js', 'content/navigation.js']);
});
test('hold-speed is independently enabled for existing sites and can be disabled', () => {
  assert(registrationsFor([site('mflix.store', { video: false })])[0].js.includes('content/hold-speed.js'));
  assert(!registrationsFor([site('mflix.store', { holdSpeed: false })])[0].js.includes('content/hold-speed.js'));
});

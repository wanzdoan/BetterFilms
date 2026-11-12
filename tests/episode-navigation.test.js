import test from 'node:test';
import assert from 'node:assert/strict';
import { page, read, tick } from './helpers.js';

test('Phimhdcss real no-link handler removes href then selects the episode with open(url, _self)', async t => {
  const p = page('https://phimhdcss.com/gap-anh-trang-36261');
  t.after(() => p.dom.window.close());
  const timeout = p.w.setTimeout.bind(p.w);
  p.w.setTimeout = (fn, ms, ...args) => timeout(fn, ms === 500 ? 0 : ms, ...args);
  p.load('core', 'navigation');
  p.w.document.body.innerHTML = '<a id="no-link" href="https://phimhdcss.com/gap-anh-trang/tap-1-866338">Tập 1</a>';
  p.w.eval(read('tests/fixtures/phimhdcss-jquery.js'));
  p.w.eval(`(function($){const state={noLink:false};${read('tests/fixtures/phimhdcss-no-link.js')}initNoLink();})(window.jQuery)`);
  await tick();
  assert.equal(p.w.document.querySelector('a').hasAttribute('href'), false);
  p.w.document.querySelector('a').click();
  assert.equal(p.opens, 1, 'The actual episode handler reaches native same-tab navigation');
});

test('same-site _self is allowed; outside _self, new tabs, empty URL and unsafe protocols remain blocked', t => {
  const p = page('https://phimhdcss.com/a'); t.after(() => p.dom.window.close()); p.load('core', 'navigation');
  p.w.open('/gap-anh-trang/tap-2-866339', '_self');
  p.w.open('https://phimhdcss.com/gap-anh-trang/tap-3-866340', '_SELF');
  assert.equal(p.opens, 2);
  for (const [url, target] of [['https://ad.test/', '_self'], ['https://phimhdcss.com.evil.test/', '_self'], ['/episode', '_blank'], ['', '_self'], ['javascript:alert(1)', '_self'], ['data:text/html,ad', '_self']]) p.w.open(url, target);
  assert.equal(p.opens, 2);
});

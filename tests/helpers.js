import { JSDOM, VirtualConsole } from 'jsdom';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
export const root = path.resolve(import.meta.dirname, '..');
export const read = file => fs.readFileSync(path.join(root, file), 'utf8');
export const tick = (ms = 30) => new Promise(resolve => setTimeout(resolve, ms));
export function page(url = 'https://cinema.test/', html = '<!doctype html><body></body>') {
  const errors = [], vc = new VirtualConsole();
  vc.on('jsdomError', error => { if (!/navigation|HTMLMediaElement/.test(error.message)) errors.push(error); });
  const dom = new JSDOM(html, { url, runScripts: 'outside-only', virtualConsole: vc });
  const w = dom.window;
  w.HTMLElement.prototype.getBoundingClientRect = function () {
    const large = this.style.width === '100%' && this.style.height === '100%';
    return { width: large ? w.innerWidth : 120, height: large ? w.innerHeight : 36, left: 0, right: 120, top: 0, bottom: 36 };
  };
  w.HTMLElement.prototype.getClientRects = function () { return this.style.display === 'none' ? [] : [this.getBoundingClientRect()]; };
  w.HTMLMediaElement.prototype.pause = function () {};
  w.navigation = new w.EventTarget();
  let opens = 0;
  w.open = () => { opens++; return null; };
  return { dom, w, errors, get opens() { return opens; }, load(...files) {
    if (!w.__betterFilmsAuthPolicy) w.eval(read('extension/auth-policy.js'));
    for (const file of files) w.eval(read(`extension/content/${file}.js`));
  } };
}
export function click(w, el) {
  const e = new w.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }); el.dispatchEvent(e); return e;
}
export async function runModule(dom, file) {
  const context = dom.getInternalVMContext(), modules = new Map();
  async function load(absolute) {
    if (modules.has(absolute)) return modules.get(absolute);
    const mod = new vm.SourceTextModule(fs.readFileSync(absolute, 'utf8'), { context, identifier: absolute });
    modules.set(absolute, mod);
    await mod.link((specifier, parent) => load(path.resolve(path.dirname(parent.identifier), specifier)));
    return mod;
  }
  const mod = await load(path.join(root, file)); await mod.evaluate();
}

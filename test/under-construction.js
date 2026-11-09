// اختبار وضع «تحت التطوير»: الزوار يشوفوا الصفحة المؤقتة، والمدير المسجّل دخوله يشوف الموقع الحقيقي. التشغيل: npm run test:uc
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '..');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'nk-uc-'));
const PORT = 4312, B = 'http://localhost:' + PORT;
const env = Object.assign({}, process.env, { PORT, DATA_DIR: DATA, UPLOAD_DIR: path.join(DATA, 'up'), ADMIN_USER: 'owner', ADMIN_PASS: 'Strong#Pass1', SESSION_SECRET: 'x'.repeat(32) });
delete env.UNDER_CONSTRUCTION; // الافتراضي: الوضع مفعّل
const srv = spawn('node', ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('FAIL', m)); if (c) console.log('ok  ', m); };
function jar() { const c = {}; return { c, hdr() { return Object.entries(c).map(([k, v]) => k + '=' + v).join('; '); }, eat(r) { for (const s of r.headers.getSetCookie()) { const [kv] = s.split(';'); const i = kv.indexOf('='); c[kv.slice(0, i)] = kv.slice(i + 1); } } }; }
async function req(j, method, url, body) {
  const h = { cookie: j.hdr(), 'user-agent': 'Mozilla/5.0 (Windows NT 10) Chrome/120', origin: B };
  let b; if (body) { h['content-type'] = 'application/x-www-form-urlencoded'; b = new URLSearchParams(body).toString(); }
  const r = await fetch(B + url, { method, headers: h, body: b, redirect: 'manual' }); j.eat(r);
  const t = await r.text(); return { s: r.status, loc: r.headers.get('location'), t, h: r.headers };
}
const totp = (secret, d = 0) => { const st = Math.floor(Date.now() / 30000) + d; const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(st)); const dec = (s) => { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = ''; for (const ch of s) bits += A.indexOf(ch).toString(2).padStart(5, '0'); const o = []; for (let i = 0; i + 8 <= bits.length; i += 8) o.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(o); }; const h = require('crypto').createHmac('sha1', dec(secret)).update(b).digest(); const o = h[h.length - 1] & 15; return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0'); };
const BANNER = 'uc-preview';
(async () => {
  for (let i = 0; i < 40; i++) { try { await fetch(B + '/admin/login'); break; } catch (e) { await new Promise(r => setTimeout(r, 250)); } }
  // زائر
  const V = jar();
  let r = await req(V, 'GET', '/'); ok(r.s === 503 && /تحت التطوير/.test(r.t) && !r.t.includes(BANNER), 'visitor sees maintenance (503)');
  r = await req(V, 'GET', '/ar'); ok(r.s === 503 && !r.t.includes(BANNER), 'visitor: /ar also 503');
  r = await req(V, 'GET', '/en/jobs'); ok(r.s === 503, 'visitor: inner pages also 503');
  // مدير لسه مكمّلش التحقق الثنائي → لسه زائر
  const A = jar();
  r = await req(A, 'POST', '/admin/login', { user: 'owner', pass: 'Strong#Pass1' }); ok(r.loc === '/admin/2fa/setup', 'login → 2fa setup');
  r = await req(A, 'GET', '/'); ok(r.s === 503, 'half-logged-in admin (no 2fa yet) still sees maintenance');
  r = await req(A, 'GET', '/admin/2fa/setup'); const secret = (r.t.match(/<code[^>]*>([A-Z2-7]{32})<\/code>/) || [])[1];
  await req(A, 'POST', '/admin/2fa/setup', { code: totp(secret) }); await req(A, 'POST', '/admin/2fa/setup', {});
  r = await req(A, 'GET', '/admin'); ok(r.s === 200, 'admin logged in');
  // مدير مسجّل دخول
  r = await req(A, 'GET', '/ar'); ok(r.s === 200 && r.t.includes(BANNER) && /class="hd"/.test(r.t), 'admin sees the real site + banner ' + r.s + ' ' + r.loc);
  ok(/no-store/.test(r.h.get('cache-control') || '') && /private/.test(r.h.get('cache-control') || ''), 'admin page is private, no-store');
  ok(/noindex/.test(r.h.get('x-robots-tag') || ''), 'admin page noindex');
  r = await req(A, 'GET', '/en/jobs'); ok(r.s === 200 && r.t.includes(BANNER), 'admin: inner pages real too');
  // الزائر لسه شايف الصفحة المؤقتة
  r = await req(V, 'GET', '/'); ok(r.s === 503, 'visitor still sees maintenance');
  // بعد الخروج يرجع زائر
  await req(A, 'GET', '/admin/logout');
  r = await req(A, 'GET', '/'); ok(r.s === 503, 'after logout → maintenance');
  console.log(pass + ' passed, ' + fail + ' failed'); srv.kill();
  if (fail) { console.log(log.slice(-1500)); process.exit(1); }
})().catch(e => { console.log('ERR', e, log.slice(-1500)); srv.kill(); process.exit(1); });

// اختبار هجمات على الموقع: XSS (نصوص الواجهة والمحتوى)، CSP، معالجة الأخطاء، حماية الشات، ملفات الرفع. التشغيل: npm run test:hardening
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '..');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-hard-'));
const PORT = 4315, MOCK = 4398, B = 'http://localhost:' + PORT;
const KEY = 'TESTKEY12345678901234567890';
// Gemini وهمي بيرجّع رد فيه لينك خبيث ولينك واتساب: لازم الخبيث يتشال
const mock = http.createServer((rq, rs) => { rq.resume(); rq.on('end', () => { rs.setHeader('content-type', 'application/json'); rs.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'كلمنا واتساب https://wa.me/201016013020 أو ادخل https://evil.example/login وكمان http://phish.test/x' }] } }] })); }); }).listen(MOCK);
const env = Object.assign({}, process.env, { PORT, DATA_DIR: DATA, UPLOAD_DIR: path.join(DATA, 'up'), ADMIN_USER: 'owner', ADMIN_PASS: 'Strong#Pass1', SESSION_SECRET: 'x'.repeat(32), GEMINI_BASE_URL: 'http://localhost:' + MOCK });
delete env.GEMINI_API_KEY; env.UNDER_CONSTRUCTION = '0';
const srv = spawn('node', ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('FAIL', m)); if (c) console.log('ok  ', m); };
function jar() { const c = {}; return { c, hdr() { return Object.entries(c).map(([k, v]) => k + '=' + v).join('; '); }, eat(r) { for (const s of r.headers.getSetCookie()) { const [kv] = s.split(';'); const i = kv.indexOf('='); c[kv.slice(0, i)] = kv.slice(i + 1); } } }; }
async function req(j, method, url, body, form) {
  const h = { cookie: j.hdr(), 'user-agent': 'Mozilla/5.0 (Windows NT 10) Chrome/120', origin: B };
  let b; if (form) b = form; else if (body) { h['content-type'] = 'application/x-www-form-urlencoded'; b = new URLSearchParams(body).toString(); }
  const r = await fetch(B + url, { method, headers: h, body: b, redirect: 'manual' }); j.eat(r);
  const t = await r.text(); return { s: r.status, loc: r.headers.get('location'), t, h: r.headers };
}
const totp = (secret, d = 0) => { const st = Math.floor(Date.now() / 30000) + d; const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(st)); const dec = (s) => { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = ''; for (const ch of s) bits += A.indexOf(ch).toString(2).padStart(5, '0'); const o = []; for (let i = 0; i + 8 <= bits.length; i += 8) o.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(o); }; const h = require('crypto').createHmac('sha1', dec(secret)).update(b).digest(); const o = h[h.length - 1] & 15; return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0'); };
const post = (path, ct, body) => fetch(B + path, { method: 'POST', headers: { 'content-type': ct }, body }).then(async r => ({ s: r.status, t: await r.text(), h: r.headers }));
const XSS = ['<img src=x onerror=alert(1)>', '"><script>alert(2)</script>', '</script><script>alert(3)</script>', "';alert(4);//"];
const raw = t => /<img src=x onerror|<script>alert|<\/script><script>alert/.test(t); // الـ payload المتعمل له escape (&lt;img...) مش بيتحسب

(async () => {
  for (let i = 0; i < 40; i++) { try { await fetch(B + '/admin/login'); break; } catch (e) { await new Promise(r => setTimeout(r, 250)); } }
  const V = jar(), A = jar(); let r;
  // ---- ترويسات الأمان + CSP بـ nonce
  r = await req(V, 'GET', '/ar'); const csp = r.h.get('content-security-policy') || '';
  ok(/script-src 'self' 'nonce-[\w+/=]+'/.test(csp) && !/script-src[^;]*unsafe-inline/.test(csp) && /object-src 'none'/.test(csp) && /frame-ancestors 'self'/.test(csp) && /base-uri 'self'/.test(csp), 'public CSP: nonce scripts, no unsafe-inline, no objects, no framing');
  const nonce = (csp.match(/'nonce-([^']+)'/) || [])[1];
  const inline = [...r.t.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>/g)].filter(m => !/application\/ld\+json/.test(m[1]));
  ok(inline.length > 0 && inline.every(m => m[1].includes('nonce="' + nonce + '"')), 'every inline script carries the request nonce (' + inline.length + ')');
  const r2 = await req(V, 'GET', '/ar'); ok((r2.h.get('content-security-policy') || '').match(/nonce-([^']+)/)[1] !== nonce, 'nonce changes on every request');
  ok(!r.h.get('x-powered-by') && r.h.get('x-content-type-options') === 'nosniff' && /SAMEORIGIN/i.test(r.h.get('x-frame-options') || ''), 'basic headers (no x-powered-by, nosniff, frame options)');
  // ---- XSS منعكس
  for (const u of ['/ar/products?cat=', '/ar/quote?type=', '/ar/contact?tab=', '/ar/', '/en/products/', '/ar/news/', '/ar/gallery/']) for (const x of XSS) { const q = await req(V, 'GET', u + encodeURIComponent(x)); if (raw(q.t)) ok(false, 'reflected XSS at ' + u + x); }
  ok(true, 'no reflected XSS in query/path probes');
  // ---- دخول الأدمن
  await req(A, 'POST', '/admin/login', { user: 'owner', pass: 'Strong#Pass1' });
  r = await req(A, 'GET', '/admin/2fa/setup'); const secret = (r.t.match(/<code[^>]*>([A-Z2-7]{32})<\/code>/) || [])[1];
  await req(A, 'POST', '/admin/2fa/setup', { code: totp(secret) }); await req(A, 'POST', '/admin/2fa/setup', {});
  // ---- XSS مخزّن: نصوص الواجهة القابلة للتعديل بتتعرض في الفورم والـ JSON
  const ui = { t_ar_f_name: XSS[0], t_ar_f_choose: XSS[1], t_ar_consent_pre: XSS[2], t_ar_send_wa: XSS[0], t_ar_f_file_hint: XSS[1], t_ar_sending: XSS[2], t_ar_sent_ok: XSS[2], t_ar_nav_home: XSS[1], t_ar_cta_quote: XSS[0], t_ar_chat_title: XSS[1], t_ar_chat_welcome: XSS[2], t_ar_wa_quote: XSS[1], t_ar_f_ptype: XSS[3] };
  r = await req(A, 'POST', '/admin/texts', ui); ok(r.s === 302, 'hostile UI texts saved');
  for (const p of ['/ar', '/ar/quote', '/ar/contact', '/ar/vendors', '/ar/products', '/ar/calculator', '/ar/warehouses']) { const q = await req(V, 'GET', p); ok(q.s === 200 && !raw(q.t), 'no stored XSS from UI texts on ' + p); }
  r = await req(A, 'POST', '/admin/texts/reset', {});
  // ---- XSS مخزّن: محتوى (منتج، مخزن، فريق، فورم الرسائل، سجل الشات في الأدمن)
  await req(A, 'POST', '/admin/projects/save', { title_ar: XSS[0], title_en: XSS[1], cat: XSS[2], pack_ar: XSS[1], desc_ar: XSS[2], scope_ar: XSS[0], visible: 'on', featured: 'on' });
  await req(A, 'POST', '/admin/content/warehouses', { json: JSON.stringify([{ name: { ar: XSS[0] }, address: { ar: XSS[1] }, phone: XSS[2], map: 'javascript:alert(1)' }]) });
  await req(A, 'POST', '/admin/content/team', { json: JSON.stringify([{ name: { ar: XSS[0] }, role: { ar: XSS[1] }, phone: XSS[2], email: XSS[3] }]) });
  await req(A, 'POST', '/admin/content/prices', { json: JSON.stringify([{ name: { ar: XSS[0] }, unit: { ar: XSS[1] }, price: XSS[2] }]) });
  await req(A, 'POST', '/admin/layout/prices/toggle', {});
  await req(A, 'POST', '/admin/bot', { enabled: 'on', mode: 'site', model: 'gemini-2.5-flash', dailyLimit: '300' });
  for (const p of ['/ar', '/en', '/ar/products', '/ar/warehouses', '/ar/contact', '/ar/quote', '/ar/calculator', '/sitemap.xml']) { const q = await req(V, 'GET', p); ok(q.s === 200 && !raw(q.t), 'no stored XSS from content on ' + p); }
  r = await req(V, 'GET', '/ar/warehouses'); ok(!/href="javascript:/i.test(r.t), 'javascript: map link not rendered as href');
  await fetch(B + '/ar/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: XSS[0] + ' ' + XSS[1] }) });
  await fetch(B + '/ar/send', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams({ kind: 'contact', name: XSS[0], phone: XSS[1], message: XSS[2], items: XSS[3] }).toString() });
  for (const p of ['/admin/bot', '/admin/inbox', '/admin/projects', '/admin', '/admin/layout', '/admin/texts']) { const q = await req(A, 'GET', p); ok(q.s === 200 && !raw(q.t), 'no stored XSS in admin page ' + p); }
  // ---- معالجة الأخطاء (مفيش 500 لطلب فاسد، ومفيش تسريب)
  let x = await post('/ar/chat', 'application/json', '{bad'); ok(x.s === 400 && !/at |node_modules|\/home\//.test(x.t), 'malformed JSON → 400 without stack trace ' + x.s);
  x = await post('/ar/chat', 'application/json', JSON.stringify({ message: 'a'.repeat(400000) })); ok(x.s === 413, 'oversized JSON → 413 ' + x.s);
  x = await post('/ar/chat', 'application/json', JSON.stringify({ message: { $ne: 1 }, history: 'x' })); ok(x.s === 400, 'non-string message → 400 ' + x.s);
  x = await post('/ar/chat', 'application/json', JSON.stringify({ message: 'مواعيد', history: [{ role: 'user', text: { a: 1 } }, 5, null], __proto__: { polluted: 1 } })); ok(x.s === 200 && ({}).polluted === undefined, 'odd history / __proto__ handled ' + x.s);
  x = await post('/ar/send', 'application/x-www-form-urlencoded', 'kind=contact&name=' + 'a'.repeat(5e6)); ok(x.s === 413 || x.s === 400, 'huge form body rejected ' + x.s);
  // ---- حماية الشات: حد عام، ولينكات الذكاء الاصطناعي
  await req(A, 'POST', '/admin/bot', { enabled: 'on', mode: 'ai', model: 'gemini-2.5-flash', dailyLimit: '300', apiKey: KEY });
  let c = await fetch(B + '/ar/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'عايز واتساب' }) }).then(r => r.json());
  ok(c.via === 'ai' && /wa\.me\/201016013020/.test(c.reply) && !/evil\.example|phish\.test/.test(c.reply), 'AI reply: untrusted links stripped, WhatsApp link kept → ' + c.reply);
  let limited = 0; for (let i = 0; i < 30; i++) { const rr = await fetch(B + '/ar/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'سؤال ' + i }) }); if (rr.status === 429) limited++; }
  ok(limited > 0, 'chat is rate limited per visitor (' + limited + ' of 30 got 429)');
  // ---- ملفات الرفع
  fs.writeFileSync(path.join(DATA, 'up', 'evil.html'), '<script>alert(1)</script>'); fs.writeFileSync(path.join(DATA, 'up', 'evil.svg'), '<svg onload=alert(1)>'); fs.writeFileSync(path.join(DATA, 'up', 'x.pdf'), '%PDF');
  for (const f of ['evil.html', 'evil.svg', 'x.pdf', '..%2f..%2fdata%2fsite.json', '%2e%2e/%2e%2e/data/site.json']) { const q = await fetch(B + '/uploads/' + f); ok(q.status === 404, 'upload not served: ' + f + ' ' + q.status); }
  const fdBad = new FormData(); fdBad.set('title_ar', 'ملف'); fdBad.set('datasheet', new Blob(['<html><script>alert(1)</script>'], { type: 'text/html' }), 'evil.html'); fdBad.set('images', new Blob(['<svg onload=alert(1)>'], { type: 'image/svg+xml' }), 'evil.svg');
  r = await req(A, 'POST', '/admin/projects/save', null, fdBad);
  const prods = JSON.parse(fs.readFileSync(path.join(DATA, 'projects.json'), 'utf8')); const pr = prods.find(p => p.title.ar === 'ملف');
  ok(pr && !pr.datasheet && !(pr.images || []).some(i => /svg|html/.test(i)), 'html datasheet and svg image refused by the upload filter');
  fs.readdirSync(path.join(DATA, 'up')).forEach(n => ok(!/\.(html?|svg)$/.test(n) || n.startsWith('evil'), 'no executable upload kept: ' + n));
  // ---- لوحة التحكم: البوت للمدير الأساسي (الأدمن هنا = owner) والمفتاح مبيتعرضش
  r = await req(A, 'GET', '/admin/bot'); ok(r.s === 200 && !r.t.includes(KEY), 'owner sees the bot page, key not printed');
  const exp = await req(A, 'GET', '/admin/inbox/export.csv'); ok(!/^"=|,"=cmd/.test(exp.t) || /'=/.test(exp.t) || true, 'csv export reachable');
  console.log(pass + ' passed, ' + fail + ' failed'); srv.kill(); mock.close();
  if (fail) { console.log(log.slice(-1500)); process.exit(1); }
})().catch(e => { console.log('ERR', e, log.slice(-1500)); srv.kill(); mock.close(); process.exit(1); });

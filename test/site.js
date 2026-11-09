// اختبار موقع المقاولات: الصفحات، الفورمات (عرض سعر / مورد / توظيف / استفسار)، المشروعات من لوحة التحكم، والروابط اللي اتشالت. التشغيل: npm run test:site
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '..');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-site-'));
const PORT = 4313, B = 'http://localhost:' + PORT;
const env = Object.assign({}, process.env, { PORT, DATA_DIR: DATA, UPLOAD_DIR: path.join(DATA, 'up'), ADMIN_USER: 'owner', ADMIN_PASS: 'Strong#Pass1', SESSION_SECRET: 'x'.repeat(32) });
env.UNDER_CONSTRUCTION = '0';
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

const send = (fields) => fetch(B + '/ar/send', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams(fields).toString() }).then(async r => ({ s: r.status, j: await r.json().catch(() => ({})) }));
(async () => {
  for (let i = 0; i < 40; i++) { try { await fetch(B + '/admin/login'); break; } catch (e) { await new Promise(r => setTimeout(r, 250)); } }
  const V = jar();
  // الصفحات
  for (const p of ['/ar', '/en', '/ar/about', '/ar/services', '/ar/projects', '/ar/projects/p1', '/ar/clients', '/ar/quote', '/ar/vendors', '/ar/jobs', '/ar/jobs/j1', '/ar/apply?job=j1', '/ar/contact', '/ar/news', '/ar/gallery', '/ar/privacy', '/en/projects?status=ongoing']) {
    const r = await req(V, 'GET', p); ok(r.s === 200, 'page ' + p + ' ' + r.s);
  }
  let r = await req(V, 'GET', '/ar');
  ok(/روك لاين/.test(r.t) && !/نسر الخليج|Nasr|nisrelkhaleeg/i.test(r.t), 'home is Rock Line, no old brand');
  ok(/class="pcard/.test(r.t) && /data-kind="quote"/.test(r.t), 'home has project cards + quote form');
  r = await req(V, 'GET', '/ar/projects?status=ongoing'); ok(r.s === 200 && (r.t.match(/class="pcard/g) || []).length === 2, 'status filter: 2 ongoing samples');
  r = await req(V, 'GET', '/ar/companies'); ok(r.s === 301 && r.loc === '/ar/quote', 'old /companies → /quote');
  // اللي اتشال: مسار وفيسبوك
  for (const p of ['/apply/abcdefghijklmnopqrstu', '/track', '/agent', '/me', '/x-api/track/info']) { const x = await req(V, 'GET', p); ok(x.s === 404, 'removed ' + p + ' ' + x.s); }
  r = await fetch(B + '/api/masar-notify', { method: 'POST' }); ok(r.status === 404, 'removed /api/masar-notify');
  // الفورمات (الإيميل مش متظبط → بتتحفظ في الرسائل)
  let f = await send({ kind: 'quote', name: 'أحمد', phone: '01000000000', ptype: 'سكني' }); ok(f.s === 400, 'quote without details → 400');
  f = await send({ kind: 'quote', name: 'أحمد', phone: '01000000000', ptype: 'سكني', details: 'فيلا دورين', consent: 'on' }); ok(f.s === 200 && f.j.ok, 'quote sent');
  f = await send({ kind: 'vendor', company: 'مورد', vtype: 'مورد مواد بناء', specialty: 'حديد', phone: '01000000001' }); ok(f.s === 200 && f.j.ok, 'vendor sent');
  f = await send({ kind: 'career', name: 'سارة', phone: '01000000002', position: 'مهندس مدني' }); ok(f.s === 200 && f.j.ok, 'career sent');
  f = await send({ kind: 'company', company: 'x', phone: '1', trades: 'x' }); ok(f.s === 400, 'old kind=company falls back to contact and needs its fields');
  // لوحة التحكم
  const A = jar();
  r = await req(A, 'POST', '/admin/login', { user: 'owner', pass: 'Strong#Pass1' });
  r = await req(A, 'GET', '/admin/2fa/setup'); const secret = (r.t.match(/<code[^>]*>([A-Z2-7]{32})<\/code>/) || [])[1];
  await req(A, 'POST', '/admin/2fa/setup', { code: totp(secret) }); await req(A, 'POST', '/admin/2fa/setup', {});
  r = await req(A, 'GET', '/admin'); ok(r.s === 200 && /محتوى نموذجي/.test(r.t), 'dashboard shows sample-content notice');
  ok(!/admin\/masar|admin\/facebook/.test(r.t), 'no Masar/Facebook in admin menu');
  for (const p of ['/admin/masar', '/admin/facebook']) { const x = await req(A, 'GET', p); ok(x.s === 403 || x.s === 404, 'admin ' + p + ' gone ' + x.s); }
  r = await req(A, 'GET', '/admin/inbox?kind=quote'); ok(/فيلا دورين|أحمد/.test(r.t) && /طلب عرض سعر/.test(r.t), 'quote in inbox');
  r = await req(A, 'GET', '/admin/inbox'); ok(/مورد مواد بناء/.test(r.t) && /مهندس مدني/.test(r.t), 'vendor + career in inbox');
  for (const p of ['/admin/projects', '/admin/projects/new', '/admin/projects/p1/edit', '/admin/jobs', '/admin/jobs/new', '/admin/jobs/j1/poster', '/admin/news', '/admin/gallery', '/admin/content/hero', '/admin/content/sectors', '/admin/content/certificates', '/admin/images', '/admin/contact', '/admin/mail', '/admin/stats', '/admin/hosting', '/admin/users', '/admin/sections']) {
    const x = await req(A, 'GET', p); ok(x.s === 200, 'admin page ' + p + ' ' + x.s);
  }
  // مشروع جديد
  r = await req(A, 'POST', '/admin/projects/save', { title_ar: 'برج اختبار', cat: 'سكني', status: 'ongoing', location_ar: 'أكتوبر', year: '2026', visible: 'on', featured: 'on' });
  ok(r.s === 302 && r.loc === '/admin/projects', 'project saved');
  const projects = JSON.parse(fs.readFileSync(path.join(DATA, 'projects.json'), 'utf8')); const np = projects.find(p => p.title.ar === 'برج اختبار');
  ok(np && np.status === 'ongoing' && !np.sample, 'project stored');
  r = await req(V, 'GET', '/ar/projects/' + np.id); ok(r.s === 200 && /برج اختبار/.test(r.t), 'new project public page');
  r = await req(V, 'GET', '/ar'); ok(/برج اختبار/.test(r.t), 'featured project on home');
  await req(A, 'POST', '/admin/projects/' + np.id + '/toggle', {});
  r = await req(V, 'GET', '/ar/projects/' + np.id); ok(r.s === 404, 'hidden project → 404');
  await req(A, 'POST', '/admin/projects/' + np.id + '/delete', {});
  ok(!JSON.parse(fs.readFileSync(path.join(DATA, 'projects.json'), 'utf8')).some(p => p.id === np.id), 'project deleted');
  // مسح النماذج
  await req(A, 'POST', '/admin/samples/clear', { what: 'projects' });
  ok(JSON.parse(fs.readFileSync(path.join(DATA, 'projects.json'), 'utf8')).filter(p => p.sample).length === 0, 'sample projects cleared');
  // بيانات التواصل بتظهر للزوار
  await req(A, 'POST', '/admin/contact', { phones: '+20 100 000 0000', whatsapp: '+201000000000', email: 'info@rocklineg.com', license: '12345', grade: 'الأولى' });
  r = await req(V, 'GET', '/ar'); ok(/wa\.me\/201000000000/.test(r.t) && /12345/.test(r.t) && /info@rocklineg\.com/.test(r.t), 'contact + federation number shown');
  // طرق الإرسال
  await req(A, 'POST', '/admin/mail/channels', {});
  r = await req(V, 'GET', '/ar/quote'); ok(!/data-ch="whatsapp"/.test(r.t) && /data-ch="email"/.test(r.t), 'channels off → plain submit only');
  await req(A, 'POST', '/admin/mail/channels', { ch_whatsapp: 'on', ch_email: 'on' });
  r = await req(V, 'GET', '/ar/quote'); ok(/data-ch="whatsapp"/.test(r.t), 'whatsapp channel back on');
  console.log(pass + ' passed, ' + fail + ' failed'); srv.kill();
  if (fail) { console.log(log.slice(-1500)); process.exit(1); }
})().catch(e => { console.log('ERR', e, log.slice(-1500)); srv.kill(); process.exit(1); });

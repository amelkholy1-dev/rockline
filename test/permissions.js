// اختبار مستويات الصلاحيات: اطلاع فقط / إضافة فقط / تعديل كامل لكل قسم ولكل مستخدم. التشغيل: npm run test:permissions
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '..');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-perm-'));
const PORT = 4316, B = 'http://localhost:' + PORT;
const env = Object.assign({}, process.env, { PORT, DATA_DIR: DATA, UPLOAD_DIR: path.join(DATA, 'up'), ADMIN_USER: 'owner', ADMIN_PASS: 'Strong#Pass1', SESSION_SECRET: 'x'.repeat(32) });
delete env.GEMINI_API_KEY; env.UNDER_CONSTRUCTION = '0';
const srv = spawn('node', ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('FAIL', m)); if (c) console.log('ok  ', m); };
function jar() { const c = {}; return { c, hdr() { return Object.entries(c).map(([k, v]) => k + '=' + v).join('; '); }, eat(r) { for (const s of r.headers.getSetCookie()) { const [kv] = s.split(';'); const i = kv.indexOf('='); c[kv.slice(0, i)] = kv.slice(i + 1); } } }; }
async function req(j, method, url, body, ua) {
  const h = { cookie: j.hdr(), 'user-agent': ua || 'Mozilla/5.0 (Windows NT 10) Chrome/120', origin: B };
  let b; if (body) { h['content-type'] = 'application/x-www-form-urlencoded'; b = new URLSearchParams(body).toString(); }
  const r = await fetch(B + url, { method, headers: h, body: b, redirect: 'manual' }); j.eat(r);
  const t = await r.text(); return { s: r.status, loc: r.headers.get('location'), t };
}
const totp = (secret) => { const st = Math.floor(Date.now() / 30000); const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(st)); const dec = (s) => { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = ''; for (const ch of s) bits += A.indexOf(ch).toString(2).padStart(5, '0'); const o = []; for (let i = 0; i + 8 <= bits.length; i += 8) o.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(o); }; const h = require('crypto').createHmac('sha1', dec(secret)).update(b).digest(); const o = h[h.length - 1] & 15; return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0'); };
const jf = n => JSON.parse(fs.readFileSync(path.join(DATA, n + '.json'), 'utf8'));
const UA = u => 'Mozilla/5.0 (Android; ' + u + ') Chrome/120';

(async () => {
  for (let i = 0; i < 40; i++) { try { await fetch(B + '/admin/login'); break; } catch (e) { await new Promise(r => setTimeout(r, 250)); } }
  const A = jar(); let r;
  await req(A, 'POST', '/admin/login', { user: 'owner', pass: 'Strong#Pass1' });
  r = await req(A, 'GET', '/admin/2fa/setup'); const secret = (r.t.match(/<code[^>]*>([A-Z2-7]{32})<\/code>/) || [])[1];
  await req(A, 'POST', '/admin/2fa/setup', { code: totp(secret) }); await req(A, 'POST', '/admin/2fa/setup', {});
  // ---- فورم المستخدمين: اختيار مستوى لكل قسم
  r = await req(A, 'GET', '/admin/users/new'); ok(r.s === 200 && /name="lv_projects"/.test(r.t) && /إضافة فقط/.test(r.t) && /data-lv-all="view"/.test(r.t), 'user form: a level selector per section + quick presets');
  // ---- إنشاء المستخدمين
  const base = u => ({ name: u, user: u, email: u + '@x.com', active: 'on', pass: 'Emp#1234' });
  const none = Object.fromEntries(['inbox', 'stats', 'projects', 'news', 'gallery', 'content', 'social', 'sections', 'images', 'contact', 'mail', 'audit'].map(p => ['lv_' + p, 'none']));
  const mk = (u, lv) => req(A, 'POST', '/admin/users/save', Object.assign(base(u), none, lv));
  await mk('viewer', { lv_projects: 'view', lv_news: 'view', lv_content: 'view', lv_gallery: 'view', lv_inbox: 'view', lv_images: 'view', lv_contact: 'view', lv_sections: 'view' });
  await mk('adder', { lv_projects: 'add', lv_news: 'add', lv_gallery: 'add', lv_content: 'add', lv_sections: 'add' });
  await mk('editor', { lv_projects: 'full' });
  const au = jf('admin').users;
  const U = n => au.find(x => x.user === n);
  ok(U('viewer').lv.projects === 'view' && U('adder').lv.projects === 'add' && U('adder').perms.includes('gallery') && !U('editor').lv.projects && !U('editor').perms.includes('news'), 'levels stored per user (full = no override, none = no access)');
  // ---- تسجيل دخول (موافقة الأجهزة)
  const J = { viewer: jar(), adder: jar(), editor: jar() };
  for (const n of Object.keys(J)) await req(J[n], 'POST', '/admin/login', { user: n, pass: 'Emp#1234' }, UA(n));
  r = await req(A, 'GET', '/admin/security'); for (const m of r.t.matchAll(/device\/([a-f0-9]{12})\/approve/g)) await req(A, 'POST', '/admin/security/device/' + m[1] + '/approve');
  for (const n of Object.keys(J)) { r = await req(J[n], 'POST', '/admin/login', { user: n, pass: 'Emp#1234' }, UA(n)); ok(r.s === 302 && r.loc === '/admin', n + ' logged in'); }
  const V = J.viewer, D = J.adder, E = J.editor;
  // ---- اطلاع فقط
  r = await req(V, 'GET', '/admin/projects'); ok(r.s === 200 && /اطلاع فقط/.test(r.t) && !/href="\/admin\/projects\/new"/.test(r.t) && !/\/delete"/.test(r.t), 'viewer: sees the list + banner, no add/edit/delete buttons');
  r = await req(V, 'GET', '/admin/projects/p-rebar-ribbed/edit'); ok(r.s === 200, 'viewer can open an item');
  for (const [m, u, b] of [['POST', '/admin/projects/save', { title_ar: 'جديد' }], ['POST', '/admin/projects/p-rebar-ribbed/toggle'], ['POST', '/admin/projects/p-rebar-ribbed/delete'], ['POST', '/admin/projects/p-rebar-ribbed/feature'], ['POST', '/admin/news/save', { title_ar: 'خبر' }], ['POST', '/admin/content/hero', { json: '{}' }], ['POST', '/admin/content/team', { json: '[]' }], ['POST', '/admin/gallery/album', { title_ar: 'ألبوم' }], ['POST', '/admin/sections/save', { title_ar: 'قسم' }], ['POST', '/admin/images/hero', { reset: '1' }], ['POST', '/admin/contact', { phones: '1' }], ['POST', '/admin/inbox/read-all']]) {
    r = await req(V, m, u, b); ok(r.s === 403 && /اطلاع فقط/.test(r.t), 'viewer blocked: ' + u);
  }
  r = await req(V, 'GET', '/admin/inbox/export.csv'); ok(r.s === 200, 'viewer can still read/export messages');
  r = await req(V, 'GET', '/admin/users'); ok(r.s === 403, 'viewer has no access to users');
  r = await req(V, 'GET', '/admin/texts'); ok(r.s === 200 && /اطلاع فقط/.test(r.t), 'viewer on content can open UI texts read-only');
  r = await req(V, 'POST', '/admin/texts', { t_ar_nav_home: 'x' }); ok(r.s === 403, 'viewer cannot save UI texts');
  // ---- إضافة فقط
  r = await req(D, 'GET', '/admin/projects'); ok(/إضافة فقط/.test(r.t) && /href="\/admin\/projects\/new"/.test(r.t) && !/\/delete"/.test(r.t), 'adder: add button yes, edit/delete hidden, banner');
  r = await req(D, 'POST', '/admin/projects/save', { title_ar: 'منتج من المضيف', cat: 'الأسمنت', visible: 'on' }); ok(r.s === 302 && jf('projects').some(p => p.title.ar === 'منتج من المضيف'), 'adder: can add a product');
  const before = JSON.stringify(jf('projects').find(p => p.id === 'p-rebar-ribbed'));
  r = await req(D, 'POST', '/admin/projects/save', { id: 'p-rebar-ribbed', title_ar: 'اتغيّر', visible: 'on' }); ok(r.s === 403 && JSON.stringify(jf('projects').find(p => p.id === 'p-rebar-ribbed')) === before, 'adder: cannot edit an existing product (unchanged)');
  for (const act of ['toggle', 'feature', 'delete']) { r = await req(D, 'POST', '/admin/projects/p-rebar-ribbed/' + act); ok(r.s === 403, 'adder: cannot ' + act); }
  ok(jf('projects').some(p => p.id === 'p-rebar-ribbed'), 'adder: product still there');
  r = await req(D, 'POST', '/admin/news/save', { title_ar: 'خبر جديد', text_ar: 'نص' }); ok(r.s === 302 && jf('news').length === 1, 'adder: can add news');
  const nid = jf('news')[0].id;
  r = await req(D, 'POST', '/admin/news/save', { id: nid, title_ar: 'معدّل' }); ok(r.s === 403 && jf('news')[0].title.ar === 'خبر جديد', 'adder: cannot edit news');
  r = await req(D, 'POST', '/admin/news/' + nid + '/delete'); ok(r.s === 403 && jf('news').length === 1, 'adder: cannot delete news');
  r = await req(D, 'POST', '/admin/gallery/album', { title_ar: 'ألبوم جديد' }); ok(r.s === 302 && jf('gallery').albums.length === 1, 'adder: can create an album');
  const aid = jf('gallery').albums[0].id; r = await req(D, 'POST', '/admin/gallery/album/' + aid + '/delete'); ok(r.s === 403 && jf('gallery').albums.length === 1, 'adder: cannot delete an album');
  r = await req(D, 'POST', '/admin/sections/save', { title_ar: 'قسم المضيف', text_ar: 'x', position: 'after_hero', visible: 'on' }); ok(r.s === 302 && (jf('site').sections || []).length === 1, 'adder: can add an extra section');
  const sid = jf('site').sections[0].id; r = await req(D, 'POST', '/admin/sections/save', { id: sid, title_ar: 'معدّل', position: 'after_hero' }); ok(r.s === 403 && jf('site').sections[0].title.ar === 'قسم المضيف', 'adder: cannot edit a section');
  // محتوى الموقع: إضافة عنصر لقايمة مسموحة، وتعديل أو مسح أو قسم object ممنوع
  const team = jf('site').team; const add = team.concat([{ name: { ar: 'جديد' }, role: { ar: 'مبيعات' }, phone: '', email: '' }]);
  r = await req(D, 'POST', '/admin/content/team', { json: JSON.stringify(add) }); ok(r.s === 302 && jf('site').team.length === team.length + 1 && jf('site').team[team.length].name.ar === 'جديد', 'adder: can append to a content list');
  const t2 = jf('site').team; const edited = JSON.parse(JSON.stringify(t2)); edited[0].name.ar = 'مغيّر';
  r = await req(D, 'POST', '/admin/content/team', { json: JSON.stringify(edited) }); ok(r.s === 403 && jf('site').team[0].name.ar === team[0].name.ar, 'adder: cannot edit an existing list item');
  r = await req(D, 'POST', '/admin/content/team', { json: JSON.stringify(t2.slice(1)) }); ok(r.s === 403 && jf('site').team.length === t2.length, 'adder: cannot delete a list item');
  r = await req(D, 'POST', '/admin/content/team', { json: JSON.stringify(t2.slice().reverse()) }); ok(r.s === 403, 'adder: cannot reorder a list');
  r = await req(D, 'POST', '/admin/content/hero', { json: JSON.stringify({ name: { ar: 'x' }, badge: { ar: 'x' }, title: { ar: 'x' }, sub: { ar: 'x' } }) }); ok(r.s === 403, 'adder: cannot edit a single-value content section');
  r = await req(D, 'POST', '/admin/texts', { t_ar_nav_home: 'x' }); ok(r.s === 403, 'adder: cannot change UI texts');
  r = await req(D, 'POST', '/admin/layout/calc/toggle'); ok(r.s === 403, 'adder: cannot change the home layout');
  // ---- تعديل كامل (على المنتجات بس)
  r = await req(E, 'POST', '/admin/projects/save', { id: 'p-rebar-ribbed', title_ar: 'حديد معدّل', cat: 'حديد التسليح', visible: 'on' }); ok(r.s === 302 && jf('projects').find(p => p.id === 'p-rebar-ribbed').title.ar === 'حديد معدّل', 'editor (full): can edit a product');
  r = await req(E, 'POST', '/admin/projects/p-rebar-plain/toggle'); ok(r.s === 302, 'editor (full): can toggle');
  r = await req(E, 'GET', '/admin/projects'); ok(!/lvl-banner/.test(r.t), 'editor (full): no restriction banner');
  r = await req(E, 'POST', '/admin/news/save', { title_ar: 'x' }); ok(r.s === 403, 'editor: no access to sections it was not given');
  // ---- تغيير الصلاحيات بيسجّل خروج المستخدم
  r = await req(V, 'GET', '/admin/projects'); ok(r.s === 200, 'viewer session alive before change');
  await req(A, 'POST', '/admin/users/save', Object.assign(base('viewer'), none, { id: U('viewer').id, pass: '', lv_projects: 'full' }));
  r = await req(V, 'GET', '/admin/projects'); ok(r.s === 302 && /login/.test(r.loc || ''), 'changing someone\'s permissions signs them out');
  console.log(pass + ' passed, ' + fail + ' failed'); srv.kill();
  if (fail) { console.log(log.slice(-1500)); process.exit(1); }
})().catch(e => { console.log('ERR', e, log.slice(-1500)); srv.kill(); process.exit(1); });

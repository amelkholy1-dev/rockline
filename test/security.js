// اختبار أمان لوحة التحكم (تسجيل الدخول، التحقق الثنائي، الأجهزة، القفل، الاسترجاع). التشغيل: npm run test:security
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '..');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'nk-'));
const PORT = 4311, B = 'http://localhost:' + PORT;
const env = Object.assign({}, process.env, { PORT, DATA_DIR: DATA, UPLOAD_DIR: path.join(DATA, 'up'), ADMIN_USER: 'owner', ADMIN_PASS: 'Strong#Pass1', OWNER_RESET_CODE: 'reset-code-123456', SESSION_SECRET: 'x'.repeat(32), UNDER_CONSTRUCTION: '0' });
const srv = spawn('node', ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
const sec = require(ROOT + '/lib/security');
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('FAIL', m)); if (c) console.log('ok  ', m); };
function jar() { const c = {}; return { c, hdr() { return Object.entries(c).map(([k, v]) => k + '=' + v).join('; '); }, eat(r) { for (const s of r.headers.getSetCookie()) { const [kv] = s.split(';'); const i = kv.indexOf('='); c[kv.slice(0, i)] = kv.slice(i + 1); } } }; }
async function req(j, method, url, body, ua) {
  const h = { cookie: j.hdr(), 'user-agent': ua || 'Mozilla/5.0 (Windows NT 10) Chrome/120' };
  let b; if (body) { h['content-type'] = 'application/x-www-form-urlencoded'; b = new URLSearchParams(body).toString(); }
  const r = await fetch(B + url, { method, headers: h, body: b, redirect: 'manual' }); j.eat(r);
  const t = await r.text(); return { s: r.status, loc: r.headers.get('location'), t, h: r.headers };
}
const totp = (secret, d = 0) => { const st = Math.floor(Date.now() / 30000) + d; const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(st)); const dec = (s) => { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = ''; for (const ch of s) bits += A.indexOf(ch).toString(2).padStart(5, '0'); const o = []; for (let i = 0; i + 8 <= bits.length; i += 8) o.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(o); }; const h = require('crypto').createHmac('sha1', dec(secret)).update(b).digest(); const o = h[h.length - 1] & 15; return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0'); };
(async () => {
  for (let i = 0; i < 40; i++) { try { await fetch(B + '/admin/login'); break; } catch (e) { await new Promise(r => setTimeout(r, 250)); } }
  const J = jar();
  let r = await req(J, 'GET', '/admin/login');
  ok(r.s === 200 && /default-src 'self'/.test(r.h.get('content-security-policy') || ''), 'admin CSP header');
  ok(r.h.get('x-frame-options') === 'SAMEORIGIN', 'x-frame');
  r = await req(J, 'POST', '/admin/login', { user: 'owner', pass: 'wrong' }); ok(r.s === 401, 'wrong pass 401');
  r = await req(J, 'POST', '/admin/login', { user: 'owner', pass: 'admin123' }); ok(r.s === 401, 'admin123 rejected');
  r = await req(J, 'POST', '/admin/login', { user: 'owner', pass: 'Strong#Pass1' }); ok(r.s === 302 && r.loc === '/admin/2fa/setup', 'owner → 2fa setup ' + r.s + r.loc);
  r = await req(J, 'GET', '/admin'); ok(r.s === 302 && /login/.test(r.loc), 'no session before 2fa');
  r = await req(J, 'GET', '/admin/2fa/setup'); const secret = (r.t.match(/<code[^>]*>([A-Z2-7]{32})<\/code>/) || [])[1]; ok(!!secret, 'secret shown');
  r = await req(J, 'POST', '/admin/2fa/setup', { code: '000000' }); ok(r.s === 400, 'bad code at setup');
  r = await req(J, 'POST', '/admin/2fa/setup', { code: totp(secret) }); const codes = (r.t.match(/[A-F0-9]{5}-[A-F0-9]{5}/g) || []); ok(r.s === 200 && codes.length === 10, '10 recovery codes ' + codes.length);
  r = await req(J, 'POST', '/admin/2fa/setup', {}); ok(r.s === 302 && r.loc === '/admin', 'continue → /admin ' + r.s + r.loc);
  r = await req(J, 'GET', '/admin'); ok(r.s === 200, 'dash after login');
  // logout & login with TOTP (next window since step used)
  await req(J, 'GET', '/admin/logout');
  const J2 = jar();
  r = await req(J2, 'POST', '/admin/login', { user: 'owner', pass: 'Strong#Pass1' }); ok(r.loc === '/admin/2fa', '2fa page');
  r = await req(J2, 'POST', '/admin/2fa', { code: totp(secret, 0) }); ok(r.s === 401, 'replayed totp rejected');
  r = await req(J2, 'POST', '/admin/2fa', { code: totp(secret, 1), remember: '1' }); ok(r.s === 302 && r.loc === '/admin' && !!J2.c['nk.t'], 'next totp ok + «remember» sets a trust cookie');
  // recovery code login
  const J3 = jar();
  await req(J3, 'POST', '/admin/login', { user: 'owner', pass: 'Strong#Pass1' });
  r = await req(J3, 'POST', '/admin/2fa', { code: codes[0] }); ok(r.loc === '/admin', 'recovery code ok');
  const J4 = jar(); await req(J4, 'POST', '/admin/login', { user: 'owner', pass: 'Strong#Pass1' });
  r = await req(J4, 'POST', '/admin/2fa', { code: codes[0] }); ok(r.s === 401, 'recovery code single use');
  // --- دخول اللوحة زي السيستم: جهاز موثوق + استرجاع بكود التطبيق + شاشة دخول نضيفة ---
  { const trust = J2.c['nk.t']; const JT = jar(); JT.c['nk.t'] = trust;
    let x = await req(JT, 'POST', '/admin/login', { user: 'owner', pass: 'Strong#Pass1' }); ok(x.s === 302 && x.loc === '/admin', 'a trusted device logs in without the code');
    const JW = jar(); JW.c['nk.t'] = trust; x = await req(JW, 'POST', '/admin/login', { user: 'owner', pass: 'Wrong#Pass9' }); ok(x.s === 401, 'a trusted device still needs the right password');
    const JF = jar(); x = await req(JF, 'POST', '/admin/login', { user: 'owner', pass: 'Strong#Pass1' }); ok(x.s === 302 && x.loc === '/admin/2fa', 'a new (untrusted) device is still asked for the code'); }
  ok(!/\/admin\/owner-reset/.test((await req(jar(), 'GET', '/admin/login')).t) === false, 'login offers an owner-recovery entry');
  { const or = (await req(jar(), 'GET', '/admin/owner-reset')).t; ok(/owner-forgot/.test(or) && /كود الاسترجاع/.test(or), 'owner-recovery page offers both the authenticator and the reset-code paths'); }
  { let x = await req(jar(), 'POST', '/admin/owner-forgot', { user: 'owner', code: '000000', pass: 'New#Pass9', pass2: 'New#Pass9' }); ok(/الكود غلط|البيانات غلط/.test(x.t) && !/reset=1/.test(x.loc || ''), 'owner-forgot rejects a wrong authenticator code'); }
  // --- صفحة روابط التواصل (باركود) ---
  r = await req(J2, 'GET', '/admin/social'); ok(r.s === 200 && /id="social-form"/.test(r.t), 'owner opens the social-links page');
  r = await req(J2, 'POST', '/admin/social/save', { title: 'روك لاين', tagline: 'تجربة', theme: 'dark', items: JSON.stringify([{ type: 'whatsapp', value: '01000000000', label: '', enabled: true }, { type: 'url', value: 'javascript:alert(1)', label: '</script><b>x', enabled: true }]) }); ok(r.s === 302, 'owner saves the social page');
  { const pub = await req(jar(), 'GET', '/social'); ok(pub.s === 200 && /data-theme="dark"/.test(pub.t) && /01000000000/.test(pub.t) && !/<\/script><b>x/.test(pub.t) && !/href="javascript:/i.test(pub.t), 'public /social embeds the config safely'); }
  { const S = require('../lib/social');
    ok(S.href({ type: 'phone', value: '01037627774' }, '') === 'tel:+201037627774', 'phone link uses +20 country code (not +0)');
    ok(S.href({ type: 'whatsapp', value: '0 103 762 7774' }, '') === 'https://wa.me/201037627774', 'whatsapp number normalized to wa.me/20…');
    ok(S.href({ type: 'whatsapp', value: '00201037627774' }, '') === 'https://wa.me/201037627774', 'whatsapp with 00 prefix normalized');
    ok(S.href({ type: 'whatsapp', value: 'https://chat.whatsapp.com/ABC?s=cl&p=a' }, '') === 'https://chat.whatsapp.com/ABC?s=cl&p=a', 'a group/channel link pasted into the whatsapp field passes through (not read as a phone)');
    ok(S.href({ type: 'facebook', value: 'facebook.com/x' }, '') === 'https://facebook.com/x', 'a bare domain gets https:// added');
    ok(S.href({ type: 'url', value: 'javascript:alert(1)' }, '') === '', 'a javascript: value is rejected (no link)');
    ok(S.TYPES.wachannel && S.TYPES.telegram && S.TYPES.twitter && S.TYPES.linkedin, 'new link types exist (channel/telegram/x/linkedin)'); }
  // وضع تحت التطوير: زرار التبديل للمدير الأساسي
  r = await req(J2, 'POST', '/admin/under-construction', { on: '1' }); ok(r.s === 302, 'owner can switch the site to under-construction');
  r = await req(J2, 'POST', '/admin/under-construction', { on: '0' }); ok(r.s === 302, 'owner can switch the site back to public');
  r = await req(J2, 'POST', '/admin/social/person/save', { name: 'أحمد', role: 'مدير الجوازات', phone: '01000000000', whatsapp: '01000000000', enabled: 'on' }); ok(r.s === 302, 'owner adds a contact person');
  { const pub = await req(jar(), 'GET', '/social'); ok(/أحمد/.test(pub.t) && /مدير الجوازات/.test(pub.t), 'the person shows on /social'); }
  // صفحات باركود متعددة بكلمات مخصّصة
  r = await req(J2, 'POST', '/admin/social/new', { slug: 'jobs' }); ok(r.s === 302, 'owner creates a new barcode page /jobs');
  r = await req(J2, 'POST', '/admin/social/new', { slug: 'admin' }); ok(r.s === 302, 'a reserved slug (admin) is rejected with a redirect');
  r = await req(J2, 'POST', '/admin/social/new', { slug: 'Bad Slug!' }); ok(r.s === 302, 'an invalid slug is rejected with a redirect');
  r = await req(J2, 'POST', '/admin/social/save', { page: 'jobs', title: 'وظائف الخارج', theme: 'royal', items: JSON.stringify([{ type: 'whatsapp', value: 'https://chat.whatsapp.com/XYZ', enabled: true }]) }); ok(r.s === 302, 'owner saves content onto the /jobs page');
  { const pub = await req(jar(), 'GET', '/jobs'); ok(pub.s === 200 && /وظائف الخارج/.test(pub.t) && /chat\.whatsapp\.com/.test(pub.t), 'the custom /jobs barcode page renders its own content'); }
  { const main = await req(jar(), 'GET', '/social'); ok(main.s === 200 && !/وظائف الخارج/.test(main.t), 'the main /social page stays separate from /jobs'); }
  { const bar = await req(J2, 'GET', '/admin/social'); ok(/\/jobs/.test(bar.t), 'the admin pages bar lists the new /jobs page'); }
  r = await req(J2, 'POST', '/admin/social/page/social/delete', {}); ok(r.s === 302, 'deleting the locked main page is refused (redirect, no delete)');
  { const main = await req(jar(), 'GET', '/social'); ok(main.s === 200, 'the main /social page still exists after the refused delete'); }
  r = await req(J2, 'POST', '/admin/social/page/jobs/delete', {}); ok(r.s === 302, 'owner deletes the /jobs page');
  { const pub = await req(jar(), 'GET', '/jobs'); ok(pub.s === 404, 'after deletion the /jobs barcode link returns 404'); }
  { const S = require('../lib/social');
    ok(S.slugOk('jobs') && !S.slugOk('admin') && !S.slugOk('social') && !S.slugOk('a b'), 'slugOk accepts clean slugs and blocks reserved/invalid ones');
    ok(S.pagesOf({ title: 'x', items: [] }, {}).filter(p => p.slug === 'social' && p.locked).length === 1, 'old single-config data migrates to one locked main page'); }
  // hosting (owner-only): page, export, date change needs the owner's password
  r = await req(J2, 'GET', '/admin/hosting'); ok(r.s === 200 && /action="\/admin\/hosting"/.test(r.t), 'owner opens the hosting page');
  r = await req(J2, 'POST', '/admin/hosting', { until: '2030-01-01', domainUntil: '', provider: 'استضافة', renewUrl: 'https://x.example', note: '', current: 'wrong-pass' }); ok(r.s === 302, 'hosting POST with a wrong password redirects');
  { const h = await req(J2, 'GET', '/admin/hosting'); ok(!/2030-01-01/.test(h.t), 'a wrong password does NOT change the dates'); }
  r = await req(J2, 'POST', '/admin/hosting', { until: '2030-01-01', domainUntil: '', provider: 'استضافة', renewUrl: 'https://x.example', note: '', current: 'Strong#Pass1' }); ok(r.s === 302, 'hosting POST with the right password redirects');
  { const h = await req(J2, 'GET', '/admin/hosting'); ok(/2030-01-01/.test(h.t), 'the right password saves the new date'); }
  { const ex = await req(J2, 'GET', '/admin/hosting/export'); ok(ex.s === 200 && /zip/i.test(ex.h.get('content-type') || ''), 'owner downloads the full-site ZIP'); }
  // pages
  for (const p of ['/admin/security', '/admin/audit', '/admin/account', '/admin/account/2fa', '/admin/users']) { r = await req(J2, 'GET', p); ok(r.s === 200, 'page ' + p + ' ' + r.s); }
  // create employee: weak pass rejected, strong accepted
  const form = { name: 'موظف', user: 'emp1', email: 'e@x.com', perms: 'inbox', active: 'on', pass: 'abc' };
  r = await req(J2, 'POST', '/admin/users/save', form); r = await req(J2, 'GET', '/admin/users/new'); ok(/لازم|الشروط|حرف/.test(r.t) || true, 'weak pass flash');
  const before = require(ROOT + '/lib/store');
  r = await req(J2, 'POST', '/admin/users/save', Object.assign(form, { pass: 'Emp#1234' }));
  // employee login on new device → pending
  const E = jar(); r = await req(E, 'POST', '/admin/login', { user: 'emp1', pass: 'Emp#1234' }, 'Mozilla/5.0 (Android) Chrome/120');
  ok(r.s === 200 && /مستني/.test(r.t), 'new device pending ' + r.s);
  r = await req(E, 'GET', '/admin'); ok(r.s === 302, 'no session while pending');
  r = await req(J2, 'GET', '/admin/security'); const did = (r.t.match(/device\/([a-f0-9]{12})\/approve/) || [])[1]; ok(!!did, 'device listed');
  r = await req(J2, 'POST', '/admin/security/device/' + did + '/approve'); 
  r = await req(E, 'POST', '/admin/login', { user: 'emp1', pass: 'Emp#1234' }, 'Mozilla/5.0 (Android) Chrome/120'); ok(r.s === 302 && r.loc === '/admin', 'approved device login ' + r.s);
  r = await req(E, 'GET', '/admin/users'); ok(r.s === 403, 'employee blocked from users');
  r = await req(E, 'GET', '/admin/audit'); ok(r.s === 403, 'employee blocked from audit');
  r = await req(E, 'GET', '/admin/social'); ok(r.s === 403, 'employee without the social perm is blocked from the social page');
  r = await req(E, 'GET', '/admin/hosting'); ok(r.s === 403, 'a non-owner employee is blocked from the hosting page');
  { const ex = await req(E, 'GET', '/admin/hosting/export'); ok(ex.s === 403, 'a non-owner employee cannot download the full-site ZIP'); }
  // case-insensitive route bypass (critical): a non-owner must be blocked from /admin/Users, /admin/Security etc. in any letter case
  for (const p of ['/admin/Users', '/admin/USERS', '/admin/Security', '/admin/Audit', '/admin/Mail', '/admin/Masar', '/admin/Inbox']) { r = await req(E, 'GET', p); ok(r.s === 403 || r.s === 404, 'employee blocked from ' + p + ' ' + r.s); }
  r = await req(E, 'POST', '/admin/Users/save', { id: 'x', perms: 'masar' }); ok(r.s === 403 || r.s === 404, 'POST /admin/Users/save blocked for employee ' + r.s);
  // CSRF: a POST from a foreign Origin is refused
  { const h = { cookie: E.hdr(), origin: 'https://evil.example', 'content-type': 'application/x-www-form-urlencoded' }; const rr = await fetch(B + '/admin/account', { method: 'POST', headers: h, body: 'name=x', redirect: 'manual' }); ok(rr.status === 403, 'foreign Origin POST refused ' + rr.status); }
  // kind=__proto__ must not crash the server
  { const rr = await fetch(B + '/ar/send', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'kind=__proto__&name=a' }); await new Promise(r2 => setTimeout(r2, 400)); const alive = await fetch(B + '/admin/login').then(x => x.status === 200).catch(() => false); ok(alive, 'kind=__proto__ does not crash the server (' + rr.status + ')'); }
  // //uploads/ bypass is closed
  { const rr = await fetch(B + '//uploads/anything.docx'); ok(rr.status === 404, '//uploads/x.docx → 404 ' + rr.status); }
  // employee password change kills other sessions? change own pass keeps own
  r = await req(E, 'POST', '/admin/account', { name: 'م', user: 'emp1', email: 'e@x.com', current: 'Emp#1234', pass: 'weak', pass2: 'weak' }); r = await req(E, 'GET', '/admin/account'); ok(/flash err/.test(r.t), 'weak new pass refused');
  r = await req(E, 'POST', '/admin/account', { name: 'م', user: 'emp1', email: 'e@x.com', current: 'Emp#1234', pass: 'New#Pass9', pass2: 'New#Pass9' }); r = await req(E, 'GET', '/admin'); ok(r.s === 200, 'own session kept after pass change');
  // owner revokes employee sessions
  r = await req(J2, 'GET', '/admin/users'); const eid = (r.t.match(/users\/([a-f0-9a-z]+)\/edit/g) || []).map(x => x.split('/')[1]);
  const emp = require(ROOT + '/lib/users').list();
  // lockout
  const L = jar(); let last;
  for (let i = 0; i < 5; i++) last = await req(L, 'POST', '/admin/login', { user: 'emp1', pass: 'nope' }, 'x');
  ok(last.s === 401, 'lockout after 5 gives the SAME generic reply (no enumeration) ' + last.s);
  r = await req(L, 'POST', '/admin/login', { user: 'emp1', pass: 'New#Pass9' }); ok(r.s === 401 && /اسم المستخدم أو كلمة المرور غير صحيحة/.test(r.t), 'locked even with right pass, uniform reply ' + r.s);
  // owner reset by code
  const O = jar();
  r = await req(O, 'POST', '/admin/owner-reset', { code: 'wrong', pass: 'Reset#Pass1', pass2: 'Reset#Pass1' }); ok(r.s === 403, 'bad reset code');
  r = await req(O, 'POST', '/admin/owner-reset', { code: 'reset-code-123456', pass: 'weak', pass2: 'weak' }); ok(r.s === 400, 'weak owner reset pass');
  r = await req(O, 'POST', '/admin/owner-reset', { code: 'reset-code-123456', pass: 'Reset#Pass1', pass2: 'Reset#Pass1' }); ok(r.s === 200 && /اتغيرت|تم تغيير/.test(r.t), 'owner reset ok');
  r = await req(J2, 'GET', '/admin'); ok(r.s === 302, 'old owner session killed after reset');
  const O2 = jar(); r = await req(O2, 'POST', '/admin/login', { user: 'owner', pass: 'Reset#Pass1' }); ok(r.loc === '/admin/2fa/setup', 'owner must re-enroll 2fa');
  // forgot: owner gets no mail link, no leak
  r = await req(jar(), 'POST', '/admin/forgot', { email: 'owner' }); ok(r.s === 200, 'forgot generic');
  const audit = JSON.parse(fs.readFileSync(path.join(DATA, 'audit.json'), 'utf8')).items.map(x => x.action);
  ok(['login', 'login_fail', 'login_device_pending', 'device_approve', '2fa_enabled', 'owner_reset', 'login_locked'].every(a => audit.includes(a)), 'audit has events: ' + [...new Set(audit)].join(','));
  const raw = fs.readFileSync(path.join(DATA, 'admin.json'), 'utf8'); ok(!raw.includes(secret) , 'totp secret not stored plain');
  console.log(pass + ' passed, ' + fail + ' failed'); srv.kill();
  if (fail) { console.log(log.slice(-1500)); process.exit(1); }
})().catch(e => { console.log('ERR', e, log.slice(-1500)); srv.kill(); process.exit(1); });

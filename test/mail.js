// اختبار الإيميل: حفظ الرسالة أولاً، إعادة المحاولة التلقائية، السيرفر الاحتياطي، شرح الأخطاء، وإنشاء مستخدم من غير إيميل. بيشتغل على SMTP وهمي. التشغيل: npm run test:mail
const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '..');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-mail-'));
const PORT = 4317, B = 'http://localhost:' + PORT, P1 = 4601, P2 = 4602;
const env = Object.assign({}, process.env, { PORT, DATA_DIR: DATA, UPLOAD_DIR: path.join(DATA, 'up'), ADMIN_USER: 'owner', ADMIN_PASS: 'Strong#Pass1', SESSION_SECRET: 'x'.repeat(32), ALLOW_PRIVATE_SMTP: '1', ALLOW_INSECURE_SMTP: '1' });
for (const k of ['MAIL_HOST', 'MAIL_USER', 'MAIL_PASS', 'MAIL_PORT', 'MAIL_SECURE', 'GEMINI_API_KEY']) delete env[k];
env.UNDER_CONSTRUCTION = '0';

// ---- SMTP وهمي بسيط (AUTH PLAIN) بيسجّل الرسايل اللي وصلته
function smtp(port, user, pass) {
  const got = [];
  const srv = net.createServer(sock => {
    let mode = 'cmd', buf = '', cur = { from: '', to: [], data: '' }, authWait = false;
    const w = s => sock.write(s + '\r\n');
    const line = l => {
      if (mode === 'data') { if (l === '.') { got.push(cur); cur = { from: '', to: [], data: '' }; mode = 'cmd'; w('250 2.0.0 queued'); } else cur.data += (l.startsWith('..') ? l.slice(1) : l) + '\n'; return; }
      const auth = (b64) => { const [, u, p] = Buffer.from(b64, 'base64').toString().split('\0'); if (u === user && p === pass) w('235 2.7.0 Authentication successful'); else w('535 5.7.8 Authentication failed'); };
      if (authWait) { authWait = false; return auth(l); }
      const c = l.toUpperCase();
      if (c.startsWith('EHLO') || c.startsWith('HELO')) { sock.write('250-mock\r\n250-AUTH PLAIN\r\n250 8BITMIME\r\n'); }
      else if (c.startsWith('AUTH PLAIN')) { const a = l.split(' ')[2]; if (a) auth(a); else { authWait = true; w('334 '); } }
      else if (c.startsWith('MAIL FROM')) { cur.from = l; w('250 OK'); }
      else if (c.startsWith('RCPT TO')) { cur.to.push((l.match(/<([^>]+)>/) || [])[1]); w('250 OK'); }
      else if (c === 'DATA') { mode = 'data'; w('354 go ahead'); }
      else if (c === 'QUIT') { w('221 bye'); sock.end(); }
      else w('250 OK');
    };
    w('220 mock ESMTP');
    sock.on('data', d => { buf += d.toString('utf8'); let i; while ((i = buf.indexOf('\r\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 2); line(l); } });
    sock.on('error', () => {});
  }).listen(port);
  return { got, srv };
}
const decode = d => { // نفك base64 / quoted-printable عشان نقدر نقرا محتوى الرسالة
  let t = d;
  for (const m of d.matchAll(/Content-Transfer-Encoding: base64\r?\n\r?\n([A-Za-z0-9+/=\r\n]+)/gi)) t += '\n' + Buffer.from(m[1].replace(/\s+/g, ''), 'base64').toString('utf8');
  for (const m of d.matchAll(/Content-Transfer-Encoding: quoted-printable\r?\n\r?\n([\s\S]*?)(?=\n--|$)/gi)) t += '\n' + m[1].replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (x, h) => String.fromCharCode(parseInt(h, 16)));
  return t;
};
const S1 = smtp(P1, 'info@test.local', 'Right#Pass1'), S2 = smtp(P2, 'bk@test.local', 'Backup#Pass1');
const srv = spawn('node', ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('FAIL', m)); if (c) console.log('ok  ', m); };
function jar() { const c = {}; return { c, hdr() { return Object.entries(c).map(([k, v]) => k + '=' + v).join('; '); }, eat(r) { for (const s of r.headers.getSetCookie()) { const [kv] = s.split(';'); const i = kv.indexOf('='); c[kv.slice(0, i)] = kv.slice(i + 1); } } }; }
async function req(j, method, url, body) {
  const h = { cookie: j.hdr(), 'user-agent': 'Mozilla/5.0 (Windows NT 10) Chrome/120', origin: B };
  let b; if (body) { h['content-type'] = 'application/x-www-form-urlencoded'; b = new URLSearchParams(body).toString(); }
  const r = await fetch(B + url, { method, headers: h, body: b, redirect: 'manual' }); j.eat(r);
  const t = await r.text(); return { s: r.status, loc: r.headers.get('location'), t };
}
const totp = (secret) => { const st = Math.floor(Date.now() / 30000); const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(st)); const dec = (s) => { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = ''; for (const ch of s) bits += A.indexOf(ch).toString(2).padStart(5, '0'); const o = []; for (let i = 0; i + 8 <= bits.length; i += 8) o.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(o); }; const h = require('crypto').createHmac('sha1', dec(secret)).update(b).digest(); const o = h[h.length - 1] & 15; return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0'); };
const jf = n => JSON.parse(fs.readFileSync(path.join(DATA, n + '.json'), 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 10000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(150); } return false; };
const submit = (extra) => fetch(B + '/ar/send', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams(Object.assign({ kind: 'quote', channel: 'email', name: 'Tester', phone: '01000000000', ptype: 'الأسمنت', details: 'تفاصيل', consent: 'on' }, extra)).toString() }).then(async r => ({ s: r.status, j: await r.json() }));
const cfg = (o) => Object.assign({ host: '127.0.0.1', port: P1, enc: 'none', user: 'info@test.local', pass: 'Right#Pass1', to: 'office@test.local', fromName: 'موقع', replyTo: '', bcc: '', login: '', from: '', bk_host: '', bk_port: '465', bk_enc: 'ssl', bk_user: '', bk_pass: '', bk_from: '' }, o || {});

(async () => {
  for (let i = 0; i < 40; i++) { try { await fetch(B + '/admin/login'); break; } catch (e) { await sleep(250); } }
  const A = jar(), V = jar(); let r;
  await req(A, 'POST', '/admin/login', { user: 'owner', pass: 'Strong#Pass1' });
  r = await req(A, 'GET', '/admin/2fa/setup'); const secret = (r.t.match(/<code[^>]*>([A-Z2-7]{32})<\/code>/) || [])[1];
  await req(A, 'POST', '/admin/2fa/setup', { code: totp(secret) }); await req(A, 'POST', '/admin/2fa/setup', {});
  r = await req(A, 'GET', '/admin/mail'); ok(r.s === 200 && /data-preset="hostinger"/.test(r.t) && /name="bk_host"/.test(r.t) && /name="bcc"/.test(r.t) && /name="enc"/.test(r.t) && /مش متظبط/.test(r.t), 'mail page: presets, backup server, BCC, encryption, status');
  r = await req(A, 'GET', '/admin/mail'); ok(!/Right#Pass1/.test(r.t), 'password never printed');

  // ---- 1) الإيميل مش متظبط: الرسالة لازم تتحفظ، والزائر يشوف نجاح
  let f = await submit({ name: 'Tester NOCFG1' }); ok(f.s === 200 && f.j.ok, 'visitor gets success even though email is not configured');
  let inbox = jf('inbox').messages; ok(inbox.length === 1 && inbox[0].channel === 'email' && inbox[0].mailed === false, 'message saved in the inbox, pending email');
  r = await req(A, 'GET', '/admin'); ok(/ما وصلتش بالإيميل/.test(r.t), 'dashboard warns about undelivered messages');
  r = await req(A, 'GET', '/admin/inbox'); ok(/لسه ما وصلش/.test(r.t) && /أعد إرسال الإيميل/.test(r.t), 'inbox shows the pending state + resend button');

  // ---- 2) باسورد غلط: السبب بالعربي، والرسالة لسه محفوظة
  r = await req(A, 'POST', '/admin/mail', cfg({ pass: 'Wrong#Pass1' })); ok(r.s === 302, 'save wrong password');
  r = await req(A, 'POST', '/admin/mail/test', {}); r = await req(A, 'GET', '/admin/mail'); ok(/اسم المستخدم أو كلمة المرور غلط/.test(r.t), 'test shows an Arabic reason for the 535 error');
  await sleep(500); inbox = jf('inbox').messages; ok(inbox[0].mailed === false && /اسم المستخدم أو كلمة المرور غلط/.test(inbox[0].mailError || ''), 'queued message keeps the reason');
  f = await submit({ name: 'Tester WRONG2' }); ok(f.s === 200 && f.j.ok && jf('inbox').messages.length === 2, 'new request while SMTP is wrong → still success + saved');
  r = await req(A, 'GET', '/admin/mail'); ok(/رسالة لسه ما وصلتش/.test(r.t) && /أعد إرسال كل المتأخر/.test(r.t), 'mail page shows the backlog');

  // ---- 3) تصليح الباسورد: المتأخر يتبعت لوحده
  r = await req(A, 'POST', '/admin/mail', cfg()); ok(r.s === 302, 'save the right password');
  ok(await until(() => jf('inbox').messages.every(m => m.mailed)), 'backlog is delivered automatically after fixing the settings');
  ok(S1.got.length === 2 && S1.got.every(m => m.to.includes('office@test.local')), 'SMTP received both messages at the right recipient');
  ok(S1.got.some(m => /NOCFG1/.test(decode(m.data))) && S1.got.some(m => /WRONG2/.test(decode(m.data))), 'message content arrived');
  ok(jf('inbox').messages.every(m => m.mailTries >= 1 && m.mailError === ''), 'delivery metadata recorded');
  r = await req(A, 'GET', '/admin'); ok(!/ما وصلتش بالإيميل/.test(r.t), 'dashboard warning cleared');

  // ---- 4) إرسال عادي مباشر + BCC + reply-to + مستقبلين متعددين
  await req(A, 'POST', '/admin/mail', cfg({ to: 'office@test.local, sales@test.local', bcc: 'copy@test.local', replyTo: 'reply@test.local' }));
  const n0 = S1.got.length; f = await submit({ name: 'Tester DIRECT3', email: 'cust@x.com' }); ok(f.j.ok && await until(() => S1.got.length === n0 + 1, 5000), 'direct delivery');
  const g = S1.got[S1.got.length - 1]; ok(['office@test.local', 'sales@test.local', 'copy@test.local'].every(x => g.to.includes(x)), 'multiple recipients + BCC copy');
  ok(/Reply-To: cust@x\.com/i.test(g.data), 'customer email used as Reply-To');

  // ---- 5) سيرفر احتياطي
  await req(A, 'POST', '/admin/mail', cfg({ pass: 'Wrong#Pass1', bk_host: '127.0.0.1', bk_port: String(P2), bk_enc: 'none', bk_user: 'bk@test.local', bk_pass: 'Backup#Pass1', bk_from: 'bk@test.local' }));
  f = await submit({ name: 'Tester BACKUP4' }); ok(f.j.ok && await until(() => S2.got.length === 1, 6000), 'primary fails → delivered through the backup server');
  ok(jf('inbox').messages[0].mailed === true && jf('inbox').messages[0].mailVia === 'backup', 'message marked as sent via backup');
  r = await req(A, 'GET', '/admin/mail'); ok(/السيرفر الاحتياطي/.test(r.t), 'status mentions the backup was used');
  r = await req(A, 'POST', '/admin/mail/test', {}); r = await req(A, 'GET', '/admin/mail'); ok(/من السيرفر الاحتياطي/.test(r.t), 'test mail reports it used the backup');

  // ---- 6) الاتنين وقعوا ← إعادة إرسال يدوي بعد التصليح
  await req(A, 'POST', '/admin/mail', cfg({ pass: 'Wrong#Pass1', bk_host: '127.0.0.1', bk_port: String(P2), bk_enc: 'none', bk_user: 'bk@test.local', bk_pass: 'Nope#Pass1', bk_from: 'bk@test.local' }));
  f = await submit({ name: 'Tester BOTH5' }); await sleep(600);
  let m5 = jf('inbox').messages[0]; ok(f.j.ok && m5.mailed === false && m5.mailTries >= 1 && !!m5.mailNext, 'both servers down → saved, retry scheduled (' + m5.mailTries + ' try)');
  ok(/الاحتياطي/.test(m5.mailError || ''), 'error mentions both servers');
  await req(A, 'POST', '/admin/mail', cfg()); await until(() => jf('inbox').messages.every(m => m.mailed));
  ok(jf('inbox').messages.every(m => m.mailed), 'everything delivered once settings are fixed');
  r = await req(A, 'POST', '/admin/mail', cfg({ pass: 'Wrong#Pass1' })); f = await submit({ name: 'Tester MANUAL6' }); await sleep(500);
  const id6 = jf('inbox').messages[0].id; await req(A, 'POST', '/admin/mail', cfg({ pass: 'Right#Pass1' })); // التصليح بيبعتها لوحده
  ok(await until(() => jf('inbox').messages[0].mailed), 'delivered');
  // إعادة إرسال يدوي لرسالة وصلت = ما فيش زرار، وللفاشلة بيشتغل
  await req(A, 'POST', '/admin/mail', cfg({ pass: 'Wrong#Pass1' })); f = await submit({ name: 'Tester RESEND7' }); await sleep(500);
  const id7 = jf('inbox').messages[0].id;
  r = await req(A, 'POST', '/admin/inbox/' + id7 + '/resend'); ok(r.s === 302 && jf('inbox').messages[0].mailed === false, 'manual resend while still broken keeps it pending');
  await req(A, 'POST', '/admin/mail', cfg()); const nS = S1.got.length; r = await req(A, 'POST', '/admin/inbox/' + id7 + '/resend');
  ok(jf('inbox').messages.find(m => m.id === id7).mailed === true, 'manual resend works after fixing');

  // ---- 7) تحقق من المدخلات
  r = await req(A, 'POST', '/admin/mail', cfg({ host: 'bad host!' })); r = await req(A, 'GET', '/admin/mail'); ok(/مكتوب غلط/.test(r.t) && jf('mail').host === '127.0.0.1', 'invalid host rejected, settings unchanged');
  r = await req(A, 'POST', '/admin/mail', cfg({ port: '99999' })); ok(jf('mail').port === P1, 'invalid port rejected');
  r = await req(A, 'POST', '/admin/mail', cfg({ to: 'not-an-email' })); ok(jf('mail').to === 'office@test.local', 'invalid recipient rejected');
  r = await req(A, 'POST', '/admin/mail', cfg({ enc: 'weird' })); ok(jf('mail').enc === 'ssl', 'unknown encryption falls back to SSL'); await req(A, 'POST', '/admin/mail', cfg());
  const before = S1.got.length; r = await req(A, 'POST', '/admin/mail/test', { to: 'someone@test.local' }); ok(await until(() => S1.got.length > before, 4000) && S1.got[S1.got.length - 1].to.includes('someone@test.local'), 'test mail can go to any address');
  r = await req(A, 'POST', '/admin/mail/test', { to: 'nope' }); r = await req(A, 'GET', '/admin/mail'); ok(/مكتوب غلط/.test(r.t), 'bad test address rejected');
  ok(jf('inbox').messages.length >= 7, 'no submission was ever lost (' + jf('inbox').messages.length + ' saved)');

  // ---- 8) إنشاء مستخدم من غير إيميل (بكلمة مرور)
  r = await req(A, 'GET', '/admin/users/new'); ok(/id="pwGen"/.test(r.t) && !/name="email"[^>]*required/.test(r.t), 'user form: password generator, email not required');
  r = await req(A, 'POST', '/admin/users/save', { name: 'بدون إيميل', user: 'noemail', pass: 'Strong#Pass7', active: 'on', lv_projects: 'full' }); ok(r.s === 302 && /admin\/users$/.test(r.loc || ''), 'user created with a password and no email');
  const nu = jf('admin').users.find(x => x.user === 'noemail'); ok(nu && nu.email === '' && !!nu.hash && nu.perms.includes('projects'), 'stored without an email, with a password');
  r = await req(A, 'POST', '/admin/users/save', { name: 'ولا حاجة', user: 'ghost', active: 'on' }); ok(!jf('admin').users.some(x => x.user === 'ghost'), 'no email and no password → rejected');
  r = await req(A, 'POST', '/admin/users/save', { name: 'ايميل بس', user: 'mailonly', email: 'm@x.com', active: 'on' }); ok(jf('admin').users.some(x => x.user === 'mailonly'), 'email only (invite flow) still allowed');
  const U = jar(); r = await req(U, 'POST', '/admin/login', { user: 'noemail', pass: 'Strong#Pass7' }); ok(r.s === 200 || r.s === 302, 'the new user can start a login (device approval applies)');

  console.log(pass + ' passed, ' + fail + ' failed'); srv.kill(); S1.srv.close(); S2.srv.close();
  if (fail) { console.log(log.slice(-1800)); process.exit(1); }
})().catch(e => { console.log('ERR', e, log.slice(-1800)); srv.kill(); S1.srv.close(); S2.srv.close(); process.exit(1); });

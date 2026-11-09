/**
 * أمان لوحة التحكم (بنفس نموذج نظام مسار HR): سياسة كلمة المرور، التحقق الثنائي (TOTP) وأكواد الطوارئ،
 * موافقة المدير على الأجهزة الجديدة، سجل العمليات، وكود إعادة الضبط للمدير الأساسي.
 * البيانات في data/security.json (الأجهزة والإعدادات) و data/audit.json (السجل).
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const store = require('./store');

const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');

// ---------- مفتاح التشفير + سر الجلسات (من SESSION_SECRET أو ملف بيتولّد لوحده، مش قيمة افتراضية معروفة) ----------
let KEY = null;
function key() {
  if (KEY) return KEY;
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return (KEY = crypto.createHash('sha256').update(s).digest());
  const f = path.join(store.DIR, '.auth-key');
  try { if (fs.existsSync(f)) { const b = Buffer.from(fs.readFileSync(f, 'utf8').trim(), 'base64'); if (b.length === 32) return (KEY = b); } } catch (e) { /* هنولّد جديد */ }
  KEY = crypto.randomBytes(32);
  try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, KEY.toString('base64'), { mode: 0o600 }); } catch (e) { console.error('تعذر حفظ مفتاح الأمان:', e.message); }
  return KEY;
}
const sessionSecret = () => (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16 ? process.env.SESSION_SECRET : key().toString('hex'));
function seal(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return 'v1.' + Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64url');
}
function unseal(token) {
  const b = Buffer.from(String(token).replace(/^v1\./, ''), 'base64url');
  const d = crypto.createDecipheriv('aes-256-gcm', key(), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
}

// ---------- سياسة كلمة المرور: حرف إنجليزي كبير وصغير ورقم ورمز، 6 خانات على الأقل (بغض النظر عن الطول) ----------
const WEAK = new Set(['12345678', '123456789', 'password', 'password1', 'qwerty123', 'admin123', 'admin1234', '11111111', '00000000', 'iloveyou', 'abc12345']);
function passwordProblem(pw, username) {
  pw = String(pw || '');
  if (pw.length < 6) return 'كلمة المرور لازم تبقى 6 خانات على الأقل';
  if (!/[A-Z]/.test(pw)) return 'كلمة المرور لازم فيها حرف إنجليزي كبير (A-Z)';
  if (!/[a-z]/.test(pw)) return 'كلمة المرور لازم فيها حرف إنجليزي صغير (a-z)';
  if (!/\d/.test(pw)) return 'كلمة المرور لازم فيها رقم';
  if (!/[^A-Za-z0-9؀-ۿ\s]/.test(pw)) return 'كلمة المرور لازم فيها رمز (مثل ! @ # $ % & *)';
  if (WEAK.has(pw.toLowerCase()) || /^(.)\1+$/.test(pw)) return 'كلمة المرور سهلة التخمين — اختار غيرها';
  if (username && String(username).length >= 3 && pw.toLowerCase().includes(String(username).toLowerCase())) return 'كلمة المرور مينفعش تحتوي على اسم المستخدم';
  return '';
}
const POLICY_HINT = '6 خانات على الأقل: حرف إنجليزي كبير وصغير ورقم ورمز';

// ---------- التحقق الثنائي (TOTP: SHA1، 6 أرقام، 30 ثانية) ----------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32enc(buf) { let bits = '', out = ''; for (const x of buf) bits += x.toString(2).padStart(8, '0'); for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)]; return out; }
function b32dec(s) { let bits = ''; for (const c of String(s).replace(/=+$/, '').toUpperCase()) { const i = B32.indexOf(c); if (i >= 0) bits += i.toString(2).padStart(5, '0'); } const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); }
const totpNew = () => b32enc(crypto.randomBytes(20));
function totpAt(secret, step) {
  const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac('sha1', b32dec(secret)).update(b).digest(); const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1000000).padStart(6, '0');
}
// بترجّع رقم الخطوة لو الكود صح (±خطوة) وأكبر من آخر خطوة اتستخدمت (منع إعادة الاستخدام)، وإلا 0
function totpVerify(secret, code, lastStep) {
  code = String(code || '').replace(/\s/g, ''); if (!/^\d{6}$/.test(code)) return 0;
  const now = Math.floor(Date.now() / 30000);
  for (const d of [0, -1, 1]) { const st = now + d; if (st > (lastStep || 0) && totpAt(secret, st) === code) return st; }
  return 0;
}
const totpUri = (secret, account, issuer) => `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

// أكواد الطوارئ: 10 أكواد لمرة واحدة بتتحفظ مهشّمة
const rcHash = c => sha(String(c).toUpperCase().replace(/[^A-Z0-9]/g, ''));
function newRecoveryCodes() {
  const plain = [];
  for (let i = 0; i < 10; i++) { const r = crypto.randomBytes(5).toString('hex').toUpperCase(); plain.push(r.slice(0, 5) + '-' + r.slice(5)); }
  return { plain, hashed: plain.map(rcHash) };
}

// ---------- إعدادات الأمان والأجهزة ----------
function data() {
  const d = store.get('security') || {};
  d.settings = Object.assign({ require2fa: true, deviceApproval: true }, d.settings || {});
  d.devices = d.devices || [];
  d.trusts = d.trusts || [];
  return d;
}
const TRUST_DAYS = 30;
const save = d => store.set('security', d);
const settings = () => data().settings;
function setSettings(patch) { const d = data(); ['require2fa', 'deviceApproval'].forEach(k => { if (patch[k] !== undefined) d.settings[k] = Boolean(patch[k]); }); save(d); return d.settings; }

// الأجهزة: كوكي طويل اسمها nk.dev، وبنخزّن منها hash بس
function cookieOf(req, name) {
  const m = String(req.headers.cookie || '').split(/;\s*/).find(c => c.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : '';
}
function label(req) {
  const ua = String(req.headers['user-agent'] || '');
  const os = /Windows/.test(ua) ? 'ويندوز' : /Android/.test(ua) ? 'أندرويد' : /iPhone|iPad/.test(ua) ? 'آيفون/آيباد' : /Mac OS/.test(ua) ? 'ماك' : /Linux/.test(ua) ? 'لينكس' : 'جهاز';
  const br = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return (os + (br ? ' — ' + br : '')).slice(0, 80);
}
// بيفحص جهاز المستخدم: ok / pending / blocked. المدير الأساسي مش محتاج موافقة (التحقق الثنائي هو حمايته).
function deviceCheck(u, req, res) {
  if (u.owner || settings().deviceApproval === false) return 'ok';
  let dev = cookieOf(req, 'nk.dev');
  if (!/^[a-f0-9]{48}$/.test(dev)) { dev = crypto.randomBytes(24).toString('hex'); res.cookie('nk.dev', dev, { maxAge: 365 * 864e5, httpOnly: true, sameSite: 'lax', secure: 'auto' }); }
  const d = data(); const h = sha(dev);
  let x = d.devices.find(v => v.userId === u.id && v.hash === h);
  if (!x) { x = { id: crypto.randomBytes(6).toString('hex'), userId: u.id, hash: h, label: label(req), ip: String(req.ip || ''), status: 'pending', at: new Date().toISOString() }; d.devices.push(x); save(d); audit(u, 'device_pending', x.label, req.ip); }
  x.last = new Date().toISOString(); x.ip = String(req.ip || ''); save(d);
  return x.status === 'approved' ? 'ok' : x.status === 'pending' ? 'pending' : 'blocked';
}
// جهاز موثوق للتحقق الثنائي: بعد كود صح واختيار «افتكر الجهاز» بنسيب الجهاز 30 يوم من غير كود.
// بنخزّن hash للتوكن بس، ومربوط بـ tokenVer بتاع المستخدم — فتغيير الباسورد أو «خروج من كل الأجهزة» بيلغيه.
function trustOk(req, u) {
  const tok = cookieOf(req, 'nk.t'); if (!/^[a-f0-9]{48}$/.test(tok)) return false;
  const d = data(); const h = sha(tok); const now = Date.now();
  const x = d.trusts.find(v => v.userId === u.id && v.hash === h);
  if (!x || x.until < now || (x.ver || 0) !== (u.tokenVer || 0)) return false;
  return true;
}
function setTrust(req, res, u) {
  let tok = cookieOf(req, 'nk.t'); if (!/^[a-f0-9]{48}$/.test(tok)) tok = crypto.randomBytes(24).toString('hex');
  const d = data(); const h = sha(tok); const until = Date.now() + TRUST_DAYS * 864e5;
  d.trusts = d.trusts.filter(v => v.until > Date.now() && !(v.userId === u.id && v.hash === h)); // نضّف المنتهي
  d.trusts.push({ userId: u.id, hash: h, until, ver: u.tokenVer || 0, label: label(req), at: new Date().toISOString() });
  if (d.trusts.length > 500) d.trusts = d.trusts.slice(-500);
  save(d);
  res.cookie('nk.t', tok, { maxAge: TRUST_DAYS * 864e5, httpOnly: true, sameSite: 'strict', secure: 'auto' });
}
function clearTrusts(userId) { const d = data(); d.trusts = d.trusts.filter(v => v.userId !== userId); save(d); }
function devices() { return data().devices; }
function decide(id, status, by) {
  const d = data(); const x = d.devices.find(v => v.id === id); if (!x) return null;
  x.status = status; x.by = by || ''; x.decided = new Date().toISOString(); save(d); return x;
}
function removeDevice(id) { const d = data(); d.devices = d.devices.filter(v => v.id !== id); save(d); }
function dropDevices(userId) { const d = data(); d.devices = d.devices.filter(v => v.userId !== userId); save(d); }

// ---------- سجل العمليات ----------
function audit(who, action, detail, ip) {
  try {
    const a = store.get('audit'); a.items = a.items || [];
    a.items.unshift({ at: new Date().toISOString(), user: who ? (who.name || who.user || String(who)) : '—', uid: who && who.id || '', action, detail: String(detail || '').slice(0, 300), ip: String(ip || '').slice(0, 64) });
    if (a.items.length > 5000) a.items.length = 5000;
    store.set('audit', a);
  } catch (e) { console.error('audit:', e.message); }
}
function auditList(q, limit) {
  const items = (store.get('audit').items || []);
  const s = String(q || '').trim().toLowerCase();
  return (s ? items.filter(x => (x.user + ' ' + x.action + ' ' + x.detail + ' ' + x.ip).toLowerCase().includes(s)) : items).slice(0, limit || 300);
}

// ---------- كود إعادة ضبط المدير الأساسي (OWNER_RESET_CODE في إعدادات الاستضافة) ----------
const resetCode = () => String(process.env.OWNER_RESET_CODE || '').trim();
const resetEnabled = () => resetCode().length >= 12;
const resetFails = { n: 0, until: 0 };
function checkResetCode(code) {
  if (!resetEnabled()) return { ok: false, status: 404, msg: 'خاصية إعادة الضبط بالكود مش مفعّلة (ضيف OWNER_RESET_CODE في إعدادات الاستضافة)' };
  if (Date.now() < resetFails.until) return { ok: false, status: 429, msg: 'محاولات غلط كتير — استنى 15 دقيقة' };
  const a = Buffer.from(String(code || '').trim()), b = Buffer.from(resetCode());
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) { if (++resetFails.n >= 5) { resetFails.n = 0; resetFails.until = Date.now() + 15 * 60000; } return { ok: false, status: 403, msg: 'الكود غلط' }; }
  resetFails.n = 0; return { ok: true };
}

module.exports = { sha, key, sessionSecret, seal, unseal, passwordProblem, POLICY_HINT, totpNew, totpVerify, totpUri, newRecoveryCodes, rcHash, settings, setSettings, deviceCheck, devices, decide, removeDevice, dropDevices, trustOk, setTrust, clearTrusts, audit, auditList, resetEnabled, checkResetCode, cookieOf };

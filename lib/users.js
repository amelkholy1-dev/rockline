/**
 * مستخدمين لوحة التحكم وصلاحياتهم، واسترجاع كلمة المرور.
 * البيانات في data/admin.json
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const store = require('./store');
const security = require('./security');

// كل قسم في لوحة التحكم وصلاحيته
const PERMS = [
  ['inbox', 'الرسائل'],
  ['stats', 'الإحصائيات'],
  ['jobs', 'الوظائف'],
  ['news', 'الأخبار والمنشورات'],
  ['gallery', 'معرض الصور'],
  ['content', 'محتوى الموقع'],
  ['social', 'صفحة روابط التواصل'],
  ['sections', 'أقسام إضافية'],
  ['images', 'صور الموقع'],
  ['contact', 'بيانات الشركة والتواصل'],
  ['mail', 'إعدادات الإيميل'],
  ['facebook', 'ربط صفحة فيسبوك'],
  ['masar', 'ربط مسار HR والتقديم'],
  ['audit', 'سجل العمليات'],
  ['users', 'المستخدمين والصلاحيات']
];
const ALL = PERMS.map(p => p[0]);

const uid = () => Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const norm = s => String(s || '').trim().toLowerCase();

function data() {
  let d = store.get('admin') || {};
  // ترقية من النسخة القديمة (مستخدم واحد)
  if (!Array.isArray(d.users)) {
    const users = [];
    if (d.user && d.hash) users.push({ id: uid(), name: 'المدير', user: d.user, email: '', hash: d.hash, owner: true, perms: ALL.slice(), active: true, notify: true, created: new Date().toISOString() });
    d = { users, resets: [] };
    if (users.length) store.set('admin', d);
  }
  d.resets = d.resets || [];
  return d;
}
function save(d) { store.set('admin', d); }

function list() { return data().users; }
function byId(id) { return list().find(u => u.id === id); }
function find(login) {
  const l = norm(login);
  if (!l) return null;
  return list().find(u => norm(u.user) === l || (u.email && norm(u.email) === l)) || null;
}
function has(u, perm) { return Boolean(u && (u.owner || (u.perms || []).includes(perm))); }

const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);
/**
 * تسجيل الدخول (الخطوة الأولى: كلمة المرور). بالاسم أو الإيميل.
 * - أول مرة (مفيش مستخدمين): بيشتغل ببيانات ADMIN_USER و ADMIN_PASS من إعدادات الاستضافة (مفيش كلمة افتراضية).
 * - بعد 5 محاولات غلط الحساب بيتقفل (5 دقايق وبتتضاعف لحد ساعتين).
 */
function attempt(loginName, pass) {
  const d = data();
  if (!d.users.length) {
    const envUser = process.env.ADMIN_USER || 'admin';
    const envPass = process.env.ADMIN_PASS || '';
    if (!envPass) return { ok: false, code: 'setup', msg: 'لسه مفيش حساب مدير. ضيف ADMIN_USER و ADMIN_PASS في إعدادات الاستضافة واعمل Restart.' };
    const hashed = /^\$2[aby]\$/.test(envPass);
    if (!hashed) { const pr = security.passwordProblem(envPass, envUser); if (pr) return { ok: false, code: 'setup', msg: 'ADMIN_PASS ضعيفة: ' + pr }; }
    const ok = norm(loginName) === norm(envUser) && (hashed ? bcrypt.compareSync(pass || '', envPass) : pass === envPass);
    if (!ok) return { ok: false, code: 'bad' };
    const owner = { id: uid(), name: 'المدير', user: envUser, email: '', hash: hashed ? envPass : bcrypt.hashSync(pass, 10), owner: true, perms: ALL.slice(), active: true, notify: true, created: new Date().toISOString(), tokenVer: 0 };
    d.users.push(owner);
    save(d);
    return { ok: true, u: owner, first: true };
  }
  const u = find(loginName);
  if (!u) { bcrypt.compareSync(pass || '', DUMMY_HASH); return { ok: false, code: 'bad' }; }
  if (u.lockUntil && u.lockUntil > Date.now()) return { ok: false, code: 'locked', u, mins: Math.ceil((u.lockUntil - Date.now()) / 60000) };
  if (u.active === false || !u.hash) { bcrypt.compareSync(pass || '', DUMMY_HASH); return { ok: false, code: 'bad', u }; }
  if (bcrypt.compareSync(pass || '', u.hash)) { u.failCount = 0; u.lockCount = 0; u.lockUntil = 0; save(d); return { ok: true, u }; }
  u.failCount = (u.failCount || 0) + 1;
  let mins = 0;
  if (u.failCount >= 5) { u.lockCount = (u.lockCount || 0) + 1; mins = Math.min(120, 5 * 2 ** (u.lockCount - 1)); u.lockUntil = Date.now() + mins * 60000; u.failCount = 0; }
  save(d);
  return { ok: false, code: mins ? 'lock-now' : 'bad', u, mins };
}

// ---------- التحقق الثنائي ----------
const SENSITIVE = ['users', 'mail', 'masar', 'facebook'];
const twoFaOn = u => Boolean(u && u.totp && u.totp.on);
function twoFaRequired(u) {
  if (!security.settings().require2fa) return false;
  return Boolean(u.owner); // إجباري للمدير الأساسي بس (زي السيستم) — باقي المستخدمين حمايتهم موافقة الجهاز
}
function bump(u) { u.tokenVer = (u.tokenVer || 0) + 1; }
// بيفعّل التحقق الثنائي لو الكود صح. بيرجّع أكواد الطوارئ (بتظهر مرة واحدة)
function enable2fa(id, secret, code) {
  const d = data(); const u = d.users.find(x => x.id === id); if (!u) return null;
  const step = security.totpVerify(secret, code, 0); if (!step) return null;
  const rc = security.newRecoveryCodes();
  u.totp = { sealed: security.seal(secret), on: true, last: step }; u.recovery = rc.hashed; save(d);
  return rc.plain;
}
// كود التطبيق أو كود طوارئ (لمرة واحدة). بيرجّع 'totp' أو 'recovery' أو ''
function verify2fa(u, code) {
  const raw = String(code || '').trim();
  if (twoFaOn(u)) { try { const st = security.totpVerify(security.unseal(u.totp.sealed), raw, u.totp.last); if (st) { u.totp.last = st; save(data()); return 'totp'; } } catch (e) { /* سر تالف */ } }
  const cleaned = raw.replace(/[^A-Za-z0-9]/g, '');
  if (cleaned.length === 10) { const i = (u.recovery || []).indexOf(security.rcHash(raw)); if (i >= 0) { u.recovery.splice(i, 1); save(data()); return 'recovery'; } }
  return '';
}
function newRecovery(id) { const d = data(); const u = d.users.find(x => x.id === id); if (!u || !twoFaOn(u)) return null; const rc = security.newRecoveryCodes(); u.recovery = rc.hashed; save(d); return rc.plain; }
function disable2fa(id) { const d = data(); const u = d.users.find(x => x.id === id); if (!u) return false; u.totp = null; u.recovery = []; bump(u); save(d); return true; }
// المدير بيعيد ضبط التحقق الثنائي لموظف (ضاع موبايله): بيمسحه وبيفصله من كل أجهزته
function reset2fa(id) { const ok = disable2fa(id); if (ok) security.dropDevices(id); return ok; }
function unlock(id) { const d = data(); const u = d.users.find(x => x.id === id); if (!u) return false; u.failCount = 0; u.lockCount = 0; u.lockUntil = 0; save(d); return true; }
function logoutAll(id) { const d = data(); const u = d.users.find(x => x.id === id); if (!u) return false; bump(u); save(d); return true; }

function setPassword(id, pass) {
  const d = data();
  const u = d.users.find(x => x.id === id);
  if (!u) return false;
  const pr = security.passwordProblem(pass, u.user);
  if (pr) throw new Error(pr);
  u.hash = bcrypt.hashSync(pass, 10);
  u.defaultPass = false;
  u.failCount = 0; u.lockCount = 0; u.lockUntil = 0;
  bump(u);
  d.resets = d.resets.filter(r => r.userId !== id);
  save(d);
  return true;
}

function upsert(rec) {
  const d = data();
  const old = rec.id && d.users.find(x => x.id === rec.id);
  const clash = d.users.find(x => x.id !== (old && old.id) && (norm(x.user) === norm(rec.user) || (rec.email && x.email && norm(x.email) === norm(rec.email))));
  if (clash) throw new Error('اسم المستخدم أو الإيميل مستخدم قبل كده');
  if (old) {
    const before = [old.perms, old.active !== false];
    ['name', 'user', 'email', 'perms', 'active', 'notify'].forEach(k => { if (rec[k] !== undefined) old[k] = rec[k]; });
    if (old.owner) { old.perms = ALL.slice(); old.active = true; }
    if (rec.pass) { const pr = security.passwordProblem(rec.pass, old.user); if (pr) throw new Error(pr); old.hash = bcrypt.hashSync(rec.pass, 10); old.defaultPass = false; bump(old); }
    if (JSON.stringify(before) !== JSON.stringify([old.perms, old.active !== false])) bump(old);
    save(d);
    return old;
  }
  if (rec.pass) { const pr = security.passwordProblem(rec.pass, rec.user); if (pr) throw new Error(pr); }
  const u = { id: uid(), name: rec.name, user: rec.user, email: rec.email, perms: rec.perms || [], active: rec.active !== false, notify: Boolean(rec.notify), owner: false, hash: rec.pass ? bcrypt.hashSync(rec.pass, 10) : '', created: new Date().toISOString() };
  d.users.push(u);
  save(d);
  return u;
}

function remove(id) {
  const d = data();
  const u = d.users.find(x => x.id === id);
  if (!u || u.owner) return false;
  d.users = d.users.filter(x => x.id !== id);
  d.resets = d.resets.filter(r => r.userId !== id);
  save(d);
  return true;
}

/** لينك لتعيين كلمة مرور جديدة. بيتحفظ منه hash بس، وبيخلص بعد المدة المحددة */
function createReset(id, minutes) {
  const d = data();
  const token = crypto.randomBytes(24).toString('hex');
  d.resets = d.resets.filter(r => r.exp > Date.now() && r.userId !== id);
  d.resets.push({ h: sha(token), userId: id, exp: Date.now() + (minutes || 60) * 60000 });
  save(d);
  return token;
}
function checkReset(token) {
  const r = data().resets.find(x => x.h === sha(token) && x.exp > Date.now());
  return r ? byId(r.userId) : null;
}

/** إيميلات المستخدمين اللي عايزين إشعار بالرسايل الجديدة */
function notifyEmails() {
  return list().filter(u => u.active !== false && u.notify && u.email && has(u, 'inbox')).map(u => u.email);
}

/**
 * طوارئ: لو نسيت كلمة مرور المدير الأساسي والإيميل كمان.
 * في متغيرات البيئة على الاستضافة ضيف OWNER_RESET_PASS (8 حروف على الأقل)،
 * واختياري OWNER_RESET_EMAIL، واعمل Restart. بيتطبق مرة واحدة لكل قيمة، وبعد ما تدخل امسح المتغيرات دي.
 */
function emergencyReset() {
  const pass = String(process.env.OWNER_RESET_PASS || '').trim();
  const email = String(process.env.OWNER_RESET_EMAIL || '').trim();
  if (!pass) return;
  const pr = security.passwordProblem(pass, 'admin');
  if (pr) { console.error('OWNER_RESET_PASS ضعيفة (' + pr + ') - متغيرش حاجة'); return; }
  const d = data();
  const stamp = sha(pass + '|' + email);
  if (d.envReset === stamp) return;
  let u = d.users.find(x => x.owner);
  if (!u) {
    u = { id: uid(), name: 'المدير', user: 'admin', email: '', owner: true, perms: ALL.slice(), active: true, notify: true, created: new Date().toISOString() };
    d.users.push(u);
  }
  const clash = email && d.users.find(x => x !== u && x.email && norm(x.email) === norm(email));
  if (clash) console.error('OWNER_RESET_EMAIL مستخدم لحساب تاني - الإيميل متغيرش');
  else if (email) u.email = email;
  u.hash = bcrypt.hashSync(pass, 10);
  u.active = true;
  u.perms = ALL.slice();
  u.defaultPass = false;
  u.totp = null; u.recovery = []; u.failCount = 0; u.lockCount = 0; u.lockUntil = 0; bump(u);
  d.resets = d.resets.filter(r => r.userId !== u.id);
  d.envReset = stamp;
  save(d);
  console.log('تم تغيير كلمة مرور المدير الأساسي من متغيرات البيئة. اسم المستخدم: ' + u.user + (u.email ? ' - الإيميل: ' + u.email : '') + '. امسح OWNER_RESET_PASS دلوقتي.');
}

module.exports = { PERMS, ALL, SENSITIVE, list, byId, find, has, attempt, twoFaOn, twoFaRequired, enable2fa, verify2fa, newRecovery, disable2fa, reset2fa, unlock, logoutAll, setPassword, upsert, remove, createReset, checkReset, notifyEmails, emergencyReset };

/**
 * موقع شركة نسر الخليج لإلحاق العمالة المصرية بالخارج
 * Node.js + Express + EJS، والبيانات في ملفات JSON (مفيش قاعدة بيانات).
 * التشغيل:  npm install  ثم  npm start
 */
const path = require('path');
const fs = require('fs');

// ---------- .env ----------
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8').split(/\r?\n/).forEach(line => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  });
}

const express = require('express');
const session = require('express-session');
const multer = require('multer');
const bcrypt = require('bcryptjs');

const store = require('./lib/store');
const social = require('./lib/social');
const pkgVersion = require('./package.json').version;
const mailer = require('./lib/mailer');
const { dict, tr, LANGS } = require('./lib/i18n');
const { icon, brand, names: ICON_NAMES } = require('./lib/icons');
const content = require('./lib/content');
const security = require('./lib/security');
const users = require('./lib/users');
users.emergencyReset();
const analytics = require('./lib/analytics');
const privacyDefault = require('./lib/privacy-default');
const facebook = require('./lib/facebook');
const masar = require('./lib/masar');

const PORT = process.env.PORT || 3000;
const APP_UPLOADS = path.join(__dirname, 'public', 'uploads');
let UPLOAD_DIR = process.env.UPLOAD_DIR ? store.resolveDir(process.env.UPLOAD_DIR) : APP_UPLOADS;
try {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.accessSync(UPLOAD_DIR, fs.constants.W_OK);
  // انسخ الصور اللي جاية مع الموقع ومش موجودة في فولدر الصور الخارجي
  if (UPLOAD_DIR !== APP_UPLOADS && fs.existsSync(APP_UPLOADS)) fs.cpSync(APP_UPLOADS, UPLOAD_DIR, { recursive: true, force: false, errorOnExist: false });
} catch (e) {
  console.error('UPLOAD_DIR مش صالح (' + UPLOAD_DIR + '): ' + e.message + ' - هنستخدم public/uploads.');
  UPLOAD_DIR = APP_UPLOADS;
}
const CV_DIR = path.join(store.DIR, 'cv');
[UPLOAD_DIR, CV_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);
app.locals.img = slot => siteImg(store.get('site'), slot);
app.disable('x-powered-by');
/* شبكة أمان: أي خطأ غير ملتقَط في كولباك async مايوقّعش السيرفر كله */
process.on('unhandledRejection', e => console.error('[unhandledRejection]', e && e.message));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (req.path.startsWith('/admin')) {
    // لوحة التحكم: مفيش تضمين في صفحات تانية، ولا أي سكربت أو اتصال من برا (الخطوط بس من جوجل)
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  }
  next();
});
app.use(express.urlencoded({ extended: true, limit: '4mb' }));
app.use(express.json({ limit: '4mb' }));
app.use(express.text({ limit: '64kb' }));

// الصور المرفوعة بس هي اللي بتتعرض للزوار. أي ملف تاني (زي السير الذاتية القديمة) مقفول.
app.use('/uploads', (req, res, next) => {
  if (!/\.(jpe?g|png|webp|gif|pdf)$/i.test(req.path)) return res.status(404).end();
  if (/\.pdf$/i.test(req.path) && !/^\/profile-/.test(req.path)) return res.status(404).end();
  next();
}, express.static(UPLOAD_DIR, { maxAge: '30d' }));
/* أي طلب لـ uploads وصل هنا (مثلاً //uploads/x.docx) مقفول — كان بيعدّي على static بتاع public ويتخطى الفلتر */
app.use((req, res, next) => /^\/+uploads(\/|$)/i.test(req.path.replace(/\\/g, '/')) ? res.status(404).end() : next());
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '7d' }));

app.use(session({
  name: 'nk.sid',
  secret: security.sessionSecret(),
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 12, httpOnly: true, sameSite: 'lax', secure: 'auto' }
}));

/* وضع «تحت التطوير»: الزوار يشوفوا صفحة مؤقتة، والأدمن يدخل ويشوف الموقع الحقيقي عادي.
   بيتحكم فيه إعداد محفوظ (site.underConstruction) + متغير UNDER_CONSTRUCTION. كل البيانات محفوظة — مجرد واجهة. */
function underCon() {
  const e = String(process.env.UNDER_CONSTRUCTION || '').toLowerCase().trim();
  if (['1', 'true', 'on', 'yes'].includes(e)) return true;
  if (['0', 'false', 'off', 'no'].includes(e)) return false;
  return (store.get('site') || {}).underConstruction !== false; // افتراضي: مفعّل
}
const UC_SKIP = /^\/(admin|p|t|health|robots\.txt|sitemap\.xml|favicon\.ico|css|js|img|uploads|fonts|vendor)(\/|$)/;
app.use((req, res, next) => {
  if (UC_SKIP.test(req.path) || !underCon()) return next();
  if (req.session && req.session.uid && users.byId(req.session.uid)) return next(); // الأدمن بيشوف الموقع الحقيقي
  res.status(503).set('Retry-After', '3600').render('maintenance', { site: store.get('site') || {}, year: new Date().getFullYear() });
});

/* حماية CSRF: أي POST على /admin لازم Origin (أو Referer) يطابق دومين الموقع — بيمنع موقع تاني (أو دومين فرعي) يبعت طلبات بكوكي الأدمن */
app.use('/admin', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const src = req.get('origin') || req.get('referer') || ''; if (!src) return next();
  let h = ''; try { h = new URL(src).host; } catch { return res.status(403).send('طلب مرفوض'); }
  const mine = [req.get('host')]; if (process.env.SITE_URL) { try { mine.push(new URL(process.env.SITE_URL).host); } catch {} }
  if (!mine.includes(h)) return res.status(403).send('طلب مرفوض (مصدر غير مسموح)');
  next();
});

// ---------- صفحات التقديم (بتتعرض من هنا وبتتمرّر لمسار HR من ورا الستار) ----------
// الزائر مبيشوفش دومين مسار أبداً. السيرفر هو اللي بيكلّم مسار بمفتاح سري.
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
const gone = (res) => res.status(404).type('text/plain; charset=utf-8').send('الرابط مش شغال');
app.get('/apply/:token', (req, res) => TOKEN_RE.test(req.params.token) ? masar.proxy(req, res, '/p/apply/' + req.params.token) : gone(res));
app.get('/apply-assets/:file', (req, res) => /^(apply\.js|apply\.css|fonts\.css|client\.css|track\.js|agent\.js|profile\.js|me\.js)$/.test(req.params.file) ? masar.proxy(req, res, '/p/assets/' + req.params.file) : gone(res));
app.get('/apply-assets/fonts/:file', (req, res) => /^[A-Za-z0-9._-]+\.woff2$/.test(req.params.file) ? masar.proxy(req, res, '/p/assets/fonts/' + req.params.file) : gone(res));
app.get('/apply-api/form/:token', (req, res) => TOKEN_RE.test(req.params.token) ? masar.proxy(req, res, '/p/api/form/' + req.params.token) : gone(res));
app.post('/apply-api/apply/:token', (req, res) => {
  if (!TOKEN_RE.test(req.params.token)) return gone(res);
  if (tooMany(req.ip || '', 20, 10 * 60 * 1000)) return res.status(429).json({ ok: false, message: 'محاولات كتير، جرّب بعد شوية' });
  masar.proxy(req, res, '/p/api/apply/' + req.params.token, { body: true, maxBytes: 9 * 1024 * 1024 });
});
app.get('/apply-img/:token/:name', (req, res) => TOKEN_RE.test(req.params.token) && /^(logo|[a-f0-9]{16}\.(jpg|png|webp))$/.test(req.params.name) ? masar.proxy(req, res, '/p/img/' + req.params.token + '/' + req.params.name) : gone(res));

// ---------- متابعة الطلب + بوابة المناديب + «ملفي» (مسار بيعرضهم، والموقع بيمرّرهم بالمفتاح السري) ----------
// (بوابة العميل /client والمعرض /talent و«وظائف متاحة» /openings و«اطلب موظفين» /hire اتشالوا من مسار 3.32 — الروابط دي بقت 404)
app.get('/track', (req, res) => masar.proxy(req, res, '/p/track'));
app.get('/agent', (req, res) => masar.proxy(req, res, '/p/agent'));
app.get('/me', (req, res) => masar.proxy(req, res, '/p/me'));
const X_API = /^(track\/(lookup|info|edit-info|edit)|me\/(info|signup|login|reset|home|edit|password|logout-all|delete)|agent\/(login|me|people|bulk|export|add|cv|form)|agent\/(person|file)\/[ci]\d{1,9}|logo)$/;
app.all('/x-api/*', (req, res) => {
  const rest = String(req.params[0] || ''); if (!X_API.test(rest) || !['GET', 'POST'].includes(req.method)) return gone(res);
  if (tooMany('x:' + (req.ip || ''), 300, 60 * 1000)) return res.status(429).json({ ok: false, message: 'طلبات كتير، جرّب بعد شوية' });
  const q = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  if (rest === 'agent/login' && tooMany('agl:' + (req.ip || ''), 20, 15 * 60 * 1000)) return res.status(429).json({ ok: false, message: 'محاولات كتير، جرّب بعد شوية' });
  if (/^me\/(login|signup|reset)$/.test(rest) && tooMany('mel:' + (req.ip || ''), 30, 15 * 60 * 1000)) return res.status(429).json({ ok: false, message: 'محاولات كتير، جرّب بعد شوية' });
  const tgt = '/p/api/x/' + rest + (/^\?[A-Za-z0-9=&%._-]{0,200}$/.test(q) ? q : ''); const fw = ['x-agent-token', 'x-me-token'];
  masar.proxy(req, res, tgt, (rest === 'agent/add' || rest === 'agent/cv' || rest === 'track/edit' || rest === 'me/edit') ? { body: true, maxBytes: 9 * 1024 * 1024, forward: fw } : { json: req.method === 'POST', forward: fw });
});
// إشعارات مسار (مثلاً مندوب رفع ناس): بتتبعت إيميل للشركة. المفتاح السري هو نفسه مفتاح الربط.
app.post('/api/masar-notify', async (req, res) => {
  if (!masar.keyOk(req)) return res.status(404).end();
  if (tooMany('notify:' + (req.ip || ''), 60, 60 * 60 * 1000)) return res.status(429).json({ ok: false });
  const b = req.body || {}; const rows = (Array.isArray(b.lines) ? b.lines : []).slice(0, 40).map(r => [clean(r && r[0], 80), clean(r && r[1], 600)]);
  try { await mailer.send(rows, { subject: clean(b.subject, 150) || 'إشعار من مسار', title: clean(b.title, 150) || 'إشعار من مسار', extraTo: users.notifyEmails() }); res.json({ ok: true }); }
  catch (e) { res.status(200).json({ ok: false, message: String(e && e.message || e).slice(0, 120) }); }
});

// ---------- uploads ----------
const diskImages = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6) + path.extname(file.originalname).toLowerCase())
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /\.(jpe?g|png|webp|gif)$/i.test(file.originalname))
});
const diskPdf = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, 'profile-' + Date.now().toString(36) + '.pdf')
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /\.pdf$/i.test(file.originalname))
});
const memCv = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => cb(null, /\.(pdf|docx?|jpe?g|png|webp)$/i.test(file.originalname))
});

// ---------- helpers ----------
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const now = () => new Date().toISOString();
const clean = (s, max) => String(s == null ? '' : s).trim().slice(0, max || 4000);
const bi = (b, k) => ({ ar: clean(b[k + '_ar']), en: clean(b[k + '_en']) });
const digits = s => String(s || '').replace(/[^0-9]/g, '');
const langOf = req => (LANGS.includes(req.params.lang) ? req.params.lang : 'ar');
/* روابط إعادة التعيين اللي بتتبعت من طلب من غير تسجيل دخول (نسيت كلمة المرور) مايتبنيش على Host header بتاع الزائر (ممكن يتزوّر). لو SITE_URL مش متظبط بنستخدم آخر دومين دخل منه أدمن مسجّل دخول. */
let _adminHost = '';
const trustedSiteUrl = () => { const u = process.env.SITE_URL || _adminHost; if (!u) throw new Error('SITE_URL مش متظبط'); return u.replace(/\/$/, ''); };
const siteUrl = req => (process.env.SITE_URL || (req.protocol + '://' + req.get('host'))).replace(/\/$/, '');

function waLink(number, msg) {
  return 'https://wa.me/' + digits(number) + (msg ? '?text=' + encodeURIComponent(msg) : '');
}

function fmtDate(d, lang) {
  if (!d) return '';
  const x = new Date(d);
  if (isNaN(x)) return d;
  return x.toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
}

// صور الموقع اللي بتتغير من لوحة التحكم (صفحة "صور الموقع")
const IMAGE_SLOTS = [
  { k: 'logo', label: 'الشعار', hint: 'بيظهر في أعلى كل الصفحات وفي الفوتر. يفضل PNG بخلفية شفافة، مربع تقريباً.', def: '/img/logo.png' },
  { k: 'hero', label: 'صورة الواجهة الرئيسية', hint: 'الصورة العريضة اللي تحت العنوان في الصفحة الرئيسية. يفضل عرضها ضعف طولها (مثلاً 1600×640).', def: '/img/hero.jpg' },
  { k: 'about', label: 'صورة "من نحن"', hint: 'صورة طولية جنب نص من نحن (مثلاً 660×800).', def: '/img/about.jpg' },
  { k: 'scope', label: 'صورة "نطاق عملنا"', hint: 'صورة عرضية جنب قايمة الدول (مثلاً 1200×580).', def: '/img/skyline.jpg' },
  { k: 'banner', label: 'خلفية عناوين الصفحات والفوتر', hint: 'بتظهر باهتة ورا عنوان كل صفحة داخلية. عرضية (مثلاً 1600×600).', def: '/img/skyline.jpg' },
  { k: 'p_crane', label: 'صورة شركاء المقاولات', hint: 'في صفحة شركاؤنا، فوق مجموعة المقاولات.', def: '/img/sector-construction.jpg' },
  { k: 'p_bus', label: 'صورة شركاء النقل', hint: 'في صفحة شركاؤنا، فوق مجموعة النقل.', def: '/img/sector-transport.jpg' },
  { k: 'p_hotel', label: 'صورة شركاء الفنادق والضيافة', hint: 'في صفحة شركاؤنا، فوق مجموعة الفنادق.', def: '/img/sector-hotels.jpg' },
  { k: 'og', label: 'صورة المشاركة على فيسبوك وواتساب', hint: 'بتظهر لما حد يشارك لينك الموقع. المقاس 1200×630.', def: '/img/og.jpg' }
];
function siteImg(site, slot) {
  const def = (IMAGE_SLOTS.find(x => x.k === slot) || {}).def || '';
  return (site.images && site.images[slot]) || def;
}

function customSections(pos) {
  return (store.get('site').sections || []).filter(s => s.visible !== false && s.position === pos);
}

function base(req, extra) {
  const lang = langOf(req);
  const site = store.get('site');
  const c = site.contact || {};
  const t = dict[lang];
  const pathNoLang = req.path === '/' ? '' : req.path;
  return Object.assign({
    lang, t, site, icon, brand,
    dir: lang === 'ar' ? 'rtl' : 'ltr',
    other: lang === 'ar' ? 'en' : 'ar',
    tr: o => tr(o, lang),
    L: p => '/' + lang + (p || ''),
    pathNoLang,
    page: '',
    title: '',
    desc: '',
    fmtDate: d => fmtDate(d, lang),
    wa: msg => waLink(c.whatsapp, msg),
    waCompanies: msg => waLink(c.whatsappCompanies || c.whatsapp, msg),
    tel: p => 'tel:+' + digits(p),
    safeUrl: u => /^(https?:\/\/|mailto:|tel:|\/(?!\/))/i.test(String(u || '').trim()) ? String(u).trim() : '#', /* يمنع javascript: في الروابط اللي الإدارة بتكتبها */
    mapUrl: /^https?:\/\//i.test(String(c.mapLink || '').trim()) ? String(c.mapLink).trim() : ('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(tr(c.address, 'ar'))),
    customs: customSections,
    img: slot => siteImg(site, slot),
    baseUrl: siteUrl(req),
    mailReady: mailer.ready(),
    chans: masar.channels(),
    professions: (site.professions || []).map(p => tr(p.text, lang)).filter(Boolean),
    countries: (site.countries || []).map(x => tr(x.name, lang)).filter(Boolean),
    socials: ['facebook', 'instagram', 'tiktok', 'linkedin', 'youtube'].filter(k => c[k]).map(k => ({ k, url: c[k] }))
  }, extra || {});
}

function activeJobs() { return store.get('jobs').filter(j => j.active !== false); }

// ---------- forms (نفس التعريف بيتستخدم في التحقق والإيميل ولوحة التحكم) ----------
const FORMS = {
  company: { subject: 'طلب عمالة جديد', fields: [
    { k: 'company', req: 1, l: 'f_company' }, { k: 'country', l: 'f_country' }, { k: 'person', l: 'f_person' },
    { k: 'phone', req: 1, l: 'f_phone' }, { k: 'email', l: 'f_email' }, { k: 'trades', req: 1, l: 'f_trades' },
    { k: 'count', l: 'f_count' }, { k: 'notes', l: 'f_notes' }] },
  worker: { subject: 'تسجيل عامل جديد', fields: [
    { k: 'name', req: 1, l: 'f_name' }, { k: 'phone', req: 1, l: 'f_phone' }, { k: 'profession', req: 1, l: 'f_profession' },
    { k: 'years', l: 'f_years' }, { k: 'country', l: 'f_pref' }, { k: 'job', l: 'f_job' }, { k: 'notes', l: 'f_notes' }] },
  contact: { subject: 'رسالة جديدة من الموقع', fields: [
    { k: 'name', req: 1, l: 'f_name' }, { k: 'phone', req: 1, l: 'f_phone' }, { k: 'email', l: 'f_email' },
    { k: 'message', req: 1, l: 'f_message' }] }
};
const KIND_LABEL = { company: 'طلب عمالة', worker: 'تسجيل عامل', contact: 'استفسار' };
const CHANNEL_LABEL = { email: 'إيميل', whatsapp: 'واتساب', form: 'فورم' };

function readForm(kind, body) {
  const def = FORMS[kind];
  const fields = {};
  def.fields.forEach(f => { fields[f.k] = clean(body[f.k], 3000); });
  const missing = def.fields.filter(f => f.req && !fields[f.k]).map(f => f.k);
  return { fields, missing };
}

// حماية بسيطة من الإزعاج: عدد محدود من الرسايل لكل جهاز
const hits = new Map();
function tooMany(ip, limit, windowMs) {
  const t = Date.now();
  const list = (hits.get(ip) || []).filter(x => t - x < windowMs);
  list.push(t);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > limit;
}

function saveMessage(rec) {
  const inbox = store.get('inbox');
  inbox.messages.unshift(rec);
  if (inbox.messages.length > 5000) inbox.messages.length = 5000;
  store.set('inbox', inbox);
}

// ---------- public ----------
app.get('/', (req, res) => {
  const pref = req.headers.cookie && (req.headers.cookie.match(/(?:^|;\s*)lang=(ar|en)/) || [])[1];
  const al = String(req.headers['accept-language'] || '').toLowerCase();
  const lang = pref || (al && !al.startsWith('ar') && /^(en|fr|de|es|it|ur|hi|tr)/.test(al) ? 'en' : 'ar');
  res.redirect('/' + lang);
});

// خريطة الأيقونات اللي بيحتاجها عرض /social
let _socialIcons = null;
function socialIconsMap() {
  if (_socialIcons) return _socialIcons;
  const m = {};
  ['globe', 'briefcase', 'users', 'phone', 'mail', 'map', 'link', 'send', 'chevdown'].forEach(n => { m['i:' + n] = icon(n); });
  ['facebook', 'instagram', 'tiktok', 'youtube', 'whatsapp', 'x', 'linkedin'].forEach(n => { m['b:' + n] = brand(n); });
  _socialIcons = m; return m;
}
// صفحة روابط التواصل (باركود) — /social — بتترسم على المتصفح من نفس كود المعاينة
function renderSocialPage(req, res, slug) {
  const site = store.get('site'); const cfg = social.findPage(store.get('social'), site, slug);
  if (!cfg) return false;
  const base = siteUrl(req);
  res.render('social', {
    icon, brand, img: slot => siteImg(site, slot), cfg,
    items: social.items(cfg, base, true),
    icons_json: JSON.stringify(socialIconsMap()).replace(/</g, '\\u003c'), cfg_json: JSON.stringify(cfg).replace(/</g, '\\u003c'), v: pkgVersion,
    ttl: String(cfg.title || '').trim() || tr(site.brand && site.brand.name, 'ar') || 'نسر الخليج',
    baseUrl: base
  });
  return true;
}
app.get('/social', (req, res) => { renderSocialPage(req, res, 'social'); });
app.get('/robots.txt', (req, res) => res.type('text/plain').send(`User-agent: *\nDisallow: /admin\nSitemap: ${siteUrl(req)}/sitemap.xml\n`));
app.get('/sitemap.xml', (req, res) => {
  const b = siteUrl(req);
  const pages = ['', '/about', '/companies', '/jobs', '/apply', '/guide', '/news', '/gallery', '/partners', '/contact', '/privacy'];
  const urls = [];
  LANGS.forEach(l => {
    pages.forEach(p => urls.push(`${b}/${l}${p}`));
    activeJobs().forEach(j => urls.push(`${b}/${l}/jobs/${j.id}`));
    store.get('news').forEach(n => urls.push(`${b}/${l}/news/${n.id}`));
  });
  res.type('application/xml').send('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    urls.map(u => `<url><loc>${u}</loc></url>`).join('') + '</urlset>');
});

const pub = express.Router({ mergeParams: true });
app.use('/:lang(ar|en)', (req, res, next) => {
  res.cookie('lang', req.params.lang, { maxAge: 31536000000, sameSite: 'lax' });
  if (req.method === 'GET') {
    const parts = req.path.split('/').filter(Boolean);
    const lang = req.params.lang;
    res.on('finish', () => {
      if (res.statusCode !== 200) return;
      let page = parts[0] || 'home';
      let job = '';
      if (parts[0] === 'jobs' && parts[1]) { page = 'job'; job = parts[1]; }
      else if (parts[0] === 'news' && parts[1]) page = 'post';
      else if (parts[0] === 'gallery' && parts[1]) page = 'album';
      analytics.pageview(req, res, { page, job, lang });
    });
  }
  next();
}, pub);

// أحداث الضغط (واتساب، اتصال، تحميل الملف التعريفي...) من غير كوكيز
app.post('/t', (req, res) => {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  if (!tooMany('t:' + (req.ip || ''), 120, 10 * 60 * 1000)) analytics.event(String((b && b.e) || ''), req);
  res.status(204).end();
});

pub.get('/', (req, res) => {
  const g = store.get('gallery');
  res.render('home', base(req, {
    page: 'home',
    jobs: activeJobs().slice(0, 6),
    news: store.get('news').slice(0, 3),
    photos: g.items.slice(0, 8)
  }));
});

pub.get('/about', (req, res) => res.render('about', base(req, { page: 'about', title: dict[langOf(req)].about_title })));
pub.get('/partners', (req, res) => res.render('partners', base(req, { page: 'about', title: dict[langOf(req)].partners })));
pub.get('/companies', (req, res) => res.render('companies', base(req, { page: 'companies', title: dict[langOf(req)].companies_title })));
pub.get('/guide', (req, res) => res.render('guide', base(req, { page: 'guide', title: dict[langOf(req)].guide })));
pub.get('/contact', (req, res) => res.render('contact', base(req, { page: 'contact', title: dict[langOf(req)].contact_title, tab: ['company', 'worker', 'contact'].includes(req.query.tab) ? req.query.tab : 'contact' })));

pub.get('/privacy', (req, res) => {
  const lang = langOf(req);
  const site = store.get('site');
  const p = (site.privacy && tr(site.privacy.body, lang)) ? site.privacy : privacyDefault;
  const c = site.contact || {};
  const ltr = x => x ? '\u2066' + x + '\u2069' : '';
  const vars = { company: tr(site.brand.name, lang), license: site.brand.license || '', email: ltr(c.email || ''), phone: ltr((c.phonesEG || [])[0] || c.whatsapp || ''), address: tr(c.address, lang) };
  const text = tr(p.body, lang).replace(/\{(company|license|email|phone|address)\}/g, (m, k) => vars[k]);
  // سطور بسيطة: ## عنوان، - نقطة، والباقي فقرات
  const blocks = [];
  text.split(/\r?\n/).forEach(line => {
    const l = line.trim();
    if (!l) return;
    if (l.startsWith('## ')) blocks.push({ h: l.slice(3) });
    else if (/^[-•]\s+/.test(l)) {
      const last = blocks[blocks.length - 1];
      if (last && last.ul) last.ul.push(l.replace(/^[-•]\s+/, '')); else blocks.push({ ul: [l.replace(/^[-•]\s+/, '')] });
    } else blocks.push({ p: l });
  });
  res.render('privacy', base(req, { page: 'privacy', title: dict[lang].privacy, blocks, updated: p.updated ? '\u2066' + p.updated + '\u2069' : '' }));
});

pub.get('/apply', (req, res) => {
  const job = activeJobs().find(j => j.id === req.query.job);
  res.render('apply', base(req, { page: 'apply', job, title: dict[langOf(req)].apply_title }));
});

pub.get('/jobs', (req, res) => {
  const lang = langOf(req);
  const q = clean(req.query.q, 100).toLowerCase();
  const country = clean(req.query.country, 100);
  const sector = clean(req.query.sector, 100);
  let jobs = activeJobs();
  if (country) jobs = jobs.filter(j => tr(j.country, 'ar') === country || tr(j.country, 'en') === country);
  if (sector) jobs = jobs.filter(j => tr(j.sector, 'ar') === sector || tr(j.sector, 'en') === sector);
  if (q) jobs = jobs.filter(j => [j.title, j.profession, j.details, j.code].map(x => JSON.stringify(x || '')).join(' ').toLowerCase().includes(q));
  const all = activeJobs();
  const uniq = key => [...new Set(all.map(j => tr(j[key], lang)).filter(Boolean))];
  res.render('jobs', base(req, { page: 'jobs', title: dict[lang].jobs_title, jobs, q, country, sector, jobCountries: uniq('country'), jobSectors: uniq('sector') }));
});

pub.get('/jobs/:id', (req, res) => {
  const job = store.get('jobs').find(j => j.id === req.params.id);
  if (!job) return notFound(req, res);
  const lang = langOf(req);
  res.render('job', base(req, { page: 'jobs', job, title: tr(job.title, lang), desc: tr(job.details, lang).slice(0, 160), related: activeJobs().filter(j => j.id !== job.id).slice(0, 3), ogImage: job.image || '' }));
});

pub.get('/news', (req, res) => res.render('news', base(req, { page: 'news', title: dict[langOf(req)].news, news: store.get('news') })));
pub.get('/news/:id', (req, res) => {
  const item = store.get('news').find(n => n.id === req.params.id);
  if (!item) return notFound(req, res);
  const lang = langOf(req);
  res.render('post', base(req, { page: 'news', item, title: tr(item.title, lang), desc: tr(item.text, lang).slice(0, 160), more: store.get('news').filter(n => n.id !== item.id).slice(0, 3), ogImage: item.image }));
});

pub.get('/gallery', (req, res) => {
  const g = store.get('gallery');
  const albums = g.albums.map(a => {
    const items = g.items.filter(i => i.album === a.id);
    const cover = items.find(i => i.id === a.cover) || items[0];
    return Object.assign({}, a, { count: items.length, coverFile: cover ? cover.file : '' });
  }).filter(a => a.count);
  res.render('gallery', base(req, { page: 'gallery', title: dict[langOf(req)].gallery, albums, album: null, items: [] }));
});
pub.get('/gallery/:album', (req, res) => {
  const g = store.get('gallery');
  const album = g.albums.find(a => a.id === req.params.album);
  if (!album) return notFound(req, res);
  res.render('gallery', base(req, { page: 'gallery', title: tr(album.title, langOf(req)), albums: [], album, items: g.items.filter(i => i.album === album.id) }));
});

// إرسال الفورمات: بالإيميل (من السيرفر) أو تسجيل نسخة لما الزائر يبعت على واتساب
pub.post('/send', (req, res) => {
  memCv.single('cv')(req, res, async upErr => {
    const lang = langOf(req);
    const t = dict[lang];
    const wantsJson = req.xhr || /json/.test(req.get('accept') || '');
    const reply = (ok, msg, code) => wantsJson
      ? res.status(code || (ok ? 200 : 400)).json({ ok, msg })
      : res.status(code || (ok ? 200 : 400)).render('sent', base(req, { ok, msg, title: ok ? t.sent_ok : t.sent_fail }));

    const b = req.body || {};
    const kind = (typeof b.kind === 'string' && Object.prototype.hasOwnProperty.call(FORMS, b.kind)) ? b.kind : 'contact'; /* hasOwn: kind=__proto__ كان بيوقّع السيرفر كله */
    if (clean(b.website)) return reply(true, t.sent_ok); // فخ للبرامج الآلية
    const ip = req.ip || '';
    if (tooMany(ip, 8, 10 * 60 * 1000)) return reply(false, t.too_many, 429);

    const { fields, missing } = readForm(kind, b);
    if (missing.length) return reply(false, t.required);
    const channel = b.channel === 'whatsapp' ? 'whatsapp' : 'email';
    const chans = masar.channels();
    const toMasar = kind === 'worker' && chans.masar;      // تسجيل العمال والتقديم على الوظائف بتروح الوارد في مسار
    const emailOn = chans.email && mailer.ready();
    analytics.event('form_' + kind + '_' + channel, req);
    const rec = { id: uid(), kind, channel, lang, at: now(), read: false, fields, mailed: false, consent: b.consent === 'on' };
    if (toMasar) { rec.masar = 'pending'; rec.masarTries = 0; }

    let attachments = [];
    if (req.file && kind === 'worker' && !upErr) {
      const safe = uid() + path.extname(req.file.originalname).toLowerCase();
      fs.writeFileSync(path.join(CV_DIR, safe), req.file.buffer);
      rec.cv = safe;
      rec.cvName = clean(req.file.originalname, 120);
      attachments = [{ filename: rec.cvName || safe, content: req.file.buffer }];
    }

    if (channel === 'email' && emailOn) {
      const labels = dict.ar;
      const rows = FORMS[kind].fields.map(f => [labels[f.l], fields[f.k]]);
      rows.push(['لغة الزائر', lang === 'ar' ? 'عربي' : 'English']);
      try {
        await mailer.send(rows, {
          subject: FORMS[kind].subject + ' - ' + (fields.company || fields.name || ''),
          title: FORMS[kind].subject,
          replyTo: /\S+@\S+\.\S+/.test(fields.email || '') ? fields.email : undefined,
          extraTo: users.notifyEmails(),
          attachments
        });
        rec.mailed = true;
      } catch (e) {
        rec.mailError = String(e && e.message || e).slice(0, 300);
        console.error('mail error:', rec.mailError);
      }
      saveMessage(rec);
      if (toMasar) await pushMasar(rec, ip);
      // حتى لو الإيميل فشل، الرسالة اتحفظت في لوحة التحكم (وفي مسار لو شغال)
      return (rec.mailed || rec.masar === 'ok') ? reply(true, t.sent_ok) : reply(false, t.sent_fail, 502);
    }
    if (channel === 'email') {
      // الإيميل مقفول من لوحة التحكم أو مش متظبط: نحفظ الرسالة وندفعها لمسار
      rec.channel = 'form';
      saveMessage(rec);
      if (toMasar) await pushMasar(rec, ip);
      return reply(true, t.sent_ok);
    }
    saveMessage(rec);
    if (toMasar) pushMasar(rec, ip);
    return reply(true, t.sent_wa_note);
  });
});

// بيبعت تسجيل عامل/تقديم وظيفة لمسار (الوارد). لو فشل بيتحاول تاني لوحده كل 5 دقايق (6 مرات).
async function pushMasar(rec, ip) {
  const f = rec.fields || {};
  const fd = new FormData();
  ['name', 'phone', 'profession', 'years', 'country', 'job', 'notes'].forEach(k => fd.set(k, f[k] || ''));
  fd.set('source', rec.job || f.job ? 'تقديم على وظيفة' : 'سجّل كعامل');
  fd.set('lang', rec.lang || 'ar');
  if (rec.cv) {
    try { fd.set('cv', new Blob([fs.readFileSync(path.join(CV_DIR, path.basename(rec.cv)))]), rec.cvName || rec.cv); } catch (e) { /* الملف اتمسح */ }
  }
  const r = await masar.ingest(fd, ip || '');
  rec.masarTries = (rec.masarTries || 0) + 1;
  if (r.ok) { rec.masar = 'ok'; rec.masarReceipt = r.receipt; delete rec.masarError; }
  else { rec.masarError = String(r.message || 'فشل').slice(0, 200); rec.masar = (r.status === 400 || rec.masarTries >= 6) ? 'failed' : 'pending'; }
  const inbox = store.get('inbox');
  store.set('inbox', inbox);
  return r.ok;
}
let retrying = false;
async function retryMasar() {
  if (retrying || !masar.channels().masar) return;
  retrying = true;
  try {
    const pending = store.get('inbox').messages.filter(m => m.masar === 'pending' && (m.masarTries || 0) < 6);
    for (const m of pending) await pushMasar(m, '');
  } catch (e) { console.error('masar retry:', e && e.message); }
  retrying = false;
}
setInterval(retryMasar, 5 * 60 * 1000).unref();
setTimeout(retryMasar, 30 * 1000).unref();

function notFound(req, res) {
  const lang = (req.originalUrl.match(/^\/(ar|en)\b/) || [])[1] || 'ar';
  req.params = Object.assign({}, req.params, { lang });
  res.status(404).render('404', base(req, { title: dict[lang].notfound }));
}

// ---------- admin ----------
function flash(req, msg, type) { req.session.flash = { msg, type: type || 'ok' }; }
const HOST_DEF = { until: '2030-10-20', domainUntil: '', provider: 'Hostinger', renewUrl: 'https://hpanel.hostinger.com', note: '' };
const hostCfg = () => Object.assign({}, HOST_DEF, store.get('site').hosting || {});
const hostDays = d => d ? Math.ceil((new Date(d + 'T00:00:00') - new Date(new Date().toDateString())) / 864e5) : null;
function hostAlert() { const h = hostCfg(); const l = [['الاستضافة', h.until], ['الدومين', h.domainUntil]].filter(x => x[1]).map(([label, until]) => ({ label, until, left: hostDays(until) })).sort((a, b) => a.left - b.left)[0]; return l && l.left <= 365 ? Object.assign(l, { tone: l.left <= 30 ? 'err' : 'warn' }) : null; }
function adminView(req, extra) {
  const site = store.get('site');
  const f = req.session.flash; delete req.session.flash;
  const inbox = store.get('inbox');
  const me = req.me || null;
  return Object.assign({
    site, icon, brand, flash: f, section: '', me,
    can: perm => users.has(me, perm),
    img: slot => siteImg(site, slot),
    tr: o => tr(o, 'ar'),
    pendingDev: users.has(me, 'users') ? security.devices().filter(d => d.status === 'pending').length : 0,
    unread: users.has(me, 'inbox') ? inbox.messages.filter(m => !m.read).length : 0,
    mailReady: mailer.ready(),
    host: me ? hostAlert() : null,
    fmtDate: d => fmtDate(d, 'ar'),
    fmtTime: d => new Date(d).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo', dateStyle: 'medium', timeStyle: 'short' }),
    KIND_LABEL, CHANNEL_LABEL, FORMS, labels: dict.ar, PERMS: users.PERMS
  }, extra || {});
}
const ISSUER = 'Nesr Al-Khaleej';
function auth(req, res, next) {
  const u = req.session && req.session.uid && users.byId(req.session.uid);
  // الجلسة بتتلغي لو الحساب اتوقف أو اتغيرت كلمة المرور/الصلاحيات/التحقق الثنائي (رقم النسخة بيتغير)
  if (u && u.active !== false && (req.session.ver || 0) === (u.tokenVer || 0)) {
    req.me = u;
    // لو الصلاحية حساسة والتحقق الثنائي مش متفعّل: مفيش دخول لأي صفحة غير صفحة التفعيل
    if (users.twoFaRequired(u) && !users.twoFaOn(u) && !/^\/(account|logout)/.test(req.path)) { flash(req, 'لازم تفعّل التحقق الثنائي الأول عشان تكمل', 'err'); return res.redirect('/admin/account/2fa'); }
    return next();
  }
  if (req.session && req.session.uid) { try { req.session.destroy(() => {}); } catch (e) { /* مفيش مشكلة */ } }
  const nextUrl = req.originalUrl && req.originalUrl !== '/admin' ? '?next=' + encodeURIComponent(req.originalUrl) : '';
  res.redirect('/admin/login' + nextUrl);
}
// كل مسار في لوحة التحكم ليه صلاحية
const PERM_OF = { facebook: 'facebook', stats: 'stats', inbox: 'inbox', jobs: 'jobs', news: 'news', gallery: 'gallery', content: 'content', social: 'social', sections: 'sections', images: 'images', contact: 'contact', mail: 'mail', masar: 'masar', users: 'users', security: 'users', audit: 'audit' };
function guard(req, res, next) {
  if (!process.env.SITE_URL && req.me) _adminHost = req.protocol + '://' + req.get('host');
  /* حروف صغيرة + أي مسار مش معروف يتقفل (قبل كده /admin/Users كان بيعدّي من غير فحص لأن Express مش حساس لحالة الحروف) */
  const seg = (req.path.split('/')[1] || '').toLowerCase();
  const perm = Object.prototype.hasOwnProperty.call(PERM_OF, seg) ? PERM_OF[seg] : null;
  if (!perm && (seg === '' || seg === 'account')) return next();
  if (seg === 'hosting' && req.me && req.me.owner) return next();
  if (seg === 'under-construction' && req.me && req.me.owner) return next();
  if (perm && users.has(req.me, perm)) return next();
  res.status(403).render('admin/denied', adminView(req, {}));
}
const safeNext = n => (typeof n === 'string' && /^\/admin(\/|$)/.test(n) && !/^\/admin\/(login|logout|2fa)/.test(n)) ? n : '/admin';

const loginHits = new Map();
function tooManyLogins(ip, add) {
  const list = (loginHits.get(ip) || []).filter(x => Date.now() - x < 15 * 60 * 1000);
  if (add) list.push(Date.now());
  loginHits.set(ip, list);
  return list.length >= 10;
}
const loginPage = (res, status, error, extra) => res.status(status).render('admin/login', Object.assign({ error, info: null, next: '', resetOn: security.resetEnabled() }, extra || {}));
app.get('/admin/login', (req, res) => loginPage(res, 200, null, { info: req.query.reset ? 'تم تغيير كلمة المرور. ادخل بالكلمة الجديدة.' : null, next: req.query.next || '' }));

// الخطوة الأخيرة: فحص الجهاز ثم فتح الجلسة
function finishLogin(req, res, u, nextUrl, how) {
  const dv = security.deviceCheck(u, req, res);
  if (dv === 'pending') { security.audit(u, 'login_device_pending', how || '', req.ip); return req.session.regenerate(() => res.render('admin/device', { state: 'pending', name: u.name || u.user })); }
  if (dv === 'blocked') { security.audit(u, 'login_device_blocked', how || '', req.ip); return req.session.regenerate(() => res.status(403).render('admin/device', { state: 'blocked', name: u.name || u.user })); }
  req.session.regenerate(() => {
    req.session.uid = u.id; req.session.ver = u.tokenVer || 0;
    security.audit(u, 'login', how || '', req.ip);
    res.redirect(safeNext(nextUrl));
  });
}
app.post('/admin/login', (req, res) => {
  const ip = req.ip || '';
  const b = req.body || {};
  if (tooManyLogins(ip)) return loginPage(res, 429, 'محاولات كتير. استنى ربع ساعة وجرّب تاني.', { next: b.next || '' });
  const r = users.attempt(b.user, b.pass);
  if (!r.ok) {
    tooManyLogins(ip, true);
    if (r.code === 'setup') return loginPage(res, 503, r.msg, { next: b.next || '' });
    if (r.u) security.audit(r.u, r.code === 'bad' ? 'login_fail' : 'login_locked', r.mins ? r.mins + ' د' : '', ip);
    else security.audit(String(b.user || '').slice(0, 60), 'login_fail', 'مستخدم غير موجود', ip);
    /* رد موحّد حتى لو الحساب مقفول (عشان محدش يعرف إن اليوزر موجود) */
    return loginPage(res, 401, 'اسم المستخدم أو كلمة المرور غير صحيحة. لو غلطت كذا مرة الحساب بيتقفل مؤقتاً.', { next: b.next || '' });
  }
  const u = r.u;
  if (users.twoFaOn(u) && security.trustOk(req, u)) { loginHits.delete(ip); return finishLogin(req, res, u, b.next, 'كلمة مرور (جهاز موثوق)'); }
  if (users.twoFaOn(u) || users.twoFaRequired(u)) {
    if (twoFaLocked(u.id)) return loginPage(res, 429, 'محاولات كتير غلط للكود. استنى ربع ساعة وجرّب تاني.', { next: b.next || '' });
    return req.session.regenerate(() => {
      req.session.pend = { uid: u.id, at: Date.now(), next: safeNext(b.next), tries: 0, enroll: !users.twoFaOn(u) };
      res.redirect(users.twoFaOn(u) ? '/admin/2fa' : '/admin/2fa/setup');
    });
  }
  loginHits.delete(ip);
  finishLogin(req, res, u, b.next, 'كلمة مرور');
});
/* التحقق الثنائي: الغلطات بتتحسب على الحساب نفسه (مش بس الـIP) — 10 غلطات = قفل ربع ساعة، ومتتصفّرش بدخول كلمة المرور */
const _tf = new Map();
const twoFaLocked = (uid) => { const f = _tf.get(uid); return !!(f && f.until > Date.now()); };
const twoFaFail = (uid) => { const f = _tf.get(uid) || { n: 0, until: 0 }; if (f.until && f.until <= Date.now()) { f.n = 0; f.until = 0; } if (++f.n >= 10) { f.until = Date.now() + 15 * 60000; f.n = 0; } _tf.set(uid, f); if (_tf.size > 5000) _tf.clear(); };
const pend = req => { const p = req.session && req.session.pend; return p && Date.now() - p.at < 10 * 60000 ? p : null; };
const pendUser = req => { const p = pend(req); const u = p && users.byId(p.uid); return u && u.active !== false ? u : null; };
app.get('/admin/2fa', (req, res) => {
  const u = pendUser(req); if (!u || !users.twoFaOn(u)) return res.redirect('/admin/login');
  res.render('admin/twofa', { error: null, name: u.name || u.user });
});
app.post('/admin/2fa', (req, res) => {
  const u = pendUser(req); const p = pend(req); if (!u || !users.twoFaOn(u)) return res.redirect('/admin/login');
  if (twoFaLocked(u.id)) return req.session.regenerate(() => loginPage(res, 429, 'محاولات كتير غلط للكود. استنى ربع ساعة وجرّب تاني.'));
  const how = users.verify2fa(u, (req.body || {}).code);
  if (!how) {
    tooManyLogins(req.ip || '', true); twoFaFail(u.id);
    security.audit(u, '2fa_fail', '', req.ip);
    if (++p.tries >= 5) { security.audit(u, '2fa_lock', '', req.ip); return req.session.regenerate(() => loginPage(res, 429, 'محاولات كتير غلط للكود. ادخل من الأول.')); }
    return res.status(401).render('admin/twofa', { error: 'الكود غلط أو منتهي', name: u.name || u.user });
  }
  if (how === 'recovery') security.audit(u, '2fa_recovery_used', 'باقي ' + (u.recovery || []).length, req.ip);
  if ((req.body || {}).remember && how !== 'recovery') { security.setTrust(req, res, u); security.audit(u, 'device_trusted', '', req.ip); }
  _tf.delete(u.id); loginHits.delete(req.ip || '');
  finishLogin(req, res, u, p.next, how === 'recovery' ? 'كود طوارئ' : 'تحقق ثنائي');
});
// تفعيل التحقق الثنائي أثناء أول دخول (إجباري للمدير ومن عنده صلاحيات حساسة)
app.get('/admin/2fa/setup', (req, res) => {
  const u = pendUser(req); const p = pend(req); if (!u || users.twoFaOn(u) && !p.codes) return res.redirect('/admin/login');
  if (p.codes) return res.render('admin/twofa-setup', { stage: 'codes', codes: p.codes, action: '/admin/2fa/setup', error: null, secret: '', uri: '', name: u.name || u.user });
  p.secret = p.secret || security.totpNew();
  res.render('admin/twofa-setup', { stage: 'enroll', codes: null, action: '/admin/2fa/setup', error: null, secret: p.secret, uri: security.totpUri(p.secret, u.user, ISSUER), name: u.name || u.user });
});
app.post('/admin/2fa/setup', (req, res) => {
  const u = pendUser(req); const p = pend(req); if (!u || !p) return res.redirect('/admin/login');
  if (p.codes) { // المستخدم حفظ الأكواد → كمّل الدخول
    const nx = p.next; return finishLogin(req, res, u, nx, 'تحقق ثنائي (أول تفعيل)');
  }
  if (!p.secret) return res.redirect('/admin/2fa/setup');
  const codes = users.enable2fa(u.id, p.secret, (req.body || {}).code);
  if (!codes) return res.status(400).render('admin/twofa-setup', { stage: 'enroll', codes: null, action: '/admin/2fa/setup', error: 'الكود غلط — اتأكد إن وقت موبايلك مظبوط وجرّب الكود الجديد', secret: p.secret, uri: security.totpUri(p.secret, u.user, ISSUER), name: u.name || u.user });
  p.codes = codes; delete p.secret; p.enroll = false;
  security.audit(u, '2fa_enabled', 'عند الدخول', req.ip);
  res.render('admin/twofa-setup', { stage: 'codes', codes, action: '/admin/2fa/setup', error: null, secret: '', uri: '', name: u.name || u.user });
});
app.get('/admin/logout', (req, res) => {
  const u = req.session && req.session.uid && users.byId(req.session.uid);
  if (u) security.audit(u, 'logout', '', req.ip);
  req.session.destroy(() => res.redirect('/admin/login'));
});

// ----- نسيت كلمة المرور: الموظفين بإيميل. المدير الأساسي بكود الاسترجاع (OWNER_RESET_CODE) مش بالإيميل -----
app.get('/admin/forgot', (req, res) => res.render('admin/forgot', { sent: false, mailReady: mailer.ready(), error: null, resetOn: security.resetEnabled() }));
app.post('/admin/forgot', async (req, res) => {
  const ip = req.ip || '';
  const view = (o) => res.render('admin/forgot', Object.assign({ sent: false, mailReady: mailer.ready(), error: null, resetOn: security.resetEnabled() }, o));
  if (tooMany('forgot:' + ip, 5, 30 * 60 * 1000)) return res.status(429), view({ error: 'طلبات كتير. جرّب تاني بعد نص ساعة.' });
  const u = users.find(req.body && req.body.email);
  if (u && !u.owner && u.email && u.active !== false && mailer.ready()) {
    const token = users.createReset(u.id, 60);
    security.audit(u, 'reset_requested', '', ip);
    try {
      const link = trustedSiteUrl() + '/admin/reset/' + token;
      await mailer.send([
        ['الاسم', u.name || u.user], ['اسم المستخدم', u.user],
        ['لينك تغيير كلمة المرور', link], ['ملاحظة', 'اللينك شغال لمدة ساعة واحدة. لو مش إنت اللي طلبت، تجاهل الرسالة.']
      ], { subject: 'تغيير كلمة مرور لوحة تحكم نسر الخليج', title: 'تغيير كلمة المرور', to: u.email });
    } catch (e) { console.error('reset mail error:', e.message); }
  }
  // نفس الرد دايماً عشان محدش يعرف مين مسجل
  view({ sent: true });
});
app.get('/admin/reset/:token', (req, res) => {
  const u = users.checkReset(req.params.token);
  res.render('admin/reset', { ok: Boolean(u), token: req.params.token, error: null, name: u ? (u.name || u.user) : '' , user: u ? u.user : '', hint: security.POLICY_HINT });
});
app.post('/admin/reset/:token', (req, res) => {
  const u = users.checkReset(req.params.token);
  const b = req.body || {};
  if (!u || u.owner) return res.render('admin/reset', { ok: false, token: '', error: null, name: '', user: '', hint: '' });
  const bad = (m) => res.render('admin/reset', { ok: true, token: req.params.token, error: m, name: u.name || u.user, user: u.user, hint: security.POLICY_HINT });
  if (b.pass !== b.pass2) return bad('كلمتين المرور مش متطابقتين');
  try { users.setPassword(u.id, b.pass); } catch (e) { return bad(e.message); }
  security.audit(u, 'password_reset', 'بلينك', req.ip);
  res.redirect('/admin/login?reset=1');
});

// ----- المدير الأساسي: استرجاع بكود تطبيق المصادقة / كود طوارئ (التحقق الثنائي بيفضل) أو بكود الاسترجاع -----
const ownerView = (o) => Object.assign({ error: null, ok: false, mode: 'otp', enabled: security.resetEnabled(), otpEnabled: users.list().some(x => x.owner && users.twoFaOn(x)), hint: security.POLICY_HINT }, o);
app.get('/admin/owner-reset', (req, res) => res.render('admin/owner-reset', ownerView({ mode: users.list().some(x => x.owner && users.twoFaOn(x)) ? 'otp' : 'code' })));
const ownerFgFails = { n: 0, until: 0 };
app.post('/admin/owner-forgot', (req, res) => {
  const b = req.body || {};
  const page = (status, o) => res.status(status).render('admin/owner-reset', ownerView(Object.assign({ mode: 'otp' }, o)));
  if (ownerFgFails.until > Date.now()) return page(429, { error: 'محاولات غلط كتير — استنى شوية وجرّب تاني' });
  const owner = users.list().find(x => x.owner && users.twoFaOn(x));
  if (!owner) return page(404, { error: 'مفيش مدير أساسي مفعّل عنده تطبيق المصادقة' });
  if (clean(b.user, 60) && clean(b.user, 60).toLowerCase() !== String(owner.user).toLowerCase()) { if (++ownerFgFails.n >= 5) { ownerFgFails.n = 0; ownerFgFails.until = Date.now() + 15 * 60000; } security.audit('owner-forgot', 'reset_code_fail', '', req.ip); return page(403, { error: 'البيانات غلط' }); }
  const how = users.verify2fa(owner, b.code);
  if (!how) { if (++ownerFgFails.n >= 5) { ownerFgFails.n = 0; ownerFgFails.until = Date.now() + 15 * 60000; } security.audit('owner-forgot', 'reset_code_fail', 'كود نسيان غلط', req.ip); return page(403, { error: 'الكود غلط أو منتهي' }); }
  if (b.pass !== b.pass2) return page(400, { error: 'كلمتين المرور مش متطابقتين' });
  try { users.setPassword(owner.id, b.pass); } catch (e) { return page(400, { error: e.message }); }
  security.clearTrusts(owner.id); ownerFgFails.n = 0;
  security.audit(owner, 'owner_reset', how === 'recovery' ? 'بكود طوارئ (التحقق الثنائي شغّال)' : 'بكود التطبيق (التحقق الثنائي شغّال)', req.ip);
  res.redirect('/admin/login?reset=1');
});
app.post('/admin/owner-reset', (req, res) => {
  const b = req.body || {};
  const page = (status, o) => res.status(status).render('admin/owner-reset', ownerView(Object.assign({ mode: 'code' }, o)));
  const c = security.checkResetCode(b.code);
  if (!c.ok) { security.audit('owner-reset', 'reset_code_fail', '', req.ip); return page(c.status, { error: c.msg }); }
  const owner = users.list().find(x => x.owner);
  if (!owner) return page(404, { error: 'مفيش مدير أساسي لسه — ادخل بـ ADMIN_USER/ADMIN_PASS الأول' });
  if (b.pass !== b.pass2) return page(400, { error: 'كلمتين المرور مش متطابقتين' });
  try { users.setPassword(owner.id, b.pass); } catch (e) { return page(400, { error: e.message }); }
  users.reset2fa(owner.id); users.unlock(owner.id);
  security.audit(owner, 'owner_reset', 'بكود الاسترجاع (التحقق الثنائي اتمسح)', req.ip);
  page(200, { ok: true });
});

// سجل العمليات: أي تعديل (غير GET) ناجح بيتسجل باسم صاحبه وعنوانه (من غير محتوى الحقول أو كلمات المرور)
function auditMw(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  const body = req.body || {};
  res.on('finish', () => {
    if (res.statusCode >= 400 || !req.me) return;
    const who = /^\/users\/save/.test(req.path) ? (body.user || '') : '';
    security.audit(req.me, req.method + ' ' + req.baseUrl + req.path.replace(/[a-f0-9]{16,}/g, ':id'), who, req.ip);
  });
  next();
}
const admin = express.Router({ caseSensitive: true });
app.use('/admin', auth, guard, auditMw, admin);

admin.get('/', (req, res) => {
  const inbox = store.get('inbox');
  res.render('admin/dash', adminView(req, {
    section: 'dash', underCon: underCon(),
    counts: {
      jobs: activeJobs().length, news: store.get('news').length,
      photos: store.get('gallery').items.length,
      messages: inbox.messages.length,
      week: inbox.messages.filter(m => Date.now() - new Date(m.at) < 7 * 864e5).length
    },
    latest: inbox.messages.slice(0, 6),
    defaultPass: Boolean(req.me.defaultPass),
    missingStats: (store.get('site').stats || []).filter(s => !s.value).map(s => tr(s.label, 'ar')),
    quotesCount: (store.get('site').quotes || []).length,
    noEmail: !req.me.email
  }));
});
admin.post('/under-construction', (req, res) => {
  if (!req.me.owner) { flash(req, 'للمدير الأساسي بس', 'err'); return res.redirect('/admin'); }
  const site = store.get('site'); site.underConstruction = !(req.body && req.body.on === '0'); store.set('site', site);
  security.audit(req.me, 'under_construction', site.underConstruction ? 'on' : 'off', req.ip);
  flash(req, site.underConstruction ? 'الموقع دلوقتي «تحت التطوير» — الزوار يشوفوا صفحة مؤقتة، وإنت تدخله عادي.' : 'الموقع دلوقتي ظاهر للعامة ✅');
  res.redirect('/admin');
});

// ----- inbox -----
admin.get('/inbox', (req, res) => {
  const kind = (typeof req.query.kind === 'string' && Object.prototype.hasOwnProperty.call(FORMS, req.query.kind)) ? req.query.kind : '';
  let list = store.get('inbox').messages;
  if (kind) list = list.filter(m => m.kind === kind);
  res.render('admin/inbox', adminView(req, { section: 'inbox', list, kind }));
});
admin.post('/inbox/:id/read', (req, res) => {
  const inbox = store.get('inbox');
  const m = inbox.messages.find(x => x.id === req.params.id);
  if (m) { m.read = req.body.read !== '0'; store.set('inbox', inbox); }
  res.redirect(req.get('referer') || '/admin/inbox');
});
admin.post('/inbox/read-all', (req, res) => {
  const inbox = store.get('inbox');
  inbox.messages.forEach(m => { m.read = true; });
  store.set('inbox', inbox);
  res.redirect('/admin/inbox');
});
admin.post('/inbox/:id/delete', (req, res) => {
  const inbox = store.get('inbox');
  const m = inbox.messages.find(x => x.id === req.params.id);
  if (m) {
    if (m.cv) try { fs.unlinkSync(path.join(CV_DIR, path.basename(m.cv))); } catch (e) {}
    if (m.cvUrl) try { fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(m.cvUrl))); } catch (e) {}
  }
  inbox.messages = inbox.messages.filter(x => x.id !== req.params.id);
  store.set('inbox', inbox);
  flash(req, 'تم حذف الرسالة');
  res.redirect(req.get('referer') || '/admin/inbox');
});
admin.get('/inbox/:id/cv', (req, res) => {
  const m = store.get('inbox').messages.find(x => x.id === req.params.id);
  if (!m) return res.status(404).end();
  if (m.cv) return res.download(path.join(CV_DIR, path.basename(m.cv)), m.cvName || m.cv);
  if (m.cvUrl) return res.download(path.join(UPLOAD_DIR, path.basename(m.cvUrl)));
  res.status(404).end();
});
admin.get('/inbox/export.csv', (req, res) => {
  const all = Object.values(FORMS).flatMap(f => f.fields.map(x => x.k)).filter((v, i, a) => a.indexOf(v) === i);
  const head = ['النوع', 'طريقة الإرسال', 'التاريخ'].concat(all.map(k => {
    const f = Object.values(FORMS).flatMap(x => x.fields).find(x => x.k === k); return dict.ar[f.l];
  }));
  const rows = [head];
  store.get('inbox').messages.forEach(m => rows.push([KIND_LABEL[m.kind], CHANNEL_LABEL[m.channel], m.at].concat(all.map(k => (m.fields || {})[k] || ''))));
  const fx = v => { const t = String(v == null ? '' : v); return /^[=+\-@\t\r]/.test(t) && !/^[+-]?[\d\s().,-]+$/.test(t) ? "'" + t : t; }; /* منع حقن معادلات Excel */
  const csv = '﻿' + rows.map(r => r.map(c => '"' + fx(c).replace(/"/g, '""') + '"').join(',')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="nesr-messages.csv"');
  res.send(csv);
});

// ----- jobs -----
function nextJobCode() {
  const n = store.get('jobs').map(j => parseInt(String(j.code || '').replace(/\D/g, ''), 10) || 0);
  return 'NK-' + String((n.length ? Math.max.apply(null, n) : 0) + 1).padStart(3, '0');
}
admin.get('/jobs', (req, res) => res.render('admin/jobs', adminView(req, { section: 'jobs', jobs: store.get('jobs') })));
admin.get('/jobs/new', (req, res) => res.render('admin/jobform', adminView(req, { section: 'jobs', job: null, code: nextJobCode() })));
admin.get('/jobs/:id/edit', (req, res) => {
  const job = store.get('jobs').find(j => j.id === req.params.id);
  if (!job) return res.redirect('/admin/jobs');
  res.render('admin/jobform', adminView(req, { section: 'jobs', job, code: job.code }));
});
admin.post('/jobs/save', (req, res) => {
  diskImages.single('image')(req, res, err => {
    const b = req.body || {};
    const jobs = store.get('jobs');
    const old = jobs.find(j => j.id === clean(b.id));
    let image = old ? (old.image || '') : '';
    if (b.removeImage === 'on') image = '';
    if (req.file) image = '/uploads/' + req.file.filename;
    const rec = {
      id: old ? old.id : uid(),
      code: clean(b.code, 30) || (old && old.code) || nextJobCode(),
      title: bi(b, 'title'), country: bi(b, 'country'), sector: bi(b, 'sector'),
      count: clean(b.count, 30), salary: bi(b, 'salary'),
      details: bi(b, 'details'),
      approval: clean(b.approval, 100),
      image,
      active: b.active === 'on',
      at: old ? old.at : now(), updated: now()
    };
    if (!rec.title.ar) { flash(req, 'اكتب اسم الوظيفة بالعربي', 'err'); return res.redirect(old ? '/admin/jobs/' + old.id + '/edit' : '/admin/jobs/new'); }
    if (old) Object.assign(old, rec); else jobs.unshift(rec);
    store.set('jobs', jobs);
    flash(req, err ? 'اتحفظت الوظيفة، بس الصورة متقبلتش (الحد 10 ميجا وصيغ jpg/png/webp)' : 'تم حفظ الوظيفة. تقدر دلوقتي تعمل لها صورة للفيسبوك من زرار "صورة للنشر".', err ? 'err' : 'ok');
    res.redirect('/admin/jobs');
  });
});
admin.get('/jobs/:id/poster', (req, res) => {
  const job = store.get('jobs').find(j => j.id === req.params.id);
  if (!job) return res.redirect('/admin/jobs');
  res.render('admin/poster', adminView(req, { section: 'jobs', job, jobUrl: siteUrl(req) + '/ar/jobs/' + job.id, fb: { connected: facebook.connected(), page: facebook.cfg().pageName || '' } }));
});
// نشر صورة الوظيفة على صفحة فيسبوك
const memImage = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
admin.post('/jobs/:id/facebook', (req, res) => {
  memImage.single('image')(req, res, async err => {
    const jobs = store.get('jobs');
    const job = jobs.find(j => j.id === req.params.id);
    if (!job) return res.status(404).json({ ok: false, msg: 'الوظيفة مش موجودة' });
    if (!facebook.connected()) return res.status(400).json({ ok: false, msg: 'صفحة فيسبوك مش مربوطة لسه.' });
    if (err || !req.file) return res.status(400).json({ ok: false, msg: 'الصورة موصلتش. جرّب تاني.' });
    try {
      const r = await facebook.postPhoto(req.file.buffer, req.file.mimetype, clean((req.body || {}).caption, 5000));
      job.fb = (job.fb || []).concat([{ id: r.id, url: r.url, at: now(), by: req.me.name || req.me.user }]);
      store.set('jobs', jobs);
      res.json({ ok: true, url: r.url, msg: 'اتنشرت على صفحة ' + (facebook.cfg().pageName || 'فيسبوك') });
    } catch (e) {
      res.status(502).json({ ok: false, msg: e.message });
    }
  });
});
admin.post('/jobs/:id/toggle', (req, res) => {
  const jobs = store.get('jobs');
  const j = jobs.find(x => x.id === req.params.id);
  if (j) { j.active = j.active === false; store.set('jobs', jobs); flash(req, j.active ? 'الوظيفة ظاهرة على الموقع' : 'الوظيفة اتقفلت واتخفت من الموقع'); }
  res.redirect('/admin/jobs');
});
admin.post('/jobs/:id/delete', (req, res) => {
  store.set('jobs', store.get('jobs').filter(j => j.id !== req.params.id));
  flash(req, 'تم حذف الوظيفة');
  res.redirect('/admin/jobs');
});

// ----- news -----
admin.get('/news', (req, res) => res.render('admin/news', adminView(req, { section: 'news', news: store.get('news'), fbConnected: facebook.connected() })));
admin.get('/news/new', (req, res) => res.render('admin/newsform', adminView(req, { section: 'news', item: null })));
admin.get('/news/:id/edit', (req, res) => {
  const item = store.get('news').find(n => n.id === req.params.id);
  if (!item) return res.redirect('/admin/news');
  res.render('admin/newsform', adminView(req, { section: 'news', item }));
});
admin.post('/news/save', (req, res) => {
  diskImages.array('images', 12)(req, res, err => {
    const b = req.body || {};
    const news = store.get('news');
    const old = news.find(n => n.id === clean(b.id));
    let images = old ? (old.images || (old.image ? [old.image] : [])) : [];
    const remove = [].concat(b.remove || []);
    images = images.filter(x => !remove.includes(x));
    (req.files || []).forEach(f => images.push('/uploads/' + f.filename));
    const rec = {
      id: old ? old.id : uid(),
      title: bi(b, 'title'), text: bi(b, 'text'),
      date: clean(b.date, 20) || now().slice(0, 10),
      video: clean(b.video, 500),
      images, image: images[0] || '',
      at: old ? old.at : now()
    };
    if (!rec.title.ar) { flash(req, 'اكتب عنوان الخبر بالعربي', 'err'); return res.redirect('/admin/news/new'); }
    if (old) Object.assign(old, rec); else news.unshift(rec);
    news.sort((a, b2) => String(b2.date).localeCompare(String(a.date)));
    store.set('news', news);
    flash(req, err ? 'اتحفظ الخبر، بس فيه صورة متقبلتش (الحد 10 ميجا للصورة)' : 'تم حفظ الخبر', err ? 'err' : 'ok');
    res.redirect('/admin/news');
  });
});
admin.post('/news/:id/facebook', async (req, res) => {
  const news = store.get('news');
  const item = news.find(n => n.id === req.params.id);
  if (!item) return res.redirect('/admin/news');
  if (!facebook.connected()) { flash(req, 'صفحة فيسبوك مش مربوطة لسه.', 'err'); return res.redirect('/admin/news'); }
  const link = siteUrl(req) + '/ar/news/' + item.id;
  const caption = [tr(item.title, 'ar'), '', tr(item.text, 'ar'), '', link].join('\n').trim();
  try {
    let r;
    const file = item.image && path.join(UPLOAD_DIR, path.basename(item.image));
    if (file && fs.existsSync(file)) {
      const ext = path.extname(file).toLowerCase();
      r = await facebook.postPhoto(fs.readFileSync(file), ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg', caption);
    } else {
      r = await facebook.postLink([tr(item.title, 'ar'), '', tr(item.text, 'ar')].join('\n').trim(), link);
    }
    item.fb = (item.fb || []).concat([{ id: r.id, url: r.url, at: now(), by: req.me.name || req.me.user }]);
    store.set('news', news);
    flash(req, 'اتنشر الخبر على صفحة ' + (facebook.cfg().pageName || 'فيسبوك'));
  } catch (e) { flash(req, e.message, 'err'); }
  res.redirect('/admin/news');
});
admin.post('/news/:id/delete', (req, res) => {
  store.set('news', store.get('news').filter(n => n.id !== req.params.id));
  flash(req, 'تم حذف الخبر');
  res.redirect('/admin/news');
});

// ----- gallery -----
admin.get('/gallery', (req, res) => {
  const g = store.get('gallery');
  const albums = g.albums.map(a => {
    const items = g.items.filter(i => i.album === a.id);
    const cover = items.find(i => i.id === a.cover) || items[0];
    return Object.assign({}, a, { count: items.length, coverFile: cover ? cover.file : '' });
  });
  res.render('admin/gallery', adminView(req, { section: 'gallery', albums }));
});
admin.post('/gallery/album', (req, res) => {
  const b = req.body || {};
  const g = store.get('gallery');
  const title = bi(b, 'title');
  if (!title.ar) { flash(req, 'اكتب اسم الألبوم', 'err'); return res.redirect('/admin/gallery'); }
  const old = g.albums.find(a => a.id === clean(b.id));
  if (old) old.title = title; else g.albums.unshift({ id: uid(), title, at: now() });
  store.set('gallery', g);
  flash(req, old ? 'تم تعديل اسم الألبوم' : 'تم إنشاء الألبوم، ارفع الصور جواه');
  res.redirect(old ? '/admin/gallery/' + old.id : '/admin/gallery/' + g.albums[0].id);
});
admin.post('/gallery/album/:id/delete', (req, res) => {
  const g = store.get('gallery');
  g.items.filter(i => i.album === req.params.id).forEach(i => { try { fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(i.file))); } catch (e) {} });
  g.albums = g.albums.filter(a => a.id !== req.params.id);
  g.items = g.items.filter(i => i.album !== req.params.id);
  store.set('gallery', g);
  flash(req, 'تم حذف الألبوم وصوره');
  res.redirect('/admin/gallery');
});
admin.get('/gallery/:album', (req, res) => {
  const g = store.get('gallery');
  const album = g.albums.find(a => a.id === req.params.album);
  if (!album) return res.redirect('/admin/gallery');
  res.render('admin/album', adminView(req, { section: 'gallery', album, items: g.items.filter(i => i.album === album.id) }));
});
admin.post('/gallery/:album/upload', (req, res) => {
  diskImages.array('images', 30)(req, res, err => {
    const g = store.get('gallery');
    const album = g.albums.find(a => a.id === req.params.album);
    if (!album) return res.redirect('/admin/gallery');
    const caption = bi(req.body || {}, 'caption');
    (req.files || []).forEach(f => g.items.unshift({ id: uid(), album: album.id, file: '/uploads/' + f.filename, caption, at: now() }));
    store.set('gallery', g);
    flash(req, err ? 'فيه صور متقبلتش (الحد 10 ميجا وصيغ jpg/png/webp)' : 'تم رفع ' + (req.files || []).length + ' صورة', err ? 'err' : 'ok');
    res.redirect('/admin/gallery/' + album.id);
  });
});
admin.post('/gallery/item/:id/caption', (req, res) => {
  const g = store.get('gallery');
  const it = g.items.find(i => i.id === req.params.id);
  if (it) { it.caption = bi(req.body || {}, 'caption'); store.set('gallery', g); flash(req, 'تم حفظ الوصف'); }
  res.redirect(it ? '/admin/gallery/' + it.album : '/admin/gallery');
});
admin.post('/gallery/item/:id/cover', (req, res) => {
  const g = store.get('gallery');
  const it = g.items.find(i => i.id === req.params.id);
  const al = it && g.albums.find(a => a.id === it.album);
  if (al) { al.cover = it.id; store.set('gallery', g); flash(req, 'بقت صورة الغلاف'); }
  res.redirect(it ? '/admin/gallery/' + it.album : '/admin/gallery');
});
admin.post('/gallery/item/:id/delete', (req, res) => {
  const g = store.get('gallery');
  const it = g.items.find(i => i.id === req.params.id);
  if (it) try { fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(it.file))); } catch (e) {}
  g.items = g.items.filter(i => i.id !== req.params.id);
  store.set('gallery', g);
  flash(req, 'تم حذف الصورة');
  res.redirect(it ? '/admin/gallery/' + it.album : '/admin/gallery');
});

// ----- contact & company info -----
admin.get('/contact', (req, res) => res.render('admin/contact', adminView(req, { section: 'contact' })));
admin.post('/contact', (req, res) => {
  diskPdf.single('profile')(req, res, err => {
    const b = req.body || {};
    const site = store.get('site');
    const c = site.contact;
    const list = s => clean(s).split(/[\n,،]+/).map(x => x.trim()).filter(Boolean);
    c.phonesEG = list(b.phonesEG);
    c.phonesSA = list(b.phonesSA);
    c.whatsapp = clean(b.whatsapp, 40);
    c.whatsappCompanies = clean(b.whatsappCompanies, 40);
    c.email = clean(b.email, 200);
    c.address = bi(b, 'address');
    c.hours = bi(b, 'hours');
    c.slogan = bi(b, 'slogan');
    c.mapLink = clean(b.mapLink, 1000);
    ['facebook', 'instagram', 'tiktok', 'linkedin', 'youtube', 'website'].forEach(k => { c[k] = clean(b[k], 500); });
    site.brand.license = clean(b.license, 30);
    site.brand.founded = clean(b.founded, 10);
    if (req.file) site.profilePdf = '/uploads/' + req.file.filename;
    store.set('site', site);
    flash(req, err ? 'اتحفظت البيانات، بس ملف الـ PDF متقبلش (لازم PDF وأقل من 25 ميجا)' : 'تم حفظ بيانات الشركة', err ? 'err' : 'ok');
    res.redirect('/admin/contact');
  });
});

// ----- content editor -----
admin.get('/content', (req, res) => res.redirect('/admin/content/hero'));
// ----- صفحة روابط التواصل (باركود) -----
function loadPages() { return social.pagesOf(store.get('social'), store.get('site')); }
function savePages(pages) { store.set('social', { pages }); }
const socialBack = slug => slug === 'social' ? '/admin/social' : '/admin/social/page/' + slug;
function renderAdminSocial(req, res, slug) {
  const base = (process.env.SITE_URL || _adminHost || '').replace(/\/$/, '');
  const pages = loadPages(); const cfg = pages.find(p => p.slug === slug) || pages[0]; slug = cfg.slug;
  res.render('admin/social', adminView(req, { section: 'social', cfg, slug,
    pages: pages.map(p => ({ slug: p.slug, locked: !!p.locked, title: String(p.title || '').trim(), count: (p.items || []).length })),
    items: social.items(cfg, base || '', false), people: social.people(cfg, false),
    TYPES: social.TYPES, TYPE_LIST: social.TYPE_LIST, THEMES: social.THEMES, THEME_LIST: social.THEME_LIST, BTN_STYLES: social.BTN_STYLES, ICON_STYLES: social.ICON_STYLES,
    publicUrl: (base || '') + '/' + slug }));
}
admin.get('/social', (req, res) => renderAdminSocial(req, res, 'social'));
admin.get('/social/page/:slug', (req, res) => { const s = String(req.params.slug || '').toLowerCase(); if (!loadPages().some(p => p.slug === s)) { flash(req, 'الصفحة مش موجودة', 'err'); return res.redirect('/admin/social'); } renderAdminSocial(req, res, s); });
admin.post('/social/new', (req, res) => {
  const s = String((req.body && req.body.slug) || '').trim().toLowerCase();
  if (!social.slugOk(s)) { flash(req, 'الكلمة لازم إنجليزي صغير وأرقام وشرطة بس، ومش من الكلمات المحجوزة', 'err'); return res.redirect('/admin/social'); }
  const pages = loadPages(); if (pages.some(p => p.slug === s)) { flash(req, 'في صفحة بنفس الكلمة بالفعل', 'err'); return res.redirect(socialBack(s)); }
  if (pages.length >= 30) { flash(req, 'وصلت الحد الأقصى للصفحات', 'err'); return res.redirect('/admin/social'); }
  pages.push(Object.assign(social.seed(store.get('site')), { slug: s, locked: false, items: [], people: [], title: '', tagline: '', avatar: '' }));
  savePages(pages); security.audit(req.me, 'social_page_add', s, req.ip);
  flash(req, 'اتعملت صفحة جديدة: /' + s + ' — ابدأ ضيف لينكاتها'); res.redirect(socialBack(s));
});
admin.post('/social/page/:slug/delete', (req, res) => {
  const s = String(req.params.slug || '').toLowerCase();
  if (s === 'social') { flash(req, 'الصفحة الأساسية متتمسحش', 'err'); return res.redirect('/admin/social'); }
  const pages = loadPages().filter(p => p.slug !== s); savePages(pages);
  security.audit(req.me, 'social_page_del', s, req.ip);
  flash(req, 'اتمسحت صفحة /' + s + ' — أي باركود كان عليها بقى بيفتح صفحة مش موجودة'); res.redirect('/admin/social');
});
admin.post('/social/save', (req, res) => {
  diskImages.any()(req, res, upErr => {
    const b = req.body || {}; const pages = loadPages(); const slug = String(b.page || 'social').toLowerCase();
    const cfg = pages.find(p => p.slug === slug); if (!cfg) { flash(req, 'الصفحة مش موجودة', 'err'); return res.redirect('/admin/social'); }
    const files = {}; (req.files || []).forEach(f => { files[f.fieldname] = '/uploads/' + f.filename; });
    const okImg = u => /^\/uploads\/[\w.-]+$/.test(String(u || '')) ? u : '';
    cfg.title = clean(b.title, 80); cfg.tagline = clean(b.tagline, 160);
    cfg.theme = social.THEME_LIST.includes(b.theme) ? b.theme : 'midnight';
    cfg.btn = b.btn === 'pill' ? 'pill' : 'card'; cfg.icons = b.icons === 'soft' ? 'soft' : 'brand';
    if (files.avatar) cfg.avatar = files.avatar;
    else if (b.avatar_remove === '1') cfg.avatar = '';
    let rows = []; try { rows = JSON.parse(b.items || '[]'); } catch (e) { rows = []; }
    if (Array.isArray(rows)) cfg.items = rows.slice(0, 40).filter(r => r && social.TYPES[r.type]).map((r, i) => ({
      id: clean(r.id, 30) || social.uid(), type: r.type, label: clean(r.label, 80), value: clean(r.value, 400),
      enabled: r.enabled !== false && r.enabled !== 'false',
      img: files['itemimg_' + i] || (r.imgrm ? '' : okImg(r.img)) }));
    savePages(pages); security.audit(req.me, 'social_saved', slug + ': ' + (cfg.items || []).length + ' رابط', req.ip);
    flash(req, upErr ? 'اتحفظ، بس في صورة متقبلتش (الحد 10 ميجا للصورة)' : 'اتحفظت الصفحة', upErr ? 'err' : 'ok');
    res.redirect(socialBack(slug));
  });
});
admin.post('/social/person/save', (req, res) => {
  diskImages.single('photo')(req, res, upErr => {
    const b = req.body || {}; const pages = loadPages(); const slug = String(b.page || 'social').toLowerCase();
    const cfg = pages.find(p => p.slug === slug); if (!cfg) { flash(req, 'الصفحة مش موجودة', 'err'); return res.redirect('/admin/social'); } cfg.people = cfg.people || [];
    const name = clean(b.name, 80); if (!name) { flash(req, 'اكتب اسم الشخص', 'err'); return res.redirect(socialBack(slug)); }
    let pr = (cfg.people || []).find(x => x.id === clean(b.id, 30));
    const base = { name, role: clean(b.role, 80), phone: clean(b.phone, 40), whatsapp: clean(b.whatsapp, 40), enabled: b.enabled !== undefined };
    if (pr) { Object.assign(pr, base); if (req.file) pr.photo = '/uploads/' + req.file.filename; else if (b.photo_remove === '1') pr.photo = ''; }
    else { if (cfg.people.length >= 60) { flash(req, 'العدد كبير', 'err'); return res.redirect(socialBack(slug)); } cfg.people.push(Object.assign({ id: social.uid(), photo: req.file ? '/uploads/' + req.file.filename : '', enabled: true }, base)); }
    savePages(pages); security.audit(req.me, 'social_saved', slug + ' شخص: ' + name, req.ip);
    flash(req, upErr ? 'اتحفظ، بس الصورة متقبلتش' : 'اتحفظ الشخص', upErr ? 'err' : 'ok'); res.redirect(socialBack(slug));
  });
});
admin.post('/social/person/:id/delete', (req, res) => {
  const pages = loadPages(); const slug = String((req.body && req.body.page) || 'social').toLowerCase();
  const cfg = pages.find(p => p.slug === slug); if (cfg) { cfg.people = (cfg.people || []).filter(p => p.id !== req.params.id); savePages(pages); }
  flash(req, 'اتمسح الشخص'); res.redirect(socialBack(slug));
});
admin.post('/social/person/:id/move', (req, res) => {
  const pages = loadPages(); const slug = String((req.body && req.body.page) || 'social').toLowerCase();
  const cfg = pages.find(p => p.slug === slug); if (cfg) { const ps = cfg.people || []; const i = ps.findIndex(p => p.id === req.params.id);
    const j = req.body && req.body.dir === 'up' ? i - 1 : i + 1; if (i >= 0 && j >= 0 && j < ps.length) { const t = ps[i]; ps[i] = ps[j]; ps[j] = t; cfg.people = ps; savePages(pages); } }
  res.redirect(socialBack(slug));
});
admin.get('/content/:key', (req, res) => {
  const sec = content.byKey[req.params.key];
  if (!sec) return res.redirect('/admin/content/hero');
  const site = store.get('site');
  const fallback = sec.key === 'privacy' ? privacyDefault : (sec.kind === 'list' ? [] : {});
  res.render('admin/content', adminView(req, { section: 'content', sections: content.SECTIONS, sec, value: site[sec.key] || fallback, iconNames: ICON_NAMES }));
});
admin.post('/content/:key', (req, res) => {
  const sec = content.byKey[req.params.key];
  if (!sec) return res.redirect('/admin/content');
  let data;
  try { data = JSON.parse(req.body.json || 'null'); } catch (e) { data = null; }
  if (data == null) { flash(req, 'حصلت مشكلة في الحفظ، جرّب تاني', 'err'); return res.redirect('/admin/content/' + sec.key); }
  const site = store.get('site');
  site[sec.key] = content.cleanSection(sec, data);
  store.set('site', site);
  flash(req, 'تم حفظ "' + sec.label + '"');
  res.redirect('/admin/content/' + sec.key);
});

// ----- custom sections (أقسام إضافية) -----
const POSITIONS = [
  ['after_hero', 'بعد الواجهة الرئيسية'], ['after_about', 'بعد "من نحن"'], ['after_services', 'بعد "خدماتنا"'],
  ['after_sectors', 'بعد "القطاعات"'], ['after_jobs', 'بعد "أحدث الوظائف"'], ['before_contact', 'قبل "تواصل معنا" في آخر الصفحة']
];
admin.get('/sections', (req, res) => res.render('admin/sections', adminView(req, { section: 'sections', list: store.get('site').sections || [], POSITIONS })));
admin.get('/sections/new', (req, res) => res.render('admin/sectionform', adminView(req, { section: 'sections', item: null, POSITIONS })));
admin.get('/sections/:id/edit', (req, res) => {
  const item = (store.get('site').sections || []).find(s => s.id === req.params.id);
  if (!item) return res.redirect('/admin/sections');
  res.render('admin/sectionform', adminView(req, { section: 'sections', item, POSITIONS }));
});
admin.post('/sections/save', (req, res) => {
  diskImages.single('image')(req, res, () => {
    const b = req.body || {};
    const site = store.get('site');
    site.sections = site.sections || [];
    const old = site.sections.find(s => s.id === clean(b.id));
    const rec = {
      id: old ? old.id : uid(),
      title: bi(b, 'title'), text: bi(b, 'text'),
      btn: bi(b, 'btn'), link: clean(b.link, 500),
      position: POSITIONS.some(p => p[0] === b.position) ? b.position : 'before_contact',
      style: ['light', 'navy', 'sky'].includes(b.style) ? b.style : 'light',
      visible: b.visible === 'on',
      image: req.file ? '/uploads/' + req.file.filename : (b.removeImage === 'on' ? '' : (old ? old.image : ''))
    };
    if (!rec.title.ar) { flash(req, 'اكتب عنوان القسم بالعربي', 'err'); return res.redirect('/admin/sections/new'); }
    if (old) Object.assign(old, rec); else site.sections.push(rec);
    store.set('site', site);
    flash(req, 'تم حفظ القسم');
    res.redirect('/admin/sections');
  });
});
admin.post('/sections/:id/move', (req, res) => {
  const site = store.get('site');
  const arr = site.sections || [];
  const i = arr.findIndex(s => s.id === req.params.id);
  const j = i + (req.body.dir === 'up' ? -1 : 1);
  if (i >= 0 && j >= 0 && j < arr.length) { [arr[i], arr[j]] = [arr[j], arr[i]]; store.set('site', site); }
  res.redirect('/admin/sections');
});
admin.post('/sections/:id/delete', (req, res) => {
  const site = store.get('site');
  site.sections = (site.sections || []).filter(s => s.id !== req.params.id);
  store.set('site', site);
  flash(req, 'تم حذف القسم');
  res.redirect('/admin/sections');
});

// ----- mail settings -----
admin.get('/mail', (req, res) => res.render('admin/mail', adminView(req, { section: 'mail', mail: store.get('mail'), envPass: Boolean(process.env.MAIL_PASS) })));
admin.post('/mail', (req, res) => {
  const b = req.body || {};
  const m = store.get('mail');
  m.host = clean(b.host, 200);
  m.port = parseInt(b.port, 10) || 465;
  m.secure = b.secure === 'on';
  m.user = clean(b.user, 200);
  if (clean(b.pass, 300)) m.pass = clean(b.pass, 300);
  m.to = clean(b.to, 500);
  m.fromName = clean(b.fromName, 100);
  store.set('mail', m);
  flash(req, 'تم حفظ إعدادات الإيميل. جرّب "إرسال رسالة تجربة" تحت.');
  res.redirect('/admin/mail');
});
admin.post('/mail/test', async (req, res) => {
  try {
    await mailer.send([['الحالة', 'إعدادات الإيميل شغالة، ورسايل الموقع هتوصل هنا.']], { subject: 'رسالة تجربة من موقع نسر الخليج', title: 'رسالة تجربة' });
    flash(req, 'اتبعتت رسالة التجربة. شوف صندوق الوارد في ' + mailer.config().to);
  } catch (e) {
    flash(req, 'الإرسال فشل: ' + String(e && e.message || e).slice(0, 200), 'err');
  }
  res.redirect('/admin/mail');
});

// ----- ربط مسار HR: الاتصال، قنوات الفورمات، وروابط التقديم -----
admin.get('/masar', async (req, res) => {
  const c = masar.cfg();
  let links = null, stats = null, linkErr = '', on = true;
  if (c.ready) { try { const d = await masar.json('/p/api/links'); links = d.items; stats = d.stats; on = d.on; } catch (e) { linkErr = String(e && e.message || e).slice(0, 200); } }
  const msgs = store.get('inbox').messages.filter(m => m.masar);
  res.render('admin/masar', adminView(req, { section: 'masar', m: { url: c.url, hasKey: Boolean(c.key), keyFromEnv: c.fromEnv, ready: c.ready, channels: masar.channels(), set: c.channels }, links, stats, linkErr, on, base: siteUrl(req), sent: { ok: msgs.filter(x => x.masar === 'ok').length, pending: msgs.filter(x => x.masar === 'pending').length, failed: msgs.filter(x => x.masar === 'failed').length } }));
});
admin.post('/masar', (req, res) => {
  const b = req.body || {};
  const url = clean(b.url, 200).replace(/\/+$/, '');
  if (url && !masar.okUrl(url)) { flash(req, 'رابط مسار لازم يبدأ بـ https:// (مثال: https://hr.nisrelkhaleeg.com)', 'err'); return res.redirect('/admin/masar'); }
  /* تغيير رابط مسار أو المفتاح = المدير الأساسي بس (الرابط ده بيتعرض على نفس دومين الموقع، فلو اتغيّر لدومين غريب يبقى استيلاء على اللوحة) */
  const cur = masar.cfg(); const newKey = clean(b.key, 200); const changed = (url && url !== cur.url) || (newKey && !cur.fromEnv);
  if (changed && !req.me.owner) { flash(req, 'تغيير رابط مسار أو المفتاح للمدير الأساسي بس.', 'err'); return res.redirect('/admin/masar'); }
  if (url && url !== cur.url && !newKey && !cur.fromEnv) { const m = store.get('masar') || {}; m.key = ''; store.set('masar', m); } /* الرابط اتغيّر من غير مفتاح جديد = نمسح القديم عشان ميتبعتش لدومين تاني */
  masar.save({ url, key: newKey, channels: { whatsapp: b.ch_whatsapp === 'on', email: b.ch_email === 'on', masar: b.ch_masar === 'on' } });
  flash(req, 'تم حفظ الإعدادات.');
  res.redirect('/admin/masar');
});
admin.post('/masar/test', async (req, res) => {
  try { const d = await masar.json('/p/api/ping'); flash(req, 'الاتصال شغال ✓' + (d.name ? ' — ' + d.name : '')); }
  catch (e) { flash(req, 'الاتصال فشل: ' + String(e && e.message || e).slice(0, 200), 'err'); }
  res.redirect('/admin/masar');
});
admin.post('/masar/links', async (req, res) => {
  try { await masar.json('/p/api/links', { method: 'POST', body: { title: clean(req.body.title, 200), source: clean(req.body.source, 200), expires: clean(req.body.expires, 10), max: parseInt(req.body.max, 10) || 0, requireCv: req.body.requireCv === 'on' } }); flash(req, 'اتعمل الرابط. صمّم صفحته (صور ونصوص) من مسار ← الإعدادات ← رابط التقديم العام.'); }
  catch (e) { flash(req, String(e && e.message || e).slice(0, 200), 'err'); }
  res.redirect('/admin/masar');
});
admin.post('/masar/links/:id/toggle', async (req, res) => {
  try { await masar.json('/p/api/links/' + parseInt(req.params.id, 10), { method: 'PUT', body: { title: clean(req.body.title, 200), source: clean(req.body.source, 200), active: req.body.active === '1' } }); flash(req, req.body.active === '1' ? 'اتفعّل الرابط.' : 'اتوقف الرابط.'); }
  catch (e) { flash(req, String(e && e.message || e).slice(0, 200), 'err'); }
  res.redirect('/admin/masar');
});
admin.post('/masar/links/:id/delete', async (req, res) => {
  try { await masar.json('/p/api/links/' + parseInt(req.params.id, 10), { method: 'DELETE' }); flash(req, 'اتمسح الرابط.'); }
  catch (e) { flash(req, String(e && e.message || e).slice(0, 200), 'err'); }
  res.redirect('/admin/masar');
});
admin.post('/inbox/:id/masar', async (req, res) => {
  const inbox = store.get('inbox');
  const m = inbox.messages.find(x => x.id === req.params.id);
  if (m && m.masar) { m.masarTries = 0; const ok = await pushMasar(m, ''); flash(req, ok ? 'اتبعتت لمسار ✓' : 'لسه فشل: ' + (m.masarError || ''), ok ? 'ok' : 'err'); }
  res.redirect(req.get('referer') || '/admin/inbox');
});

// ----- statistics -----
admin.get('/stats', (req, res) => {
  const n = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  const sum = analytics.summary(n);
  const jobs = store.get('jobs');
  const jobName = id => { const j = jobs.find(x => x.id === id); return j ? (j.code ? j.code + ' - ' : '') + tr(j.title, 'ar') : 'وظيفة محذوفة'; };
  res.render('admin/stats', adminView(req, { section: 'stats', n, sum, jobName }));
});

// ----- ربط صفحة فيسبوك -----
admin.get('/facebook', (req, res) => {
  const c = facebook.cfg();
  res.render('admin/facebook', adminView(req, { section: 'facebook', fb: { connected: facebook.connected(), pageName: c.pageName, pageId: c.pageId, appId: c.appId || '', connectedAt: c.connectedAt, pending: (c.pending || []).map(p => ({ id: p.id, name: p.name, canPost: p.canPost })) } }));
});
admin.post('/facebook/connect', async (req, res) => {
  const b = req.body || {};
  const appId = clean(b.appId, 40), appSecret = clean(b.appSecret, 100), token = clean(b.userToken, 1000);
  if (!appId || !appSecret || !token) { flash(req, 'اكتب App ID و App Secret والتوكن', 'err'); return res.redirect('/admin/facebook'); }
  try {
    const pages = await facebook.connect(appId, appSecret, token);
    if (pages.length === 1) { facebook.selectPage(pages[0].id); flash(req, 'تم ربط صفحة ' + pages[0].name); }
    else flash(req, 'لقينا ' + pages.length + ' صفحات. اختار الصفحة اللي عايز تنشر عليها.');
  } catch (e) { flash(req, e.message, 'err'); }
  res.redirect('/admin/facebook');
});
admin.post('/facebook/select', (req, res) => {
  const p = facebook.selectPage(clean((req.body || {}).pageId, 40));
  flash(req, p ? 'تم ربط صفحة ' + p.name : 'اختار صفحة من القايمة', p ? 'ok' : 'err');
  res.redirect('/admin/facebook');
});
admin.post('/facebook/manual', async (req, res) => {
  const b = req.body || {};
  try {
    const info = await facebook.manual(clean(b.pageId, 40), clean(b.pageToken, 1000));
    flash(req, 'تم ربط صفحة ' + info.name);
  } catch (e) { flash(req, e.message, 'err'); }
  res.redirect('/admin/facebook');
});
admin.post('/facebook/test', async (req, res) => {
  try {
    const info = await facebook.test();
    flash(req, 'الربط شغال: صفحة ' + info.name + (info.followers_count ? ' (' + info.followers_count + ' متابع)' : ''));
  } catch (e) { flash(req, e.message, 'err'); }
  res.redirect('/admin/facebook');
});
admin.post('/facebook/disconnect', (req, res) => {
  facebook.disconnect();
  flash(req, 'اتلغى ربط الصفحة');
  res.redirect('/admin/facebook');
});

// ----- site images -----
admin.get('/images', (req, res) => res.render('admin/images', adminView(req, { section: 'images', slots: IMAGE_SLOTS })));
admin.post('/images/:slot', (req, res) => {
  const slot = IMAGE_SLOTS.find(x => x.k === req.params.slot);
  if (!slot) return res.redirect('/admin/images');
  diskImages.single('image')(req, res, err => {
    const site = store.get('site');
    site.images = site.images || {};
    if (req.body && req.body.reset === '1') { delete site.images[slot.k]; flash(req, 'رجعت الصورة الأصلية لـ "' + slot.label + '"'); }
    else if (req.file) { site.images[slot.k] = '/uploads/' + req.file.filename; flash(req, 'تم تغيير "' + slot.label + '"'); }
    else flash(req, err ? 'الصورة متقبلتش (الحد 10 ميجا وصيغ jpg/png/webp)' : 'اختار صورة الأول', 'err');
    store.set('site', site);
    res.redirect('/admin/images#' + slot.k);
  });
});

// ----- account (كل مستخدم يعدّل بياناته) -----
admin.get('/account', (req, res) => res.render('admin/account', adminView(req, { section: 'account' })));
admin.post('/account', (req, res) => {
  const b = req.body || {};
  const me = req.me;
  const bcryptOk = me.hash && bcrypt.compareSync(b.current || '', me.hash);
  if (!bcryptOk) { flash(req, 'كلمة المرور الحالية غلط', 'err'); return res.redirect('/admin/account'); }
  if (!clean(b.user, 60)) { flash(req, 'اكتب اسم المستخدم', 'err'); return res.redirect('/admin/account'); }
  if (b.email && !/^\S+@\S+\.\S+$/.test(b.email)) { flash(req, 'الإيميل مش مكتوب صح', 'err'); return res.redirect('/admin/account'); }
  if (b.pass && b.pass !== b.pass2) { flash(req, 'كلمتين المرور الجديدة مش متطابقتين', 'err'); return res.redirect('/admin/account'); }
  try {
    users.upsert({ id: me.id, name: clean(b.name, 80), user: clean(b.user, 60), email: clean(b.email, 200), notify: b.notify === 'on', pass: b.pass || '' });
    if (b.pass) { security.audit(me, 'password_changed', '', req.ip); req.session.ver = users.byId(me.id).tokenVer || 0; }
    flash(req, b.pass ? 'تم حفظ بياناتك وتغيير كلمة المرور. أي جهاز تاني متسجل دخول اتفصل.' : 'تم حفظ بياناتك');
  } catch (e) { flash(req, e.message, 'err'); }
  res.redirect('/admin/account');
});
const bad2fa = (req, res, m) => { flash(req, m, 'err'); res.redirect('/admin/account/2fa'); };
admin.get('/account/2fa', (req, res) => {
  const me = req.me; const on = users.twoFaOn(me);
  let secret = '', uri = '';
  if (!on) { req.session.enroll = req.session.enroll || security.totpNew(); secret = req.session.enroll; uri = security.totpUri(secret, me.user, ISSUER); }
  res.render('admin/account2fa', adminView(req, { section: 'account', on, secret, uri, required: users.twoFaRequired(me), left: (me.recovery || []).length, codes: null }));
});
admin.post('/account/2fa/on', (req, res) => {
  const me = req.me; if (users.twoFaOn(me) || !req.session.enroll) return res.redirect('/admin/account/2fa');
  const codes = users.enable2fa(me.id, req.session.enroll, (req.body || {}).code);
  if (!codes) return bad2fa(req, res, 'الكود غلط — جرّب الكود الجديد من التطبيق');
  delete req.session.enroll; security.audit(me, '2fa_enabled', '', req.ip);
  res.render('admin/account2fa', adminView(req, { section: 'account', on: true, secret: '', uri: '', required: users.twoFaRequired(me), left: codes.length, codes }));
});
admin.post('/account/2fa/codes', (req, res) => {
  const me = req.me; const b = req.body || {};
  if (!me.hash || !bcrypt.compareSync(b.current || '', me.hash)) return bad2fa(req, res, 'كلمة المرور غلط');
  const codes = users.newRecovery(me.id); if (!codes) return res.redirect('/admin/account/2fa');
  security.audit(me, '2fa_codes_renewed', '', req.ip);
  res.render('admin/account2fa', adminView(req, { section: 'account', on: true, secret: '', uri: '', required: users.twoFaRequired(me), left: codes.length, codes }));
});
admin.post('/account/2fa/off', (req, res) => {
  const me = req.me; const b = req.body || {};
  if (users.twoFaRequired(me)) return bad2fa(req, res, 'التحقق الثنائي إجباري لحسابك ومينفعش يتقفل');
  if (!me.hash || !bcrypt.compareSync(b.current || '', me.hash)) return bad2fa(req, res, 'كلمة المرور غلط');
  users.disable2fa(me.id); req.session.ver = users.byId(me.id).tokenVer || 0; security.audit(me, '2fa_disabled', '', req.ip);
  flash(req, 'اتقفل التحقق الثنائي'); res.redirect('/admin/account/2fa');
});
admin.post('/account/logout-all', (req, res) => {
  users.logoutAll(req.me.id); security.clearTrusts(req.me.id); security.audit(req.me, 'logout_all', '', req.ip);
  flash(req, 'اتفصلت كل الأجهزة التانية (جلستك دي فاضلة)'); req.session.ver = users.byId(req.me.id).tokenVer || 0; res.redirect('/admin/account');
});

// ----- الأمان (للي معاه صلاحية المستخدمين): إعدادات + موافقة الأجهزة + الحسابات المقفولة -----
admin.get('/security', (req, res) => res.render('admin/security', adminView(req, { section: 'security', st: security.settings(), devices: security.devices().slice().reverse(), list: users.list(), uname: id => { const x = users.byId(id); return x ? (x.name || x.user) : '(محذوف)'; } })));
// ----- الاستضافة والتجديد + نسخة الموقع على Google Drive (عن طريق سيستم التوظيف) -----
admin.get('/hosting', (req, res) => { if (!req.me.owner) return res.status(403).render('admin/denied', adminView(req, { section: 'hosting' })); const h = hostCfg(); res.render('admin/hosting', adminView(req, { section: 'hosting', h, drive: Object.assign({ ready: masar.cfg().ready }, store.get('drive') || {}), days: { host: hostDays(h.until), domain: hostDays(h.domainUntil) } })); });
const SITE_ZIP_README = ['إزاي ترفع الموقع ده على استضافة جديدة:', '', '1) اعمل تطبيق Node.js جديد (Express، Node 20 أو أحدث، ملف الدخول server.js) وارفع الملف ده زي ما هو.', '2) المتغيرات: SESSION_SECRET (نفس القيمة القديمة لو معاك — غير كده المدير يستخدم كود الاسترجاع ويربط التحقق الثنائي من جديد)، SITE_URL، DATA_DIR=~/nesr-data، UPLOAD_DIR=~/nesr-uploads، ومعاهم MAIL_* و MASAR_URL و MASAR_SITE_KEY و OWNER_RESET_CODE لو كانوا مستخدمين.', '3) أول تشغيل بينسخ البيانات (data) والصور (public/uploads) اللي جوه الملف ده لـ DATA_DIR و UPLOAD_DIR لوحده — يعني كل المحتوى والرسايل والمستخدمين بيرجعوا زي ما هم.', '4) اربط الدومين وفعّل SSL.', '', 'الملف ده فيه بيانات الشركة والرسايل — احفظه في مكان آمن.'].join('\r\n');
function siteFiles() {
  const out = []; const skip = n => /^\./.test(n) || n === 'node_modules';
  const walk = (abs, rel, isSkipped) => { let st; try { st = fs.statSync(abs); } catch (e) { return; } if (st.isDirectory()) { for (const n of fs.readdirSync(abs)) { if (skip(n)) continue; const r = rel ? rel + '/' + n : n; if (isSkipped && isSkipped(r)) continue; walk(path.join(abs, n), r, isSkipped); } } else if (st.isFile() && !/\.env(\.|$)/.test(rel) && rel !== 'data/drive.json') out.push({ rel, abs, size: st.size, mtime: st.mtime }); };
  for (const f of ['server.js', 'package.json', 'package-lock.json', 'README.md']) walk(path.join(__dirname, f), f);
  for (const d of ['lib', 'views', 'scripts']) walk(path.join(__dirname, d), d);
  walk(path.join(__dirname, 'public'), 'public', r => r === 'public/uploads' || r.startsWith('public/uploads/'));
  walk(store.DIR, 'data'); walk(UPLOAD_DIR, 'public/uploads'); return out;
}
async function writeSiteZip(out) { const z = require('./lib/zipper').createZip(out); for (const f of siteFiles()) await z.add(f.rel, fs.readFileSync(f.abs), f.mtime); await z.add('اقراني - النقل.txt', SITE_ZIP_README); await z.end(); }
admin.get('/hosting/export', async (req, res) => {
  if (!req.me.owner) return res.status(403).render('admin/denied', adminView(req, { section: 'hosting' }));
  const day = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/zip'); res.setHeader('Content-Disposition', `attachment; filename="nesr-site-full-${day}.zip"`); res.setHeader('Cache-Control', 'no-store');
  try { await writeSiteZip(res); security.audit(req.me, 'export_all', day, req.ip); } catch (e) { console.error('export:', e && e.message); try { res.destroy(e); } catch (x) {} }
});
let drivePushing = false;
const siteFp = () => require('crypto').createHash('sha1').update(siteFiles().map(f => f.rel + ':' + f.size + ':' + f.mtime.getTime()).join('|')).digest('hex');
async function pushSiteDrive(by) {
  const c = masar.cfg(); if (!c.ready) return { ok: false, error: 'الموقع مش مربوط بسيستم التوظيف (لوحة التحكم ← ربط مسار)' }; if (drivePushing) return { ok: false, error: 'فيه رفع شغال دلوقتي' };
  drivePushing = true; const st = { at: new Date().toISOString(), by: by || 'تلقائي' }; const tmp = path.join(require('os').tmpdir(), 'site-drive-' + process.pid + '-' + Date.now() + '.zip');
  try {
    const fp = siteFp(); await new Promise((ok, bad) => { const w = fs.createWriteStream(tmp); w.on('finish', ok); w.on('error', bad); writeSiteZip(w).catch(bad); });
    const buf = fs.readFileSync(tmp); const name = `site-full-${st.at.slice(0, 10)}.zip`;
    const r = await fetch(c.url + '/p/api/site-backup', { method: 'POST', headers: { 'X-Site-Key': c.key, 'Content-Type': 'application/zip', 'X-File-Name': name }, body: buf, redirect: 'manual', signal: AbortSignal.timeout(15 * 60000) });
    const d = await r.json().catch(() => ({})); if (!r.ok || d.ok === false) throw new Error(d.message || (r.status === 404 ? 'سيستم التوظيف رفض المفتاح — اتأكد من الربط' : r.status === 413 ? 'الملف أكبر من المسموح' : 'خطأ ' + r.status));
    Object.assign(st, { ok: true, name: d.name || name, mb: d.mb, fp });
  } catch (e) { Object.assign(st, { ok: false, error: String(e && e.message || e).slice(0, 200) }); }
  finally { drivePushing = false; try { fs.unlinkSync(tmp); } catch (e) {} }
  const prev = store.get('drive'); store.set('drive', Object.assign({}, prev, { last: st }, st.ok ? { lastOk: st } : {})); return st;
}
async function driveTick() {
  if (!masar.cfg().ready) return; const d = store.get('drive') || {}; const ok = d.lastOk, last = d.last, now = Date.now();
  if (last && !last.ok && now - new Date(last.at) < 6 * 3600000) return;
  if (ok && now - new Date(ok.at) < 7 * 86400000 && (now - new Date(ok.at) < 86400000 || ok.fp === siteFp())) return;
  await pushSiteDrive('تلقائي');
}
setTimeout(() => driveTick().catch(() => {}), 3 * 60000).unref(); setInterval(() => driveTick().catch(() => {}), 3600000).unref();
admin.post('/hosting/drive', async (req, res) => {
  if (!req.me.owner) { flash(req, 'للمدير الأساسي بس', 'err'); return res.redirect('/admin'); }
  const st = await pushSiteDrive(req.me.name || 'المدير'); if (st.ok) security.audit(req.me, 'site_drive', st.name, req.ip);
  flash(req, st.ok ? `اترفعت نسخة الموقع على Google Drive ✓ (${st.mb} ميجا)` : 'الرفع على Drive فشل: ' + st.error, st.ok ? 'ok' : 'err'); res.redirect('/admin/hosting');
});
const hostPwFails = { n: 0, until: 0 };
admin.post('/hosting', (req, res) => {
  if (!req.me.owner) { flash(req, 'للمدير الأساسي بس', 'err'); return res.redirect('/admin'); }
  const b = req.body || {}; const d = x => /^\d{4}-\d{2}-\d{2}$/.test(String(x || '')) && !isNaN(new Date(x)) ? String(x) : ''; const t = (x, n) => String(x || '').replace(/[<>\r\n]/g, '').trim().slice(0, n); const u = t(b.renewUrl, 300);
  const site = store.get('site'); const cur = hostCfg(); const nh = { until: d(b.until), domainUntil: d(b.domainUntil), provider: t(b.provider, 60), renewUrl: /^https:\/\/[^\s"'<>]+$/.test(u) ? u : '', note: t(b.note, 500) };
  if (nh.until !== cur.until || nh.domainUntil !== cur.domainUntil) {
    const f = hostPwFails; if (f.until > Date.now()) { flash(req, 'محاولات كتير غلط — استنى شوية وجرّب تاني', 'err'); return res.redirect('/admin/hosting'); }
    if (!req.me.hash || !bcrypt.compareSync(String(b.current || '').slice(0, 200), req.me.hash)) { if (++f.n >= 5) { f.n = 0; f.until = Date.now() + 15 * 60000; } flash(req, b.current ? 'كلمة المرور غلط — التواريخ متغيرتش' : 'اكتب كلمة المرور بتاعتك عشان تغيّر التواريخ', 'err'); return res.redirect('/admin/hosting'); }
    f.n = 0; security.audit(req.me, 'hosting_dates', `الاستضافة: ${cur.until || '—'} ← ${nh.until || '—'} · الدومين: ${cur.domainUntil || '—'} ← ${nh.domainUntil || '—'}`, req.ip); }
  site.hosting = nh; store.set('site', site);
  flash(req, 'اتحفظ ميعاد الاستضافة'); res.redirect('/admin/hosting');
});
admin.post('/security/settings', (req, res) => {
  const b = req.body || {};
  if (!req.me.owner) { flash(req, 'إعدادات الأمان للمدير الأساسي بس', 'err'); return res.redirect('/admin/security'); }
  security.setSettings({ require2fa: b.require2fa === 'on', deviceApproval: b.deviceApproval === 'on' });
  flash(req, 'تم حفظ إعدادات الأمان'); res.redirect('/admin/security');
});
admin.post('/security/device/:id/:act', (req, res) => {
  const act = req.params.act;
  if (act === 'delete') { security.removeDevice(req.params.id); flash(req, 'اتشال الجهاز'); return res.redirect('/admin/security'); }
  const x = security.decide(req.params.id, act === 'approve' ? 'approved' : 'blocked', req.me.name || req.me.user);
  if (x) security.audit(req.me, 'device_' + act, x.label + ' — ' + users.byId(x.userId)?.user, req.ip);
  flash(req, x ? (act === 'approve' ? 'تمت الموافقة على الجهاز' : 'اتحظر الجهاز') : 'الجهاز مش موجود', x ? 'ok' : 'err'); res.redirect('/admin/security');
});
admin.post('/security/user/:id/:act', (req, res) => {
  const t = users.byId(req.params.id); const act = req.params.act;
  if (!t) { flash(req, 'المستخدم مش موجود', 'err'); return res.redirect('/admin/security'); }
  if (t.owner && !req.me.owner) { flash(req, 'حساب المدير الأساسي من صاحبه بس', 'err'); return res.redirect('/admin/security'); }
  if (act === 'unlock') users.unlock(t.id);
  else if (act === 'reset2fa') users.reset2fa(t.id);
  else if (act === 'logout') users.logoutAll(t.id);
  else return res.redirect('/admin/security');
  if (t.id === req.me.id) req.session.ver = users.byId(t.id).tokenVer || 0;
  security.audit(req.me, 'user_' + act, t.user, req.ip);
  flash(req, act === 'unlock' ? 'اتفتح الحساب' : act === 'reset2fa' ? 'اتمسح التحقق الثنائي — هيفعّله من جديد عند الدخول الجاي' : 'اتفصل من كل أجهزته'); res.redirect('/admin/security');
});
admin.get('/audit', (req, res) => res.render('admin/audit', adminView(req, { section: 'audit', q: clean(req.query.q, 80), items: security.auditList(req.query.q, 400) })));

// ----- users & permissions -----
admin.get('/users', (req, res) => res.render('admin/users', adminView(req, { section: 'users', list: users.list() })));
admin.get('/users/new', (req, res) => res.render('admin/userform', adminView(req, { section: 'users', item: null })));
admin.get('/users/:id/edit', (req, res) => {
  const item = users.byId(req.params.id);
  if (!item) return res.redirect('/admin/users');
  if (item.owner && !req.me.owner) { flash(req, 'حساب المدير الأساسي بيتعدل من صاحبه بس', 'err'); return res.redirect('/admin/users'); }
  res.render('admin/userform', adminView(req, { section: 'users', item }));
});
admin.post('/users/save', async (req, res) => {
  const b = req.body || {};
  const old = b.id ? users.byId(b.id) : null;
  const back = old ? '/admin/users/' + old.id + '/edit' : '/admin/users/new';
  if (old && old.owner && !req.me.owner) { flash(req, 'حساب المدير الأساسي بيتعدل من صاحبه بس', 'err'); return res.redirect('/admin/users'); }
  const email = clean(b.email, 200);
  if (!clean(b.user, 60) || !email) { flash(req, 'اكتب اسم المستخدم والإيميل', 'err'); return res.redirect(back); }
  if (!/^\S+@\S+\.\S+$/.test(email)) { flash(req, 'الإيميل مش مكتوب صح', 'err'); return res.redirect(back); }
  // محدش يدي صلاحية "المستخدمين" غير المدير الأساسي
  let perms = [].concat(b.perms || []).filter(p => users.ALL.includes(p));
  if (!req.me.owner) perms = perms.filter(p => p !== 'users');
  let u;
  try {
    u = users.upsert({ id: old ? old.id : undefined, name: clean(b.name, 80), user: clean(b.user, 60), email, perms, active: b.active === 'on', notify: b.notify === 'on', pass: b.pass || '' });
  } catch (e) { flash(req, e.message, 'err'); return res.redirect(back); }
  if (u.id === req.me.id) req.session.ver = u.tokenVer || 0;
  let msg = 'تم حفظ المستخدم';
  if (!old && !b.pass) {
    if (mailer.ready()) {
      const token = users.createReset(u.id, 48 * 60);
      try {
        await mailer.send([
          ['أهلاً', u.name || u.user], ['اسم المستخدم', u.user],
          ['اختار كلمة المرور من هنا', siteUrl(req) + '/admin/reset/' + token],
          ['لوحة التحكم', siteUrl(req) + '/admin'], ['ملاحظة', 'اللينك شغال لمدة 48 ساعة.']
        ], { subject: 'دعوة للوحة تحكم موقع نسر الخليج', title: 'تم إضافتك للوحة التحكم', to: u.email });
        msg = 'تم إضافة المستخدم، واتبعتله إيميل يختار منه كلمة المرور';
      } catch (e) { msg = 'اتضاف المستخدم، بس إيميل الدعوة مااتبعتش: ' + e.message; }
    } else msg = 'اتضاف المستخدم من غير كلمة مرور. الإيميل مش متظبط، فاكتبله كلمة مرور من صفحة التعديل.';
  }
  flash(req, msg);
  res.redirect('/admin/users');
});
admin.post('/users/:id/invite', async (req, res) => {
  const u = users.byId(req.params.id);
  if (!u || !u.email) { flash(req, 'المستخدم ده ملوش إيميل', 'err'); return res.redirect('/admin/users'); }
  try {
    const token = users.createReset(u.id, 48 * 60);
    await mailer.send([['اسم المستخدم', u.user], ['اختار كلمة مرور جديدة من هنا', siteUrl(req) + '/admin/reset/' + token], ['ملاحظة', 'اللينك شغال لمدة 48 ساعة.']],
      { subject: 'لينك كلمة مرور لوحة تحكم نسر الخليج', title: 'تعيين كلمة المرور', to: u.email });
    flash(req, 'اتبعت لينك كلمة المرور على ' + u.email);
  } catch (e) { flash(req, 'الإرسال فشل: ' + e.message, 'err'); }
  res.redirect('/admin/users');
});
admin.post('/users/:id/delete', (req, res) => {
  if (req.params.id === req.me.id) { flash(req, 'مينفعش تحذف حسابك', 'err'); return res.redirect('/admin/users'); }
  flash(req, users.remove(req.params.id) ? 'تم حذف المستخدم' : 'مينفعش تحذف المدير الأساسي', 'ok');
  res.redirect('/admin/users');
});

// ---------- errors ----------
// صفحة باركود بكلمة مخصّصة /<slug> — بتتفحص آخر حاجة قبل 404
app.get('/:slug', (req, res, next) => { const s = String(req.params.slug || '').toLowerCase(); if (!social.slugOk(s)) return next(); if (renderSocialPage(req, res, s)) return; next(); });
app.use((req, res) => notFound(req, res));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('server error');
});

app.listen(PORT, () => console.log('Nasr Al-Khaleej website: http://localhost:' + PORT + '  |  admin: /admin'));

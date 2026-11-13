/**
 * موقع شركة روك لاين جروب للتوريدات العامة وتجارة الحديد والأسمنت (Rock Line Group)
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
const uitexts = require('./lib/uitexts');
const chat = require('./lib/chat');
const privacyDefault = require('./lib/privacy-default');

// ترقية لمرة واحدة: لو البيانات المحفوظة على السيرفر لسه بتاعة النسخة القديمة (نسر الخليج)، نبدأ بمحتوى روك لاين الافتراضي.
// بنحتفظ بوضع «تحت التطوير» ومواعيد الاستضافة بس — باقي المحتوى (والصور والوظائف القديمة) بيتشال.
(function rebrandOldData() {
  try {
    const site = store.get('site');
    if (!/Nasr Al-Khaleej|نسر الخليج/.test(JSON.stringify((site && site.brand) || {}))) return;
    const fresh = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'site.json'), 'utf8'));
    ['underConstruction', 'hosting'].forEach(k => { if (site[k] !== undefined) fresh[k] = site[k]; });
    store.set('site', fresh);
    console.log('اتحدّث محتوى الموقع لروك لاين (كان لسه محتوى النسخة القديمة).');
  } catch (e) { console.error('rebrand:', e && e.message); }
})();

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
  res.locals.nonce = require('crypto').randomBytes(16).toString('base64'); // nonce للسكربتات الـ inline في الصفحات العامة (وصفحة الخطأ لو اتعرضت جوه /admin)
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
  else {
    // الصفحات العامة: السكربتات من الموقع نفسه أو بـ nonce (مفيش inline سكربت من غير nonce)، ومفيش اتصال لأي دومين تاني
    const nonce = res.locals.nonce;
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'nonce-" + nonce + "'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self'; frame-src https://www.youtube-nocookie.com https://www.youtube.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'");
  }
  next();
});
app.use(express.urlencoded({ extended: true, limit: '4mb' }));
app.use(express.json({ limit: '256kb' }));
app.use(express.text({ limit: '64kb' }));

// الصور المرفوعة بس هي اللي بتتعرض للزوار. أي ملف تاني (زي السير الذاتية القديمة) مقفول.
app.use('/uploads', (req, res, next) => {
  if (!/\.(jpe?g|png|webp|gif|pdf)$/i.test(req.path)) return res.status(404).end();
  if (/\.pdf$/i.test(req.path) && !/^\/(profile|datasheet)-/.test(req.path)) return res.status(404).end();
  next();
}, express.static(UPLOAD_DIR, { maxAge: '30d' }));
/* أي طلب لـ uploads وصل هنا (مثلاً //uploads/x.docx) مقفول — كان بيعدّي على static بتاع public ويتخطى الفلتر */
app.use((req, res, next) => /^\/+uploads(\/|$)/i.test(req.path.replace(/\\/g, '/')) ? res.status(404).end() : next());
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '7d' }));

app.use(session({
  name: 'rl.sid',
  secret: security.sessionSecret(),
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 12, httpOnly: true, sameSite: 'lax', secure: 'auto' }
}));

/* وضع «تحت التطوير»: الزوار يشوفوا صفحة مؤقتة، والمدير المسجّل دخوله يشوف الموقع الحقيقي (وفوقه شريط تنبيه).
   بيتحكم فيه إعداد محفوظ (site.underConstruction) + متغير UNDER_CONSTRUCTION. كل البيانات محفوظة — مجرد واجهة. */
function underCon() {
  const e = String(process.env.UNDER_CONSTRUCTION || '').toLowerCase().trim();
  if (['1', 'true', 'on', 'yes'].includes(e)) return true;
  if (['0', 'false', 'off', 'no'].includes(e)) return false;
  return (store.get('site') || {}).underConstruction !== false; // افتراضي: مفعّل
}
const UC_SKIP = /^\/(admin|p|t|health|robots\.txt|sitemap\.xml|favicon\.ico|css|js|img|uploads|fonts|vendor)(\/|$)/;
// المدير المسجّل دخوله (نفس شروط لوحة التحكم: حساب شغّال + الجلسة سليمة + التحقق الثنائي لو مطلوب) بيشوف الموقع الحقيقي
function ucAdmin(req) {
  const u = req.session && req.session.uid && users.byId(req.session.uid);
  if (!u || u.active === false || (req.session.ver || 0) !== (u.tokenVer || 0)) return false;
  return !(users.twoFaRequired(u) && !users.twoFaOn(u));
}
app.use((req, res, next) => {
  if (UC_SKIP.test(req.path) || !underCon()) return next();
  if (ucAdmin(req)) {
    // نسخة المدير متتخزنش في أي كاش ومتتأرشفش، عشان الزوار ميشوفوهاش بالغلط
    res.set({ 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' });
    res.locals.ucPreview = true;
    return next();
  }
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
// نموذج المنتج: صور + ورقة بيانات فنية PDF (بتتعرض للعامة)
const diskProduct = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, file.fieldname === 'datasheet'
      ? 'datasheet-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6) + '.pdf'
      : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6) + path.extname(file.originalname).toLowerCase())
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.fieldname === 'datasheet' ? /\.pdf$/i.test(file.originalname) : /\.(jpe?g|png|webp|gif)$/i.test(file.originalname))
});
const unlinkUpload = x => { if (/^\/uploads\//.test(x || '')) { try { fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(x))); } catch (e) {} } };
// مرفقات الفورمات (رسومات / مقايسة / ملف تعريفي / سيرة ذاتية) — بتتحفظ في data/cv ومش متاحة للعامة
const memFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => cb(null, /\.(pdf|docx?|xlsx?|jpe?g|png|webp)$/i.test(file.originalname))
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
  { k: 'logo', label: 'العلامة (الشعار المختصر)', hint: 'العلامة لوحدها — بتظهر في أعلى كل الصفحات جنب اسم الشركة. PNG بخلفية شفافة.', def: '/img/logo.png' },
  { k: 'logoFull', label: 'الشعار الكامل (على خلفية فاتحة)', hint: 'العلامة + اسم الشركة بالكتابة الغامقة. بيظهر في صفحة «تحت التطوير» وصور النشر. PNG شفاف.', def: '/img/logo-full.png' },
  { k: 'logoLight', label: 'الشعار الكامل (على خلفية كحلي)', hint: 'نفس الشعار بالكتابة الفاتحة — بيظهر في الفوتر. PNG شفاف.', def: '/img/logo-full-light.png' },
  { k: 'hero', label: 'صورة الواجهة الرئيسية', hint: 'الصورة الكبيرة في أول الصفحة الرئيسية — يفضل صورة لمشروع أو موقع عمل، عرضية وعالية الجودة (مثلاً 1920×1080). لو سبتها فاضية كل تصميم بيستخدم صورته الافتراضية.', def: '' },
  { k: 'about', label: 'صورة "من نحن"', hint: 'صورة لفريق العمل أو موقع (مثلاً 1200×960).', def: '/img/photos/05.jpg' },
  { k: 'banner', label: 'خلفية عناوين الصفحات', hint: 'بتظهر ورا عنوان كل صفحة داخلية. عرضية (مثلاً 1920×700).', def: '/img/photos/50.jpg' },
  { k: 'project', label: 'صورة المنتج الافتراضية', hint: 'بتظهر لأي منتج لسه مرفعتلوش صور.', def: '/img/project.svg' },
  { k: 'fleet', label: 'صورة أسطول النقل', hint: 'بتظهر في قسم «أسطول نقل ثقيل» في الرئيسية. الأفضل صورة حقيقية لعربيات الشركة (عرضية، مثلاً 1200×900). لو سبتها فيه رسمة توضيحية.', def: '/img/products/fleet.svg' },
  { k: 'favicon', label: 'أيقونة المتصفح (favicon)', hint: 'الأيقونة الصغيرة في تبويب المتصفح. PNG مربعة (مثلاً 256×256).', def: '/img/favicon.png' },
  { k: 'og', label: 'صورة المشاركة على فيسبوك وواتساب', hint: 'بتظهر لما حد يشارك لينك الموقع. المقاس 1200×630.', def: '/img/og.jpg' }
];
// صور كروت الخدمات (واحدة لكل خدمة) بتظهر في التصميم البرتقالي
function imageSlots() {
  const svc = (store.get('site').services || []).map((s, i) => ({ k: 'svc' + i, label: 'صورة خدمة: ' + (tr(s.title, 'ar') || (i + 1)), hint: 'بتظهر على كارت الخدمة في التصميم البرتقالي (D).', def: SVC_IMG[i % SVC_IMG.length] }));
  return IMAGE_SLOTS.concat(svc);
}
function siteImg(site, slot, theme) {
  if (site.images && site.images[slot]) return site.images[slot];
  if (slot === 'hero') return THEMES[theme || themeKey(site)].hero;
  return (imageSlots().find(x => x.k === slot) || {}).def || '';
}

// ---------- تصميمات الموقع (بتتغير من لوحة التحكم ← شكل الموقع) ----------
const THEMES = {
  a: { label: 'كلاسيكي فاخر', desc: 'صورة كبيرة بعرض الشاشة، كحلي ورملي زي الشعار، وشكل رسمي هادي.', font: 'IBM+Plex+Sans+Arabic:wght@300;400;500;600;700', hero: '/img/photos/05.jpg', color: '#1c2b3e' },
  b: { label: 'داكن جريء', desc: 'خلفية غامقة وخط كبير وصورة مقصوصة بزاوية زي حرف R في الشعار.', font: 'Cairo:wght@400;600;700;800;900', hero: '/img/photos/02.jpg', color: '#0d0f12' },
  d: { label: 'حديث بلمسة برتقالي', desc: 'أبيض ورمادي غامق مع برتقالي مواقع العمل، وكروت بصور.', font: 'Tajawal:wght@400;500;700;800', hero: '/img/photos/03.jpg', color: '#f0661c' }
};
const themeKey = site => (Object.prototype.hasOwnProperty.call(THEMES, site && site.theme) ? site.theme : 'a');
// المدير المسجّل دخوله يقدر يعاين أي تصميم قبل ما يعتمده (المعاينة محفوظة في جلسته بس)
function themeOf(req) {
  const pv = req.session && req.session.previewTheme;
  if (pv && Object.prototype.hasOwnProperty.call(THEMES, pv) && ucAdmin(req)) return pv;
  return themeKey(store.get('site'));
}
// صور افتراضية للخدمات (بتظهر في التصميم البرتقالي) بالترتيب
const SVC_IMG = ['/img/photos/02.jpg', '/img/products/cement-bag.svg', '/img/products/cement-bulk.svg', '/img/photos/04.jpg', '/img/products/warehouse.svg', '/img/photos/03.jpg', '/img/products/fleet.svg'];
const photoCredits = require('./lib/photo-credits.json');

// نصوص الواجهة بعد ما نطبّق عليها تعديلات لوحة التحكم (site.ui)
const UI = lang => uitexts.merged(lang, store.get('site'));

function customSections(pos) {
  return (store.get('site').sections || []).filter(s => s.visible !== false && s.position === pos);
}
// طرق إرسال الفورمات (من لوحة التحكم ← إعدادات الإيميل): واتساب / إيميل
function channels() { const c = store.get('site').channels || {}; return { whatsapp: c.whatsapp !== false, email: c.email !== false }; }

// ---------- المشروعات ----------
function activeProjects() { return (store.get('projects') || []).filter(p => p.visible !== false); }
// اسم القطاع بلغة الزائر (المشروع بيتخزن عليه اسم القطاع بالعربي)
function catName(site, cat, lang) { const s = (site.sectors || []).find(x => tr(x.name, 'ar') === cat); return s ? tr(s.name, lang) : (cat || ''); }
function catIcon(site, cat) { const s = (site.sectors || []).find(x => tr(x.name, 'ar') === cat); return s ? s.icon : 'building'; }

// أقسام الصفحة الرئيسية (الترتيب والإظهار بيتغيروا من لوحة التحكم ← ترتيب الصفحة الرئيسية)
const HOME_SECTIONS = [
  { id: 'about', label: 'من نحن', on: true }, { id: 'services', label: 'الخدمات', on: true }, { id: 'products', label: 'المنتجات', on: true },
  { id: 'process', label: 'طريقة الطلب', on: true }, { id: 'warehouses', label: 'المخازن والمقر', on: true }, { id: 'fleet', label: 'أسطول النقل الثقيل', on: true }, { id: 'why', label: 'لماذا روك لاين', on: true },
  { id: 'calc', label: 'حاسبة الكميات', on: true }, { id: 'prices', label: 'أسعار اليوم (اختياري)', on: false }, { id: 'markets', label: 'أسعار البورصة (لندن ومصر)', on: true }, { id: 'news', label: 'الأخبار', on: true },
  { id: 'gallery', label: 'معرض الصور', on: true }, { id: 'quotes', label: 'آراء العملاء', on: true }, { id: 'cta', label: 'شريط «اطلب السعر»', on: true },
  { id: 'duo', label: 'كارتين: عرض سعر + المخازن', on: true }, { id: 'contact', label: 'تواصل معنا (الفورم)', on: true }
];
function homeLayout(site) {
  const known = Object.fromEntries(HOME_SECTIONS.map(s => [s.id, s]));
  const out = [], seen = new Set();
  (Array.isArray(site.homeLayout) ? site.homeLayout : []).forEach(x => {
    if (x && known[x.id] && !seen.has(x.id)) { seen.add(x.id); out.push({ id: x.id, label: known[x.id].label, visible: x.visible !== false }); }
  });
  // أي قسم جديد (مش في الترتيب المحفوظ) بنحطه بعد القسم اللي قبله في الترتيب الافتراضي
  HOME_SECTIONS.forEach((sec, k) => {
    if (seen.has(sec.id)) return;
    let at = 0;
    for (let j = k - 1; j >= 0; j--) { const p = out.findIndex(x => x.id === HOME_SECTIONS[j].id); if (p >= 0) { at = p + 1; break; } }
    out.splice(at, 0, { id: sec.id, label: sec.label, visible: sec.on });
  });
  return out;
}
// ألوان الموقع (اختيارية من لوحة التحكم ← شكل الموقع)
const hexOk = c => /^#[0-9a-f]{6}$/i.test(String(c || ''));
function mixHex(a, b, p) { // p = نسبة b
  const n = x => [1, 3, 5].map(i => parseInt(x.slice(i, i + 2), 16));
  const A = n(a), B = n(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * p).toString(16).padStart(2, '0')).join('');
}
function colorCss(site, theme) {
  const c = site.colors || {}; let css = '';
  if (hexOk(c.accent)) css += `--gold:${c.accent};--gold-2:${mixHex(c.accent, '#ffffff', .45)};--gold-3:${mixHex(c.accent, '#000000', .28)};--gold-grad:linear-gradient(135deg,${mixHex(c.accent, '#ffffff', .3)},${c.accent});`;
  if (hexOk(c.primary) && theme !== 'b') css += `--navy:${c.primary};--navy-2:${mixHex(c.primary, '#ffffff', .14)};--navy-3:${mixHex(c.primary, '#000000', .3)};`;
  return css ? ':root{' + css + '}' : '';
}

function base(req, extra) {
  const lang = langOf(req);
  const site = store.get('site');
  const theme = themeOf(req);
  const pv = req.session && req.session.previewTheme && theme === req.session.previewTheme && theme !== themeKey(site) ? theme : '';
  const c = site.contact || {};
  const t = UI(lang);
  const pathNoLang = req.path === '/' ? '' : req.path;
  return Object.assign({
    lang, t, site, icon, brand, ver: pkgVersion,
    dir: lang === 'ar' ? 'rtl' : 'ltr',
    other: lang === 'ar' ? 'en' : 'ar',
    tr: o => tr(o, lang),
    L: p => '/' + lang + (p || ''),
    pathNoLang,
    page: '',
    title: '',
    desc: '',
    fmtDate: d => fmtDate(d, lang),
    hasWa: Boolean(digits(c.whatsapp)),
    wa: msg => waLink(c.whatsapp, msg),
    tel: p => 'tel:+' + digits(p),
    safeUrl: u => /^(https?:\/\/|mailto:|tel:|\/(?!\/))/i.test(String(u || '').trim()) ? String(u).trim() : '#', /* يمنع javascript: في الروابط اللي الإدارة بتكتبها */
    mapUrl: /^https?:\/\//i.test(String(c.mapLink || '').trim()) ? String(c.mapLink).trim() : ('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(tr(c.address, 'ar') || tr(site.brand.name, 'ar'))),
    customs: customSections,
    img: slot => siteImg(site, slot, theme),
    theme, themeInfo: THEMES[theme], previewTheme: pv, colorCss: colorCss(site, theme),
    svcImg: i => (site.images && site.images['svc' + i]) || SVC_IMG[i % SVC_IMG.length],
    baseUrl: siteUrl(req),
    mailReady: mailer.ready(), chatOn: chat.isOn(),
    chans: channels(),
    cat: x => catName(site, x, lang),
    catIcon: x => catIcon(site, x),
    pimg: p => (p.images && p.images[0]) || siteImg(site, 'project'),
    vtypes: (site.vtypes || []).map(p => tr(p.text, lang)).filter(Boolean),
    ptypes: (site.sectors || []).map(p => tr(p.name, lang)).filter(Boolean),
    phone1: (c.phones || [])[0] || '',
    socials: ['facebook', 'instagram', 'tiktok', 'linkedin', 'youtube'].filter(k => c[k]).map(k => ({ k, url: c[k] }))
  }, extra || {});
}

// ---------- forms (نفس التعريف بيتستخدم في التحقق والإيميل ولوحة التحكم) ----------
const FORMS = {
  quote: { subject: 'طلب عرض سعر جديد', file: true, fields: [
    { k: 'name', req: 1, l: 'f_name' }, { k: 'company', l: 'f_company' }, { k: 'phone', req: 1, l: 'f_phone' }, { k: 'email', l: 'f_email' },
    { k: 'ptype', req: 1, l: 'f_ptype' }, { k: 'location', l: 'f_location' }, { k: 'area', l: 'f_area' }, { k: 'start', l: 'f_start' },
    { k: 'items', l: 'f_items' }, { k: 'details', req: 1, l: 'f_details' }] },
  vendor: { subject: 'تسجيل مورد', file: true, fields: [
    { k: 'company', req: 1, l: 'f_company' }, { k: 'vtype', req: 1, l: 'f_vtype' }, { k: 'specialty', req: 1, l: 'f_specialty' },
    { k: 'person', l: 'f_person' }, { k: 'phone', req: 1, l: 'f_phone' }, { k: 'email', l: 'f_email' },
    { k: 'grade', l: 'f_grade' }, { k: 'city', l: 'f_city' }, { k: 'notes', l: 'f_notes' }] },
  contact: { subject: 'رسالة جديدة من الموقع', fields: [
    { k: 'name', req: 1, l: 'f_name' }, { k: 'phone', req: 1, l: 'f_phone' }, { k: 'email', l: 'f_email' },
    { k: 'message', req: 1, l: 'f_message' }] }
};
const KIND_LABEL = { quote: 'طلب عرض سعر', vendor: 'مورد', contact: 'استفسار', career: 'طلب توظيف (قديم)' };
const CHANNEL_LABEL = { email: 'إيميل', whatsapp: 'واتساب', form: 'فورم' };
// عنوان مختصر للرسالة في لوحة التحكم
const msgTitle = f => f.company || f.name || '-';
const msgLine = f => f.ptype || f.vtype || f.position || (f.items || f.message || f.details || '').slice(0, 60);

function readForm(kind, body) {
  const def = FORMS[kind];
  const fields = {};
  def.fields.forEach(f => { fields[f.k] = clean(body[f.k], 3000); });
  let missing = def.fields.filter(f => f.req && !fields[f.k]).map(f => f.k);
  // لو الزبون ضاف أصناف من قائمة الطلب، الصنف والتفاصيل يبقوا اختياريين
  if (kind === 'quote' && fields.items) missing = missing.filter(k => k !== 'ptype' && k !== 'details');
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
    ttl: String(cfg.title || '').trim() || tr(site.brand && site.brand.name, 'ar') || 'روك لاين',
    baseUrl: base
  });
  return true;
}
app.get('/social', (req, res) => { renderSocialPage(req, res, 'social'); });
app.get('/robots.txt', (req, res) => res.type('text/plain').send(`User-agent: *\nDisallow: /admin\nSitemap: ${siteUrl(req)}/sitemap.xml\n`));
app.get('/sitemap.xml', (req, res) => {
  const b = siteUrl(req);
  const pages = ['', '/about', '/services', '/products', '/warehouses', '/calculator', '/quote', '/vendors', '/news', '/gallery', '/contact', '/privacy', '/credits'];
  const urls = [];
  LANGS.forEach(l => {
    pages.forEach(p => urls.push(`${b}/${l}${p}`));
    activeProjects().forEach(p => urls.push(`${b}/${l}/products/${p.id}`));
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
      const job = '';
      if (parts[0] === 'products' && parts[1]) page = 'product';
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
  const all = activeProjects();
  const featured = all.filter(p => p.featured);
  res.render('home', base(req, {
    page: 'home', layout: homeLayout(store.get('site')),
    projects: (featured.length ? featured : all).slice(0, 6), // المنتجات المختارة (⭐) لو موجودة، وإلا أول 6
    projectsCount: all.length,
    news: store.get('news').slice(0, 3),
    photos: g.items.slice(0, 8)
  }));
});

const T = req => UI(langOf(req));
pub.get('/about', (req, res) => res.render('about', base(req, { page: 'about', title: T(req).about_title })));
pub.get('/services', (req, res) => res.render('services', base(req, { page: 'services', title: T(req).services })));
pub.get('/clients', (req, res) => res.redirect(301, '/' + langOf(req) + '/about'));
// ---------- المساعد (الشات) ----------
function chatCtx(lang) {
  const site = store.get('site');
  const priceOn = (homeLayout(site).find(x => x.id === 'prices') || {}).visible;
  return { lang, site, products: activeProjects(), t: UI(lang), prices: priceOn ? (site.prices || []).filter(x => tr(x.name, 'ar') && x.price) : [] };
}
pub.post('/chat', async (req, res) => {
  if (!chat.isOn()) return res.status(404).json({ ok: false });
  const pageLang = langOf(req);
  // حد لكل زائر (25 رسالة / 10 دقايق) وحد عام (120 / دقيقة) عشان محدش يستنزف الحصة أو يكتب على الديسك
  if (tooMany('chat:' + (req.ip || ''), 25, 10 * 60 * 1000) || tooMany('chat:all', 120, 60 * 1000)) return res.status(429).json({ ok: false, reply: UI(pageLang).too_many });
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  const msg = typeof b.message === 'string' ? clean(b.message, 500) : '';
  if (!msg) return res.status(400).json({ ok: false });
  const lang = chat.hasArabic(msg) ? 'ar' : (/[a-z]/i.test(msg) ? 'en' : pageLang);
  const history = (Array.isArray(b.history) ? b.history : []).slice(-8).map(h => ({ role: h && h.role === 'user' ? 'user' : 'bot', text: clean(h && h.text, 600) })).filter(h => h.text);
  try {
    const out = await chat.respond(msg, history, chatCtx(lang));
    res.json({ ok: true, reply: out.reply, actions: out.actions || [], via: out.via });
  } catch (e) { console.error('chat error:', e && e.message); res.status(500).json({ ok: false, reply: UI(pageLang).chat_error }); }
});
pub.get('/calculator', (req, res) => res.render('calculator', base(req, { page: 'calc', title: UI(langOf(req)).calc_title })));
pub.get('/quote', (req, res) => res.render('quote', base(req, { page: 'quote', title: T(req).quote_title, ptype: clean(req.query.type, 100) })));
pub.get('/vendors', (req, res) => res.render('vendors', base(req, { page: 'vendors', title: T(req).vendors_title })));
pub.get('/contact', (req, res) => res.render('contact', base(req, { page: 'contact', title: T(req).contact_title, tab: Object.prototype.hasOwnProperty.call(FORMS, req.query.tab) ? req.query.tab : 'quote' })));
// روابط الموقع القديم
[['companies', '/quote'], ['partners', '/about'], ['guide', '/vendors'], ['jobs', ''], ['apply', '']].forEach(([from, to]) => pub.get(['/' + from, '/' + from + '/*'], (req, res) => res.redirect(301, '/' + langOf(req) + to)));

pub.get(['/projects', '/projects/:id'], (req, res) => res.redirect(301, '/' + langOf(req) + '/products' + (req.params.id ? '/' + encodeURIComponent(req.params.id) : '')));
pub.get('/products', (req, res) => {
  const lang = langOf(req);
  const site = store.get('site');
  const all = activeProjects();
  const catQ = clean(req.query.cat, 100);
  const list = catQ ? all.filter(p => p.cat === catQ) : all;
  // التصنيفات اللي فيها منتجات بس، بنفس ترتيب التصنيفات
  const used = new Set(all.map(p => p.cat));
  const cats = (site.sectors || []).map(s => tr(s.name, 'ar')).filter(c => used.has(c));
  all.forEach(p => { if (p.cat && !cats.includes(p.cat)) cats.push(p.cat); });
  res.render('products', base(req, { page: 'products', title: UI(lang).products, list, cats, catQ, total: all.length }));
});
pub.get('/products/:id', (req, res) => {
  const p = activeProjects().find(x => x.id === req.params.id);
  if (!p) return notFound(req, res);
  const lang = langOf(req);
  const others = activeProjects().filter(x => x.id !== p.id);
  const related = others.filter(x => x.cat === p.cat).concat(others.filter(x => x.cat !== p.cat)).slice(0, 3);
  res.render('product', base(req, { page: 'products', p, related, title: tr(p.title, lang), desc: tr(p.desc, lang).slice(0, 160), ogImage: (p.images || [])[0] || '' }));
});
pub.get('/warehouses', (req, res) => res.render('warehouses', base(req, { page: 'warehouses', title: UI(langOf(req)).warehouses })));

pub.get('/credits', (req, res) => res.render('credits', base(req, { page: 'credits', title: langOf(req) === 'ar' ? 'مصادر الصور' : 'Photo credits', credits: photoCredits })));

pub.get('/privacy', (req, res) => {
  const lang = langOf(req);
  const site = store.get('site');
  const p = (site.privacy && tr(site.privacy.body, lang)) ? site.privacy : privacyDefault;
  const c = site.contact || {};
  const ltr = x => x ? '⁦' + x + '⁩' : '';
  const vars = { company: tr(site.brand.name, lang), license: site.brand.license || '', email: ltr(c.email || ''), phone: ltr((c.phones || [])[0] || c.whatsapp || ''), address: tr(c.address, lang) };
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
  res.render('privacy', base(req, { page: 'privacy', title: UI(lang).privacy, blocks, updated: p.updated ? '⁦' + p.updated + '⁩' : '' }));
});

pub.get('/news', (req, res) => res.render('news', base(req, { page: 'news', title: UI(langOf(req)).news, news: store.get('news') })));
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
  res.render('gallery', base(req, { page: 'gallery', title: UI(langOf(req)).gallery, albums, album: null, items: [] }));
});
pub.get('/gallery/:album', (req, res) => {
  const g = store.get('gallery');
  const album = g.albums.find(a => a.id === req.params.album);
  if (!album) return notFound(req, res);
  res.render('gallery', base(req, { page: 'gallery', title: tr(album.title, langOf(req)), albums: [], album, items: g.items.filter(i => i.album === album.id) }));
});

// إرسال الفورمات: بالإيميل (من السيرفر) أو تسجيل نسخة لما الزائر يبعت على واتساب
pub.post('/send', (req, res) => {
  memFile.single('file')(req, res, async upErr => {
    const lang = langOf(req);
    const t = UI(lang);
    const wantsJson = req.xhr || /json/.test(req.get('accept') || '');
    const reply = (ok, msg, code) => wantsJson
      ? res.status(code || (ok ? 200 : 400)).json({ ok, msg })
      : res.status(code || (ok ? 200 : 400)).render('sent', base(req, { ok, msg, title: ok ? t.sent_ok : t.sent_fail }));

    const b = req.body || {};
    const kind = (typeof b.kind === 'string' && Object.prototype.hasOwnProperty.call(FORMS, b.kind)) ? b.kind : 'contact'; /* hasOwn: kind=__proto__ كان بيوقّع السيرفر كله */
    if (clean(b.website)) return reply(true, t.sent_ok); // فخ للبرامج الآلية
    const ip = req.ip || '';
    if (tooMany(ip, 8, 10 * 60 * 1000) || tooMany('send:all', 60, 60 * 1000)) return reply(false, t.too_many, 429); // حد لكل زائر + حد عام (حماية الرسائل من الإغراق)

    const { fields, missing } = readForm(kind, b);
    if (missing.length) return reply(false, t.required);
    const channel = b.channel === 'whatsapp' ? 'whatsapp' : 'email';
    const emailOn = channels().email && mailer.ready();
    analytics.event('form_' + kind + '_' + channel, req);
    const rec = { id: uid(), kind, channel, lang, at: now(), read: false, fields, mailed: false, consent: b.consent === 'on' };

    let attachments = [];
    if (req.file && FORMS[kind].file && !upErr) {
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
          replyTo: /^[^\s<>;,"'()\\]+@[^\s<>;,"'()\\]+\.[^\s<>;,"'()\\]+$/.test(fields.email || '') ? fields.email : undefined, /* إيميل بسيط بس: أي رموز عنونة غريبة بتتتجاهل */
          extraTo: users.notifyEmails(),
          attachments
        });
        rec.mailed = true;
      } catch (e) {
        rec.mailError = String(e && e.message || e).slice(0, 300);
        console.error('mail error:', rec.mailError);
      }
      saveMessage(rec);
      // حتى لو الإيميل فشل، الرسالة اتحفظت في لوحة التحكم
      return rec.mailed ? reply(true, t.sent_ok) : reply(false, t.sent_fail, 502);
    }
    if (channel === 'email') {
      // الإيميل مقفول من لوحة التحكم أو مش متظبط: نحفظ الرسالة في لوحة التحكم
      rec.channel = 'form';
      saveMessage(rec);
      return reply(true, t.sent_ok);
    }
    saveMessage(rec);
    return reply(true, t.sent_wa_note);
  });
});

function notFound(req, res) {
  const lang = (req.originalUrl.match(/^\/(ar|en)\b/) || [])[1] || 'ar';
  req.params = Object.assign({}, req.params, { lang });
  res.status(404).render('404', base(req, { title: UI(lang).notfound }));
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
    KIND_LABEL, CHANNEL_LABEL, FORMS, msgTitle, msgLine, labels: dict.ar, PERMS: users.PERMS
  }, extra || {});
}
const ISSUER = 'Rock Line Group';
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
const PERM_OF = { design: 'content', stats: 'stats', inbox: 'inbox', projects: 'projects', news: 'news', gallery: 'gallery', content: 'content', texts: 'content', layout: 'content', social: 'social', sections: 'sections', images: 'images', contact: 'contact', mail: 'mail', users: 'users', security: 'users', audit: 'audit' };
function guard(req, res, next) {
  if (!process.env.SITE_URL && req.me) _adminHost = req.protocol + '://' + req.get('host');
  /* حروف صغيرة + أي مسار مش معروف يتقفل (قبل كده /admin/Users كان بيعدّي من غير فحص لأن Express مش حساس لحالة الحروف) */
  const seg = (req.path.split('/')[1] || '').toLowerCase();
  const perm = Object.prototype.hasOwnProperty.call(PERM_OF, seg) ? PERM_OF[seg] : null;
  if (!perm && (seg === '' || seg === 'account')) return next();
  if ((seg === 'hosting' || seg === 'bot') && req.me && req.me.owner) return next(); // الاستضافة وإعدادات المساعد (فيها مفتاح الـ API) للمدير الأساسي بس
  if ((seg === 'under-construction' || seg === 'samples' || seg === 'apply-defaults') && req.me && req.me.owner) return next();
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
      ], { subject: 'تغيير كلمة مرور لوحة تحكم روك لاين', title: 'تغيير كلمة المرور', to: u.email });
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

// المحتوى الجاهز اللي جاي مع النسخة (فولدر data جنب الكود). على الاستضافة البيانات الحية في DATA_DIR ومبتتغيرش لوحدها لما ترفع نسخة جديدة.
const shippedFile = name => path.join(__dirname, 'data', name + '.json');
function shippedSite() { try { return JSON.parse(fs.readFileSync(shippedFile('site'), 'utf8')); } catch (e) { return null; } }
function shippedProducts() { try { const v = JSON.parse(fs.readFileSync(shippedFile('projects'), 'utf8')); return Array.isArray(v) ? v : null; } catch (e) { return null; } }
admin.get('/', (req, res) => {
  const inbox = store.get('inbox');
  res.render('admin/dash', adminView(req, {
    section: 'dash', underCon: underCon(),
    counts: {
      projects: activeProjects().length, news: store.get('news').length,
      photos: store.get('gallery').items.length,
      messages: inbox.messages.length,
      week: inbox.messages.filter(m => Date.now() - new Date(m.at) < 7 * 864e5).length
    },
    latest: inbox.messages.slice(0, 6),
    defaultPass: Boolean(req.me.defaultPass),
    missingStats: (store.get('site').stats || []).filter(s => !s.value).map(s => tr(s.label, 'ar')),
    quotesCount: (store.get('site').quotes || []).length,
    noEmail: !req.me.email,
    newContent: Boolean(shippedSite() && shippedSite().contentVersion && shippedSite().contentVersion !== (store.get('site').contentVersion || '')),
    samples: {
      site: store.get('site').sample === true,
      projects: (store.get('projects') || []).filter(p => p.sample).length
    },
    noContact: !((store.get('site').contact || {}).phones || []).length && !(store.get('site').contact || {}).whatsapp
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
  res.setHeader('Content-Disposition', 'attachment; filename="rockline-messages.csv"');
  res.send(csv);
});

// ----- products (المنتجات؛ متخزنة في projects.json) -----
const projList = () => store.get('projects') || [];
const sectorNames = () => (store.get('site').sectors || []).map(s => tr(s.name, 'ar')).filter(Boolean);
admin.get('/projects', (req, res) => res.render('admin/projects', adminView(req, { section: 'projects', list: projList(), catName: x => x || '—' })));
admin.get('/projects/new', (req, res) => res.render('admin/projectform', adminView(req, { section: 'projects', item: null, cats: sectorNames() })));
admin.get('/projects/:id/edit', (req, res) => {
  const item = projList().find(p => p.id === req.params.id);
  if (!item) return res.redirect('/admin/projects');
  res.render('admin/projectform', adminView(req, { section: 'projects', item, cats: sectorNames() }));
});
admin.post('/projects/save', (req, res) => {
  diskProduct.fields([{ name: 'images', maxCount: 20 }, { name: 'datasheet', maxCount: 1 }])(req, res, err => {
    const b = req.body || {};
    const list = projList();
    const old = list.find(p => p.id === clean(b.id));
    let images = old ? (old.images || []).slice() : [];
    const remove = [].concat(b.remove || []);
    remove.forEach(x => { if (images.includes(x) && /^\/uploads\//.test(x)) { try { fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(x))); } catch (e) {} } });
    images = images.filter(x => !remove.includes(x));
    // صورة الغلاف = أول صورة
    if (b.cover && images.includes(b.cover)) images = [b.cover].concat(images.filter(x => x !== b.cover));
    ((req.files || {}).images || []).forEach(f => images.push('/uploads/' + f.filename));
    let datasheet = old ? (old.datasheet || '') : '';
    const newSheet = ((req.files || {}).datasheet || [])[0];
    if (newSheet) { unlinkUpload(datasheet); datasheet = '/uploads/' + newSheet.filename; }
    else if (b.remove_datasheet === 'on' && datasheet) { unlinkUpload(datasheet); datasheet = ''; }
    const rec = {
      id: old ? old.id : uid(),
      title: bi(b, 'title'), cat: clean(b.cat, 100),
      pack: bi(b, 'pack'),
      scope: bi(b, 'scope'), desc: bi(b, 'desc'),
      images: images.slice(0, 40), datasheet,
      featured: b.featured === 'on', visible: b.visible === 'on',
      at: old ? old.at : now(), updated: now()
    };
    if (!rec.title.ar) { flash(req, 'اكتب اسم المنتج بالعربي', 'err'); return res.redirect(old ? '/admin/projects/' + old.id + '/edit' : '/admin/projects/new'); }
    if (old) { Object.assign(old, rec); delete old.sample; } else list.unshift(rec);
    store.set('projects', list);
    flash(req, err ? 'اتحفظ المنتج، بس فيه صورة متقبلتش (الحد 10 ميجا وصيغ jpg/png/webp)' : 'تم حفظ المنتج', err ? 'err' : 'ok');
    res.redirect('/admin/projects');
  });
});
admin.post('/projects/:id/toggle', (req, res) => {
  const list = projList(); const p = list.find(x => x.id === req.params.id);
  if (p) { p.visible = p.visible === false; store.set('projects', list); flash(req, p.visible ? 'المنتج ظاهر على الموقع' : 'المنتج اتخفى من الموقع'); }
  res.redirect('/admin/projects');
});
admin.post('/projects/:id/feature', (req, res) => {
  const list = projList(); const p = list.find(x => x.id === req.params.id);
  if (p) { p.featured = !p.featured; store.set('projects', list); flash(req, p.featured ? 'المنتج بقى ضمن المنتجات المختارة في الصفحة الرئيسية' : 'اتشال من المنتجات المختارة'); }
  res.redirect('/admin/projects');
});
admin.post('/projects/:id/move', (req, res) => {
  const list = projList(); const i = list.findIndex(x => x.id === req.params.id);
  const j = i + (req.body && req.body.dir === 'up' ? -1 : 1);
  if (i >= 0 && j >= 0 && j < list.length) { [list[i], list[j]] = [list[j], list[i]]; store.set('projects', list); }
  res.redirect('/admin/projects');
});
admin.post('/projects/:id/delete', (req, res) => {
  const list = projList(); const p = list.find(x => x.id === req.params.id);
  if (p) { (p.images || []).filter(x => /^\/uploads\//.test(x)).forEach(x => { try { fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(x))); } catch (e) {} }); unlinkUpload(p.datasheet); } // صور الموقع الأصلية (/img/...) متتمسحش
  store.set('projects', list.filter(x => x.id !== req.params.id));
  flash(req, 'تم حذف المنتج');
  res.redirect('/admin/projects');
});
// تطبيق المحتوى الجديد اللي جاي مع النسخة على الموقع (للمدير الأساسي بس). بيحتفظ بنسخة من القديم، وبيسيب التصميم والصور اللي رفعتها والإعدادات.
admin.post('/apply-defaults', (req, res) => {
  if (!req.me.owner) { flash(req, 'للمدير الأساسي بس', 'err'); return res.redirect('/admin'); }
  const sSite = shippedSite(), sProd = shippedProducts();
  if (!sSite || !sProd) { flash(req, 'مش لاقي المحتوى الجاهز اللي جاي مع النسخة (فولدر data)', 'err'); return res.redirect('/admin'); }
  const cur = store.get('site');
  const dir = path.join(store.DIR, 'backups');
  const stamp = now().replace(/[:.]/g, '-');
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'site-' + stamp + '.json'), JSON.stringify(cur, null, 1));
    fs.writeFileSync(path.join(dir, 'products-' + stamp + '.json'), JSON.stringify(store.get('projects') || [], null, 1));
  } catch (e) { /* النسخة الاحتياطية مش شرط لإتمام التحديث */ }
  const next = Object.assign({}, sSite);
  ['theme', 'colors', 'ui', 'homeLayout', 'images', 'channels', 'hosting', 'profilePdf'].forEach(k => { if (cur[k] !== undefined) next[k] = cur[k]; });
  store.set('site', next);
  store.set('projects', sProd);
  flash(req, 'تم تطبيق المحتوى الجديد على الموقع. لو الموقع لسه بيظهر قديم عندك، اعمل تحديث للصفحة (Ctrl+F5).');
  res.redirect('/admin');
});
admin.post('/samples/clear', (req, res) => {
  if (!req.me.owner) { flash(req, 'للمدير الأساسي بس', 'err'); return res.redirect('/admin'); }
  const what = (req.body && req.body.what) || '';
  if (what === 'projects') store.set('projects', projList().filter(p => !p.sample));
  else if (what === 'site') { const site = store.get('site'); delete site.sample; store.set('site', site); }
  flash(req, what === 'site' ? 'تمام — اتشال تنبيه المحتوى النموذجي' : 'اتمسحت النماذج');
  res.redirect('/admin');
});

// ----- news -----
admin.get('/news', (req, res) => res.render('admin/news', adminView(req, { section: 'news', news: store.get('news') })));
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
    c.phones = list(b.phones);
    c.phones2 = list(b.phones2);
    c.whatsapp = clean(b.whatsapp, 40);
    c.email = clean(b.email, 200);
    c.address = bi(b, 'address');
    c.hours = bi(b, 'hours');
    c.slogan = bi(b, 'slogan');
    c.mapLink = clean(b.mapLink, 1000);
    ['facebook', 'instagram', 'tiktok', 'linkedin', 'youtube', 'website'].forEach(k => { c[k] = clean(b[k], 500); });
    site.brand.license = clean(b.license, 40);
    site.brand.grade = clean(b.grade, 40);
    site.brand.cr = clean(b.cr, 40);
    site.brand.tax = clean(b.tax, 40);
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
  ['after_hero', 'بعد الواجهة الرئيسية'], ['after_about', 'بعد "من نحن"'], ['after_services', 'بعد "المنتجات" و"طريقة الطلب"'],
  ['after_sectors', 'بعد "المخازن" و"لماذا روك لاين"'], ['after_jobs', 'بعد "الأخبار"'], ['before_contact', 'قبل "تواصل معنا" في آخر الصفحة']
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

// ----- mail settings + طرق إرسال الفورمات -----
admin.get('/mail', (req, res) => res.render('admin/mail', adminView(req, { section: 'mail', mail: store.get('mail'), envPass: Boolean(process.env.MAIL_PASS), chans: channels() })));
admin.post('/mail/channels', (req, res) => {
  const site = store.get('site'); const b = req.body || {};
  site.channels = { whatsapp: b.ch_whatsapp === 'on', email: b.ch_email === 'on' }; store.set('site', site);
  flash(req, 'اتحفظت طرق الإرسال' + (!site.channels.whatsapp && !site.channels.email ? ' — الاتنين مقفولين، فهيظهر زرار «إرسال» عادي والرسايل بتتحفظ في لوحة التحكم.' : ''));
  res.redirect('/admin/mail');
});
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
    await mailer.send([['الحالة', 'إعدادات الإيميل شغالة، ورسايل الموقع هتوصل هنا.']], { subject: 'رسالة تجربة من موقع روك لاين', title: 'رسالة تجربة' });
    flash(req, 'اتبعتت رسالة التجربة. شوف صندوق الوارد في ' + mailer.config().to);
  } catch (e) {
    flash(req, 'الإرسال فشل: ' + String(e && e.message || e).slice(0, 200), 'err');
  }
  res.redirect('/admin/mail');
});

// ----- statistics -----
admin.get('/stats', (req, res) => {
  const n = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  const sum = analytics.summary(n);
  res.render('admin/stats', adminView(req, { section: 'stats', n, sum }));
});

// ----- المساعد (الشات بوت) -----
function botView(req, extra) {
  const k = chat.apiKey();
  return adminView(req, Object.assign({ section: 'bot', bot: chat.settings(), keySource: chat.keySource(), keyTail: k ? k.slice(-4) : '', aiReady: chat.aiReady(), test: null }, extra || {}));
}
admin.get('/bot', (req, res) => res.render('admin/bot', botView(req)));
admin.post('/bot', (req, res) => {
  const b = req.body || {}; const next = Object.assign({}, chat.DEFAULTS, store.get('bot') || {});
  next.enabled = b.enabled === 'on';
  next.mode = b.mode === 'site' ? 'site' : 'ai';
  next.model = clean(b.model, 60).replace(/[^\w.\-]/g, '') || chat.DEFAULTS.model;
  next.dailyLimit = Math.max(0, Math.min(5000, parseInt(b.dailyLimit, 10) || 0));
  next.extra = clean(b.extra, 2000);
  const newKey = clean(b.apiKey, 200).replace(/\s/g, '');
  if (b.remove_key === 'on') next.apiKey = '';
  else if (newKey) {
    if (!/^[\w\-]{20,}$/.test(newKey)) { flash(req, 'المفتاح شكله غلط (حروف وأرقام وشرطات بس). انسخه من Google AI Studio تاني.', 'err'); return res.redirect('/admin/bot'); }
    next.apiKey = newKey;
  }
  store.set('bot', next);
  security.audit(req.me, 'bot', next.enabled ? (next.mode === 'ai' && chat.apiKey() ? 'on-ai' : 'on-site') : 'off', req.ip);
  flash(req, 'تم حفظ إعدادات المساعد');
  res.redirect('/admin/bot');
});
admin.post('/bot/test', async (req, res) => {
  const msg = clean((req.body || {}).message, 500);
  if (!msg) return res.redirect('/admin/bot');
  const lang = chat.hasArabic(msg) ? 'ar' : 'en';
  let test;
  try { const o = await chat.respond(msg, [], chatCtx(lang), { nolog: true }); test = { q: msg, a: o.reply, via: o.via, actions: o.actions || [] }; }
  catch (e) { test = { q: msg, a: 'حصل خطأ: ' + String(e && e.message || e).slice(0, 200), via: 'error', actions: [] }; }
  res.render('admin/bot', botView(req, { test }));
});
admin.post('/bot/clear-log', (req, res) => { const b = Object.assign({}, chat.DEFAULTS, store.get('bot') || {}); b.log = []; store.set('bot', b); flash(req, 'اتمسح سجل المحادثات'); res.redirect('/admin/bot'); });

// ----- نصوص الواجهة (عناوين الأقسام والأزرار وأسماء القوايم) -----
admin.get('/texts', (req, res) => res.render('admin/texts', adminView(req, { section: 'texts', groups: uitexts.groups(), dict, ui: store.get('site').ui || {} })));
admin.post('/texts', (req, res) => {
  const b = req.body || {}; const ui = { ar: {}, en: {} };
  uitexts.allKeys().forEach(k => ['ar', 'en'].forEach(l => {
    const v = clean(b['t_' + l + '_' + k], 400);
    if (v && v !== dict[l][k]) ui[l][k] = v; // اللي زي الافتراضي مبنخزنوش
  }));
  const site = store.get('site'); site.ui = ui; store.set('site', site);
  flash(req, 'تم حفظ نصوص الواجهة');
  res.redirect('/admin/texts');
});
admin.post('/texts/reset', (req, res) => {
  const site = store.get('site'); delete site.ui; store.set('site', site);
  flash(req, 'رجعت كل نصوص الواجهة للأصلية');
  res.redirect('/admin/texts');
});

// ----- ترتيب أقسام الصفحة الرئيسية -----
admin.get('/layout', (req, res) => res.render('admin/layout', adminView(req, { section: 'layout', list: homeLayout(store.get('site')) })));
function saveLayout(list) { const site = store.get('site'); site.homeLayout = list.map(x => ({ id: x.id, visible: x.visible })); store.set('site', site); }
admin.post('/layout/reset', (req, res) => { const site = store.get('site'); delete site.homeLayout; store.set('site', site); flash(req, 'رجّعت الترتيب الأصلي'); res.redirect('/admin/layout'); });
admin.post('/layout/:id/move', (req, res) => {
  const list = homeLayout(store.get('site')); const i = list.findIndex(x => x.id === req.params.id);
  const j = i + (req.body && req.body.dir === 'up' ? -1 : 1);
  if (i >= 0 && j >= 0 && j < list.length) { [list[i], list[j]] = [list[j], list[i]]; saveLayout(list); }
  res.redirect('/admin/layout');
});
admin.post('/layout/:id/toggle', (req, res) => {
  const list = homeLayout(store.get('site')); const x = list.find(y => y.id === req.params.id);
  if (x) { x.visible = !x.visible; saveLayout(list); flash(req, (x.visible ? 'ظهر' : 'اتخفى') + ' قسم «' + x.label + '» في الصفحة الرئيسية'); }
  res.redirect('/admin/layout');
});

// ----- ألوان الموقع -----
admin.post('/design/colors', (req, res) => {
  const b = req.body || {}; const site = store.get('site');
  if (b.reset === '1') delete site.colors;
  else site.colors = { primary: hexOk(b.primary) && b.use_primary === 'on' ? b.primary : '', accent: hexOk(b.accent) && b.use_accent === 'on' ? b.accent : '' };
  store.set('site', site);
  flash(req, b.reset === '1' ? 'رجعت ألوان التصميم الأصلية' : 'تم حفظ ألوان الموقع');
  res.redirect('/admin/design');
});

// ----- شكل الموقع (اختيار التصميم + معاينة) -----
admin.get('/design', (req, res) => res.render('admin/design', adminView(req, { section: 'design', THEMES, colors: store.get('site').colors || {}, current: themeKey(store.get('site')), preview: req.session.previewTheme || '' })));
admin.post('/design', (req, res) => {
  const t = (req.body || {}).theme;
  if (!Object.prototype.hasOwnProperty.call(THEMES, t)) { flash(req, 'اختار تصميم من القايمة', 'err'); return res.redirect('/admin/design'); }
  const site = store.get('site'); site.theme = t; store.set('site', site); delete req.session.previewTheme;
  security.audit(req.me, 'theme', t, req.ip);
  flash(req, 'تم تغيير شكل الموقع لـ «' + THEMES[t].label + '» — ظاهر للزوار دلوقتي.');
  res.redirect('/admin/design');
});
admin.get('/design/preview/:t', (req, res) => {
  if (!Object.prototype.hasOwnProperty.call(THEMES, req.params.t)) return res.redirect('/admin/design');
  req.session.previewTheme = req.params.t; res.redirect('/ar');
});
admin.get('/design/preview-off', (req, res) => { delete req.session.previewTheme; res.redirect(String(req.query.back || '') === 'site' ? '/ar' : '/admin/design'); });

// ----- site images -----
admin.get('/images', (req, res) => res.render('admin/images', adminView(req, { section: 'images', slots: imageSlots() })));
admin.post('/images/:slot', (req, res) => {
  const slot = imageSlots().find(x => x.k === req.params.slot);
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
// ----- الاستضافة والتجديد + نسخة كاملة من الموقع -----
admin.get('/hosting', (req, res) => { if (!req.me.owner) return res.status(403).render('admin/denied', adminView(req, { section: 'hosting' })); const h = hostCfg(); res.render('admin/hosting', adminView(req, { section: 'hosting', h, days: { host: hostDays(h.until), domain: hostDays(h.domainUntil) } })); });
const SITE_ZIP_README = ['إزاي ترفع الموقع ده على استضافة جديدة:', '', '1) اعمل تطبيق Node.js جديد (Express، Node 20 أو أحدث، ملف الدخول server.js) وارفع الملف ده زي ما هو.', '2) المتغيرات: SESSION_SECRET (نفس القيمة القديمة لو معاك — غير كده المدير يستخدم كود الاسترجاع ويربط التحقق الثنائي من جديد)، SITE_URL، DATA_DIR=~/rockline-data، UPLOAD_DIR=~/rockline-uploads، ومعاهم MAIL_* و OWNER_RESET_CODE لو كانوا مستخدمين.', '3) أول تشغيل بينسخ البيانات (data) والصور (public/uploads) اللي جوه الملف ده لـ DATA_DIR و UPLOAD_DIR لوحده — يعني كل المحتوى والرسايل والمستخدمين بيرجعوا زي ما هم.', '4) اربط الدومين وفعّل SSL.', '', 'الملف ده فيه بيانات الشركة والرسايل — احفظه في مكان آمن.'].join('\r\n');
function siteFiles() {
  const out = []; const skip = n => /^\./.test(n) || n === 'node_modules';
  const walk = (abs, rel, isSkipped) => { let st; try { st = fs.statSync(abs); } catch (e) { return; } if (st.isDirectory()) { for (const n of fs.readdirSync(abs)) { if (skip(n)) continue; const r = rel ? rel + '/' + n : n; if (isSkipped && isSkipped(r)) continue; walk(path.join(abs, n), r, isSkipped); } } else if (st.isFile() && !/\.env(\.|$)/.test(rel) && !/^data\/(drive|facebook|masar)\.json$/.test(rel)) out.push({ rel, abs, size: st.size, mtime: st.mtime }); };
  for (const f of ['server.js', 'package.json', 'package-lock.json', 'README.md']) walk(path.join(__dirname, f), f);
  for (const d of ['lib', 'views', 'scripts']) walk(path.join(__dirname, d), d);
  walk(path.join(__dirname, 'public'), 'public', r => r === 'public/uploads' || r.startsWith('public/uploads/'));
  walk(store.DIR, 'data'); walk(UPLOAD_DIR, 'public/uploads'); return out;
}
async function writeSiteZip(out) { const z = require('./lib/zipper').createZip(out); for (const f of siteFiles()) await z.add(f.rel, fs.readFileSync(f.abs), f.mtime); await z.add('اقراني - النقل.txt', SITE_ZIP_README); await z.end(); }
admin.get('/hosting/export', async (req, res) => {
  if (!req.me.owner) return res.status(403).render('admin/denied', adminView(req, { section: 'hosting' }));
  const day = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/zip'); res.setHeader('Content-Disposition', `attachment; filename="rockline-site-full-${day}.zip"`); res.setHeader('Cache-Control', 'no-store');
  try { await writeSiteZip(res); security.audit(req.me, 'export_all', day, req.ip); } catch (e) { console.error('export:', e && e.message); try { res.destroy(e); } catch (x) {} }
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
        ], { subject: 'دعوة للوحة تحكم موقع روك لاين', title: 'تم إضافتك للوحة التحكم', to: u.email });
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
      { subject: 'لينك كلمة مرور لوحة تحكم روك لاين', title: 'تعيين كلمة المرور', to: u.email });
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
  const st = err && (err.status || err.statusCode);
  if (st >= 400 && st < 500) return res.status(st).type('text/plain').send(st === 413 ? 'payload too large' : 'bad request'); // JSON فاسد أو طلب كبير: مش خطأ سيرفر
  console.error(err);
  res.status(500).type('text/plain').send('server error');
});

app.listen(PORT, () => console.log('Rock Line Group website: http://localhost:' + PORT + '  |  admin: /admin'));

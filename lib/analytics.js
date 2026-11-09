/**
 * إحصائيات بسيطة للموقع من غير أي خدمة خارجية ومن غير كوكيز.
 * بتتحفظ أرقام مجمّعة بس لكل يوم (مفيش IP ولا بيانات شخصية).
 */
const crypto = require('crypto');
const store = require('./store');

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|curl|wget|python|headless|lighthouse|monitor/i;
const EVENTS = ['wa_click', 'call_click', 'email_click', 'profile_download', 'social_click',
  ...['quote', 'vendor', 'career', 'contact'].flatMap(k => ['form_' + k + '_email', 'form_' + k + '_whatsapp'])];

const uniq = new Map(); // day -> Set(hash)
let dirty = false;
let timer = null;

function today() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' }); // YYYY-MM-DD
}
function data() {
  const d = store.get('stats');
  if (!d.days) d.days = {};
  return d;
}
function day(key) {
  const d = data();
  if (!d.days[key]) d.days[key] = { v: 0, u: 0, pages: {}, refs: {}, dev: {}, lang: {}, ev: {}, jobs: {} };
  return d.days[key];
}
function inc(obj, k, n) { obj[k] = (obj[k] || 0) + (n || 1); }
function flush() {
  if (!dirty) return;
  const d = data();
  const keys = Object.keys(d.days).sort();
  while (keys.length > 400) delete d.days[keys.shift()];
  store.set('stats', d);
  dirty = false;
}
function touch() {
  dirty = true;
  if (!timer) timer = setTimeout(() => { timer = null; flush(); }, 20000);
}
process.on('exit', flush);
['SIGINT', 'SIGTERM'].forEach(sig => process.once(sig, () => { flush(); process.exit(0); }));

function source(req) {
  const utm = String(req.query && req.query.utm_source || '').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 40);
  if (utm) return utm;
  const ref = req.get('referer');
  if (!ref) return 'direct';
  let host;
  try { host = new URL(ref).hostname.replace(/^www\./, ''); } catch (e) { return 'direct'; }
  if (host === req.hostname || host === String(req.get('host') || '').split(':')[0]) return null; // تنقل جوه الموقع
  if (/facebook|fb\.com|fb\.me/.test(host)) return 'facebook';
  if (/instagram/.test(host)) return 'instagram';
  if (/google\./.test(host)) return 'google';
  if (/bing\./.test(host)) return 'bing';
  if (/whatsapp|wa\.me/.test(host)) return 'whatsapp';
  if (/linkedin|lnkd/.test(host)) return 'linkedin';
  if (/tiktok/.test(host)) return 'tiktok';
  if (/t\.co$|twitter|x\.com/.test(host)) return 'x';
  return host.slice(0, 60);
}

/** بتتسجل بعد ما الصفحة تتبعت بنجاح */
function pageview(req, res, info) {
  const ua = String(req.get('user-agent') || '');
  if (!ua || BOT.test(ua) || req.method !== 'GET') return;
  if (req.session && req.session.uid) return; // زيارات لوحة التحكم متتحسبش
  const key = today();
  const dd = day(key);
  inc(dd, 'v');
  const h = crypto.createHash('sha256').update(key + '|' + (req.ip || '') + '|' + ua).digest('hex').slice(0, 16);
  if (!uniq.has(key)) { uniq.clear(); uniq.set(key, new Set()); }
  const set = uniq.get(key);
  if (!set.has(h)) { set.add(h); inc(dd, 'u'); }
  inc(dd.pages, info.page || 'other');
  if (info.job) inc(dd.jobs, info.job);
  const src = source(req);
  if (src) inc(dd.refs, src);
  inc(dd.dev, /Mobi|Android|iPhone|iPad/i.test(ua) ? 'mobile' : 'desktop');
  inc(dd.lang, info.lang || 'ar');
  touch();
}

function event(name, req) {
  if (!EVENTS.includes(name)) return false;
  const ua = String(req && req.get('user-agent') || '');
  if (req && (BOT.test(ua) || (req.session && req.session.uid))) return false;
  inc(day(today()).ev, name);
  touch();
  return true;
}

/** تجميع آخر N يوم لصفحة الإحصائيات */
function summary(n) {
  flush();
  const d = data();
  const days = [];
  const tot = { v: 0, u: 0, pages: {}, refs: {}, dev: {}, lang: {}, ev: {}, jobs: {} };
  for (let i = n - 1; i >= 0; i--) {
    const dt = new Date(Date.now() - i * 864e5).toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
    const x = d.days[dt] || {};
    days.push({ date: dt, v: x.v || 0, u: x.u || 0 });
    tot.v += x.v || 0; tot.u += x.u || 0;
    ['pages', 'refs', 'dev', 'lang', 'ev', 'jobs'].forEach(k => Object.entries(x[k] || {}).forEach(([a, b]) => inc(tot[k], a, b)));
  }
  const top = (o, m) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, m || 10);
  return { days, tot, top };
}

module.exports = { pageview, event, summary, EVENTS };

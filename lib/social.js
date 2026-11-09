'use strict';
/* صفحة «روابط التواصل» (/social): روابط وأزرار + أشخاص للتواصل، كلها بتتظبط من لوحة التحكم.
   بتُستخدم كـ«لينك واحد» تحطه في باركود — أي حد يمسحه يلاقي كل وسائل التواصل في صفحة واحدة شيك.
   مهم: نفس المنطق (الأنواع + الروابط + الثيمات) متكرر في public/js/social-render.js — أي تعديل هنا يتعمل هناك. */

/* أنواع الأزرار: الأيقونة + العنوان الافتراضي + إزاي يتبني اللينك + فين يظهر.
   row=true يعني بيظهر كأيقونة دايرية في الشريط العلوي (سوشيال)، مش كزر كبير. brand=true أيقونة ماركة بلونها. */
const TYPES = {
  site:      { label: 'الموقع الإلكتروني',   icon: 'globe',     kind: 'site' },
  apply:     { label: 'اطلب عرض سعر',          icon: 'briefcase', kind: 'apply' },
  whatsapp:  { label: 'واتساب',               icon: 'whatsapp',  brand: true, kind: 'wa' },
  wagroup:   { label: 'جروب واتساب',          icon: 'whatsapp',  brand: true, kind: 'url' },
  wachannel: { label: 'قناة واتساب',          icon: 'whatsapp',  brand: true, kind: 'url' },
  phone:     { label: 'اتصل بنا',             icon: 'phone',     kind: 'tel' },
  email:     { label: 'إيميل',                icon: 'mail',      kind: 'mail' },
  map:       { label: 'موقعنا على الخريطة',   icon: 'map',       kind: 'url' },
  facebook:  { label: 'فيسبوك',               icon: 'facebook',  brand: true, kind: 'url' },
  messenger: { label: 'ماسنجر',               icon: 'facebook',  brand: true, kind: 'url' },
  instagram: { label: 'انستجرام',             icon: 'instagram', brand: true, kind: 'url' },
  tiktok:    { label: 'تيك توك',              icon: 'tiktok',    brand: true, kind: 'url' },
  youtube:   { label: 'يوتيوب',               icon: 'youtube',   brand: true, kind: 'url' },
  telegram:  { label: 'تليجرام',              icon: 'send',      brand: true, kind: 'url' },
  twitter:   { label: 'إكس (تويتر)',          icon: 'x',         brand: true, kind: 'url' },
  linkedin:  { label: 'لينكد إن',             icon: 'linkedin',  brand: true, kind: 'url' },
  url:       { label: 'رابط',                 icon: 'link',      kind: 'url' }
};
const TYPE_LIST = Object.keys(TYPES);

const THEMES = {
  midnight: { name: 'كحلي فخم' },
  royal:    { name: 'أزرق ملكي' },
  green:    { name: 'أخضر' },
  emerald:  { name: 'زمردي' },
  dark:     { name: 'غامق' },
  purple:   { name: 'بنفسجي' },
  sunset:   { name: 'غروب' },
  ocean:    { name: 'أزرق بحري' },
  gold:     { name: 'دهبي' },
  rose:     { name: 'وردي' },
  sky:      { name: 'سماوي' },
  light:    { name: 'فاتح' }
};
const THEME_LIST = Object.keys(THEMES);
const BTN_STYLES = { card: 'كروت', pill: 'كبسولة' };
const ICON_STYLES = { brand: 'بألوانها', soft: 'موحّد' };

/* ألوان الماركات الحقيقية لأيقونات الأزرار (شكل احترافي) */
const BRAND = {
  facebook: '#1877f2', messenger: '#0084ff', instagram: 'linear-gradient(45deg,#f09433,#dc2743,#bc1888)',
  whatsapp: '#25d366', wagroup: '#25d366', wachannel: '#25d366', tiktok: '#010101', youtube: '#ff0000',
  telegram: '#229ed9', twitter: '#000', linkedin: '#0a66c2', phone: '#16a34a', email: '#ea4335', map: '#34a853',
  site: '', apply: '', url: ''
};

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* القيم الافتراضية — بتتولّد من بيانات الشركة أول مرة عشان الصفحة متبقاش فاضية */
function seed(site) {
  const c = (site && site.contact) || {};
  const items = [];
  const add = (type, value, label) => { if (value) items.push({ id: uid(), type, label: label || '', value: String(value), enabled: true }); };
  add('site', '/');
  add('apply', '/ar/quote');
  add('whatsapp', c.whatsapp || (c.phones || [])[0] || '');
  if ((c.phones || [])[0]) add('phone', c.phones[0]);
  if (c.email) add('email', c.email);
  if (c.mapLink) add('map', c.mapLink);
  add('facebook', c.facebook); add('instagram', c.instagram); add('tiktok', c.tiktok); add('youtube', c.youtube);
  return { title: '', tagline: '', avatar: '', theme: 'midnight', btn: 'card', icons: 'brand', items, people: [] };
}

const digits = s => String(s || '').replace(/\D/g, '');
/* رقم دولي سليم: يشيل 00 والمسافات، ولو بادئ بـ0 يعتبره مصري (20). رقم معاه كود دولة بيفضل زي ما هو. */
function intl(v) { let d = digits(String(v || '').replace(/^\s*00/, '')); if (!d) return ''; if (d[0] === '0') d = '20' + d.slice(1); return d; }
/* لينك آمن: بيقبل http(s)/mailto/tel/نسبي، ولو كتب دومين من غير http بيضيف https تلقائي. بيرفض javascript: وغيره. */
function autoUrl(v) {
  v = String(v || '').trim(); if (!v) return '';
  if (/^(https?:\/\/|mailto:|tel:|\/(?!\/))/i.test(v)) return v;
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(v)) return 'https://' + v;
  return '';
}

/* بيبني اللينك النهائي لأي زر حسب نوعه. base = عنوان الموقع. */
function href(it, base) {
  const t = TYPES[it.type] || TYPES.url; const v = String(it.value || '').trim();
  switch (t.kind) {
    case 'site': return autoUrl(v) || (base + '/ar');
    case 'apply': return autoUrl(v) || (base + '/ar/quote');
    case 'wa': { if (/(wa\.me|whatsapp\.com)/i.test(v) || /^https?:\/\//i.test(v)) return autoUrl(v); const d = intl(v); return d ? 'https://wa.me/' + d : ''; }
    case 'tel': { const d = intl(v); return d ? 'tel:+' + d : ''; }
    case 'mail': return v && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? 'mailto:' + v : '';
    default: return autoUrl(v);
  }
}

/* الأزرار الجاهزة للعرض (مفعّلة بس لو forPublic) */
function items(cfg, base, forPublic) {
  return (cfg.items || []).filter(it => (forPublic ? it.enabled !== false : true) && TYPES[it.type])
    .map(it => { const t = TYPES[it.type]; const url = href(it, base); return {
      id: it.id, type: it.type, enabled: it.enabled !== false, raw: it.value || '', img: it.img || '',
      label: (it.label || '').trim() || t.label, icon: t.icon, brand: !!t.brand, color: BRAND[it.type] || '', href: url, valid: !!url };
    });
}
function people(cfg, forPublic) {
  return (cfg.people || []).filter(p => forPublic ? p.enabled !== false : true).map(p => ({
    id: p.id, name: p.name || '', role: p.role || '', photo: p.photo || '', enabled: p.enabled !== false,
    phone: p.phone || '', whatsapp: p.whatsapp || '',
    tel: p.phone ? 'tel:+' + intl(p.phone) : '', wa: p.whatsapp ? (intl(p.whatsapp) ? 'https://wa.me/' + intl(p.whatsapp) : '') : ''
  }));
}

/* ===== صفحات متعددة: كل صفحة ليها «كلمة» (slug) بتبقى لينك ثابت forsango.com/<slug> للباركود ===== */
/* كلمات محجوزة متتعملش صفحة بيها عشان متلخبطش مع مسارات الموقع */
const RESERVED = ['social', 'admin', 'ar', 'en', 'api', 'p', 'track', 'me', 'agent', 'img', 'images', 'css', 'js', 'fonts', 'uploads', 'vendor', 'assets', 'static', 'robots', 'sitemap', 'favicon', 'health'];
/* slug سليم: إنجليزي صغير + أرقام + شرطة، 1–40 حرف، مش محجوز */
function slugOk(s) { s = String(s || '').trim().toLowerCase(); return /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(s) && RESERVED.indexOf(s) < 0; }
/* بيرجّع مصفوفة الصفحات، وبيهاجر الشكل القديم (كائن واحد) لصفحة اسمها social مقفولة */
function pagesOf(raw, site) {
  raw = raw || {};
  let pages = Array.isArray(raw.pages) ? raw.pages.slice() : null;
  if (!pages) { const old = (raw.items || raw.title || raw.people || raw.theme) ? raw : seed(site); pages = [Object.assign({}, old, { slug: 'social', locked: true })]; }
  let main = pages.find(p => p && p.slug === 'social');
  if (!main) { main = Object.assign(seed(site), { slug: 'social', locked: true }); pages.unshift(main); } else main.locked = true;
  const seen = {}; return pages.filter(p => p && p.slug && !seen[p.slug] && (seen[p.slug] = 1));
}
function findPage(raw, site, slug) { return pagesOf(raw, site).find(p => p.slug === String(slug || '').toLowerCase()) || null; }

module.exports = { TYPES, TYPE_LIST, THEMES, THEME_LIST, BTN_STYLES, ICON_STYLES, BRAND, seed, items, people, href, uid, digits, intl, autoUrl, RESERVED, slugOk, pagesOf, findPage };

/* عرض صفحة /social على المتصفح — نفس الكود بيشغّل الصفحة الحقيقية والمعاينة اللحظية في لوحة التحكم.
   بيعتمد على window.__ICONS__ (أيقونات جاية من السيرفر) و window.__SOCIAL__ (الإعدادات + base).
   المنطق مطابق لـ lib/social.js — أي تعديل يتعمل في الاتنين. */
(function () {
  var TYPES = {
    site: { icon: 'globe', label: 'الموقع الإلكتروني', kind: 'site' },
    apply: { icon: 'briefcase', label: 'اطلب عرض سعر', kind: 'apply' },
    whatsapp: { icon: 'whatsapp', label: 'واتساب', brand: 1, kind: 'wa' },
    wagroup: { icon: 'whatsapp', label: 'جروب واتساب', brand: 1, kind: 'url' },
    wachannel: { icon: 'whatsapp', label: 'قناة واتساب', brand: 1, kind: 'url' },
    phone: { icon: 'phone', label: 'اتصل بنا', kind: 'tel' },
    email: { icon: 'mail', label: 'إيميل', kind: 'mail' },
    map: { icon: 'map', label: 'موقعنا على الخريطة', kind: 'url' },
    facebook: { icon: 'facebook', label: 'فيسبوك', brand: 1, row: 1, kind: 'url' },
    messenger: { icon: 'facebook', label: 'ماسنجر', brand: 1, row: 1, kind: 'url' },
    instagram: { icon: 'instagram', label: 'انستجرام', brand: 1, row: 1, kind: 'url' },
    tiktok: { icon: 'tiktok', label: 'تيك توك', brand: 1, row: 1, kind: 'url' },
    youtube: { icon: 'youtube', label: 'يوتيوب', brand: 1, row: 1, kind: 'url' },
    telegram: { icon: 'send', label: 'تليجرام', brand: 1, row: 1, kind: 'url' },
    twitter: { icon: 'x', label: 'إكس (تويتر)', brand: 1, row: 1, kind: 'url' },
    linkedin: { icon: 'linkedin', label: 'لينكد إن', brand: 1, row: 1, kind: 'url' },
    url: { icon: 'link', label: 'رابط', kind: 'url' }
  };
  var BRAND = { facebook: '#1877f2', messenger: '#0084ff', instagram: 'linear-gradient(45deg,#f09433,#dc2743,#bc1888)', whatsapp: '#25d366', wagroup: '#25d366', wachannel: '#25d366', tiktok: '#010101', youtube: '#ff0000', telegram: '#229ed9', twitter: '#000', linkedin: '#0a66c2', phone: '#16a34a', email: '#ea4335', map: '#34a853' };
  var THS = ['midnight', 'royal', 'green', 'emerald', 'dark', 'purple', 'sunset', 'ocean', 'gold', 'rose', 'sky', 'light'];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function dig(s) { return String(s || '').replace(/\D/g, ''); }
  function intl(v) { var d = dig(String(v || '').replace(/^\s*00/, '')); if (!d) return ''; if (d[0] === '0') d = '20' + d.slice(1); return d; }
  function autoUrl(v) { v = String(v || '').trim(); if (!v) return ''; if (/^(https?:\/\/|mailto:|tel:|\/(?!\/))/i.test(v)) return v; if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(v)) return 'https://' + v; return ''; }
  function ico(t) { var m = window.__ICONS__ || {}; return (t.brand ? (m['b:' + t.icon] || m['i:' + t.icon]) : m['i:' + t.icon]) || m['i:link'] || ''; }
  function wa(v) { v = String(v || '').trim(); if (/(wa\.me|whatsapp\.com)/i.test(v) || /^https?:\/\//i.test(v)) return autoUrl(v); var d = intl(v); return d ? 'https://wa.me/' + d : ''; }
  function href(it, base) {
    var t = TYPES[it.type] || TYPES.url, v = String(it.value || '').trim();
    if (t.kind === 'site') return autoUrl(v) || (base + '/ar');
    if (t.kind === 'apply') return autoUrl(v) || (base + '/ar/quote');
    if (t.kind === 'wa') return wa(v);
    if (t.kind === 'tel') { var d = intl(v); return d ? 'tel:+' + d : ''; }
    if (t.kind === 'mail') return v && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? 'mailto:' + v : '';
    return autoUrl(v);
  }

  function render(cfg, base) {
    cfg = cfg || {}; base = base || '';
    var items = (cfg.items || []).filter(function (it) { return it && it.enabled !== false && TYPES[it.type]; })
      .map(function (it) { var t = TYPES[it.type]; return { type: it.type, href: href(it, base), label: (String(it.label || '').trim() || t.label), icon: ico(t), color: BRAND[it.type] || '', img: it.img || '' }; })
      .filter(function (it) { return it.href; });
    var people = (cfg.people || []).filter(function (p) { return p && p.enabled !== false && (p.name || '').trim(); });
    var icons = cfg.icons === 'soft' ? 'soft' : 'brand';
    var theme = THS.indexOf(cfg.theme) >= 0 ? cfg.theme : 'midnight';
    var btn = cfg.btn === 'pill' ? 'pill' : 'card';

    var ph = window.__SOCIAL__ && window.__SOCIAL__.logo || '';
    var ttl = esc(cfg.title || (window.__SOCIAL__ && window.__SOCIAL__.ttl) || 'تواصل معنا');
    var h = '<div class="wrap">';
    h += '<div class="head">';
    h += '<div class="ava-w">' + (cfg.avatar ? '<img class="ava" src="' + esc(cfg.avatar) + '" alt="">' : '<div class="ava ph"><img src="' + esc(ph) + '" alt=""></div>') + '</div>';
    h += '<h1 class="name">' + ttl + '</h1>';
    if (cfg.tagline) h += '<p class="tag">' + esc(cfg.tagline) + '</p>';
    h += '</div>';

    if (items.length) {
      h += '<div class="links">';
      items.forEach(function (it, i) {
        var ext = /^https?:/.test(it.href) ? ' target="_blank" rel="noopener"' : '';
        var useBrand = icons === 'brand' && it.color && !it.img;
        var st = useBrand ? ' style="--bc:' + it.color + '"' : '';
        var chip = it.img ? '<img src="' + esc(it.img) + '" alt="">' : it.icon;
        h += '<a class="lnk rev' + (useBrand ? ' br' : '') + (it.img ? ' img' : '') + '" style="animation-delay:' + (i * 45) + 'ms" href="' + esc(it.href) + '"' + ext + '>'
          + '<span class="ic"' + st + '>' + chip + '</span><b class="t">' + esc(it.label) + '</b>'
          + '<svg class="go" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg></a>';
      });
      h += '</div>';
    }
    if (people.length) {
      h += '<div class="sec-t">للتواصل المباشر مع المسؤولين</div><div class="people">';
      people.forEach(function (p) {
        var tel = p.phone ? 'tel:+' + intl(p.phone) : '', w = wa(p.whatsapp);
        h += '<div class="person rev">' + (p.photo ? '<img class="pic" src="' + esc(p.photo) + '" alt="">' : '<div class="pic">' + esc((p.name || '؟').charAt(0)) + '</div>')
          + '<div class="pi"><b>' + esc(p.name) + '</b>' + (p.role ? '<span>' + esc(p.role) + '</span>' : '') + '</div><div class="acts">'
          + (tel ? '<a class="c" href="' + esc(tel) + '" aria-label="اتصال">' + (window.__ICONS__['i:phone'] || '') + '</a>' : '')
          + (w ? '<a class="w" href="' + esc(w) + '" target="_blank" rel="noopener" aria-label="واتساب">' + (window.__ICONS__['b:whatsapp'] || '') + '</a>' : '')
          + '</div></div>';
      });
      h += '</div>';
    }
    if (!items.length && !people.length) h += '<div class="empty">لسه مفيش روابط — ضيفها من لوحة التحكم.</div>';
    h += '<div class="foot"><a href="' + esc(base) + '/ar">' + ttl + '</a><span>© ' + new Date().getFullYear() + ' — كل الحقوق محفوظة</span></div></div>';

    var root = document.getElementById('app') || document.body;
    root.className = 'sbody'; root.setAttribute('data-theme', theme); root.setAttribute('data-btn', btn); root.setAttribute('data-icons', icons);
    root.innerHTML = h;
  }
  window.renderSocial = render;
  function boot() { if (window.__SOCIAL__) render(window.__SOCIAL__.cfg, window.__SOCIAL__.base); }
  if (document.readyState !== 'loading') boot(); else document.addEventListener('DOMContentLoaded', boot);
  window.addEventListener('message', function (e) { if (e.data && e.data.social) render(e.data.social, (window.__SOCIAL__ || {}).base || ''); });
})();

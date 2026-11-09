/* نسر الخليج - تفاعلات الموقع */
(function () {
  'use strict';
  document.documentElement.classList.add('js');
  var NK = window.NK || { t: {} };
  var T = NK.t;

  // header shadow + back to top
  var hd = document.getElementById('hd');
  var up = document.getElementById('toTop');
  function onScroll() {
    var y = window.scrollY || 0;
    if (hd) hd.classList.toggle('scrolled', y > 10);
    if (up) up.classList.toggle('show', y > 700);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  if (up) up.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });

  // mobile menu
  var burger = document.getElementById('burger');
  var nav = document.getElementById('nav');
  function setMenu(open) {
    if (!nav || !burger) return;
    nav.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.classList.toggle('menu-open', open);
  }
  if (burger) burger.addEventListener('click', function () { setMenu(!nav.classList.contains('open')); });
  if (nav) nav.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { setMenu(false); closeLb(); } });

  // reveal on scroll
  var items = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -40px 0px', threshold: 0.05 });
    items.forEach(function (el) { io.observe(el); });
  } else {
    items.forEach(function (el) { el.classList.add('in'); });
  }

  // count-up numbers
  var nums = document.querySelectorAll('[data-count]');
  if ('IntersectionObserver' in window) {
    var co = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        co.unobserve(en.target);
        var el = en.target, raw = el.getAttribute('data-count'), m = raw.match(/\d+/);
        if (!m) return;
        var end = parseInt(m[0], 10), pre = raw.slice(0, m.index), post = raw.slice(m.index + m[0].length);
        if (end < 2) return;
        var start = null;
        function step(ts) {
          if (!start) start = ts;
          var p = Math.min(1, (ts - start) / 1200);
          el.textContent = pre + Math.round(end * (1 - Math.pow(1 - p, 3))) + post;
          if (p < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      });
    }, { threshold: 0.4 });
    nums.forEach(function (el) { co.observe(el); });
  }

  // ----- forms: tabs + WhatsApp / email -----
  document.querySelectorAll('[data-forms]').forEach(function (box) {
    var tabs = box.querySelectorAll('[data-tab]');
    tabs.forEach(function (b) {
      b.addEventListener('click', function () {
        tabs.forEach(function (x) { x.setAttribute('aria-selected', x === b ? 'true' : 'false'); });
        box.querySelectorAll('form.nform').forEach(function (f) { f.hidden = f.getAttribute('data-kind') !== b.getAttribute('data-tab'); });
      });
    });
    box.querySelectorAll('form.nform').forEach(setupForm);
  });

  function status(form, msg, type) {
    var s = form.querySelector('.fstatus');
    if (!s) return;
    s.textContent = msg || '';
    s.className = 'fstatus' + (type ? ' ' + type : '');
  }

  function validate(form) {
    var ok = true, first = null;
    form.querySelectorAll('[required]').forEach(function (el) {
      var bad = el.type === 'checkbox' ? !el.checked : !String(el.value || '').trim();
      var box = el.closest('.fld, .consent');
      if (box) box.classList.toggle('bad', bad);
      if (bad) { ok = false; if (!first) first = el; }
    });
    form.querySelectorAll('input[type=email]').forEach(function (el) {
      if (el.value && !/^\S+@\S+\.\S+$/.test(el.value)) { el.closest('.fld').classList.add('bad'); ok = false; if (!first) first = el; }
    });
    if (first) first.focus();
    if (!ok) status(form, T.required, 'err');
    return ok;
  }

  function waText(form) {
    var lines = ['*' + form.getAttribute('data-title') + '*', ''];
    form.querySelectorAll('[data-label]').forEach(function (el) {
      var v = String(el.value || '').trim();
      if (v) lines.push(el.getAttribute('data-label') + ': ' + v);
    });
    return lines.join('\n');
  }

  function setupForm(form) {
    form.addEventListener('change', function (e) {
      var f = e.target.closest('.consent');
      if (f) f.classList.remove('bad');
    });
    form.addEventListener('input', function (e) {
      var f = e.target.closest('.fld, .consent');
      if (f) f.classList.remove('bad');
    });

    // واتساب: نسجّل نسخة في لوحة التحكم ونفتح المحادثة برسالة جاهزة
    var waBtn = form.querySelector('[data-ch="whatsapp"]');
    if (waBtn) waBtn.addEventListener('click', function () {
      if (!validate(form)) return;
      var url = 'https://wa.me/' + form.getAttribute('data-wa') + '?text=' + encodeURIComponent(waText(form));
      var win = window.open(url, '_blank');
      if (win) { try { win.opener = null; } catch (e) {} } else window.location.href = url;
      try {
        var fd = new FormData(form);
        fd.set('channel', 'whatsapp');
        fd.delete('cv');
        var body = new URLSearchParams(fd);
        if (navigator.sendBeacon) navigator.sendBeacon(form.action, body);
        else fetch(form.action, { method: 'POST', body: body, keepalive: true });
      } catch (e) {}
      status(form, T.wa_note, 'ok');
    });

    // إيميل: إرسال للسيرفر من غير ما الصفحة تتحمل تاني
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('[data-ch="email"]');
      if (!btn) { if (waBtn) waBtn.click(); return; } // الإيميل مش متظبط: نبعت واتساب
      if (!validate(form)) return;
      var label = btn ? btn.innerHTML : '';
      if (btn) { btn.disabled = true; btn.textContent = T.sending; }
      status(form, '', '');
      var fd = new FormData(form);
      fd.set('channel', 'email');
      fetch(form.action, { method: 'POST', body: fd, headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' } })
        .then(function (r) { return r.json().catch(function () { return { ok: false, msg: T.sent_fail }; }); })
        .then(function (res) {
          status(form, res.msg || (res.ok ? T.sent_ok : T.sent_fail), res.ok ? 'ok' : 'err');
          if (res.ok) form.reset();
        })
        .catch(function () { status(form, T.sent_fail, 'err'); })
        .then(function () { if (btn) { btn.disabled = false; btn.innerHTML = label; } });
    });
  }

  // عدّاد الضغطات للإحصائيات (من غير كوكيز)
  function track(name) {
    try {
      var body = JSON.stringify({ e: name });
      if (navigator.sendBeacon) navigator.sendBeacon('/t', new Blob([body], { type: 'text/plain' }));
      else fetch('/t', { method: 'POST', body: body, keepalive: true, headers: { 'Content-Type': 'text/plain' } });
    } catch (e) {}
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var h = a.getAttribute('href') || '';
    if (/^https:\/\/wa\.me\//.test(h)) track('wa_click');
    else if (/^tel:/.test(h)) track('call_click');
    else if (/^mailto:/.test(h)) track('email_click');
    else if (a.hasAttribute('download') || /\.pdf($|\?)/i.test(h)) track('profile_download');
    else if (/facebook\.com|instagram\.com|tiktok\.com|linkedin\.com|youtube\.com/.test(h) && !/sharer/.test(h)) track('social_click');
  }, true);

  // share button
  document.querySelectorAll('[data-share]').forEach(function (b) {
    b.addEventListener('click', function () {
      var data = { title: b.getAttribute('data-title') || document.title, url: location.href };
      if (navigator.share) { navigator.share(data).catch(function () {}); return; }
      if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(function () { b.classList.add('done'); b.lastChild.textContent = ' ✓'; });
    });
  });

  // simple lightbox
  var lb = null, lbList = [], lbI = 0;
  function closeLb() { if (lb) { lb.remove(); lb = null; document.body.style.overflow = ''; } }
  function showLb() {
    var a = lbList[lbI];
    lb.querySelector('img').src = a.getAttribute('href');
    lb.querySelector('p').textContent = a.getAttribute('data-cap') || '';
  }
  document.querySelectorAll('[data-lightbox]').forEach(function (g) {
    g.addEventListener('click', function (e) {
      var a = e.target.closest('a');
      if (!a) return;
      e.preventDefault();
      lbList = Array.prototype.slice.call(g.querySelectorAll('a'));
      lbI = lbList.indexOf(a);
      lb = document.createElement('div');
      lb.className = 'lb';
      lb.setAttribute('role', 'dialog');
      lb.innerHTML = '<div><img alt=""><p></p></div>' +
        '<button class="lb-x" aria-label="close"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg></button>' +
        (lbList.length > 1 ? '<button class="lb-p" aria-label="prev"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg></button><button class="lb-n" aria-label="next"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg></button>' : '');
      document.body.appendChild(lb);
      document.body.style.overflow = 'hidden';
      showLb();
      lb.addEventListener('click', function (ev) {
        if (ev.target.closest('.lb-p')) { lbI = (lbI - 1 + lbList.length) % lbList.length; showLb(); }
        else if (ev.target.closest('.lb-n')) { lbI = (lbI + 1) % lbList.length; showLb(); }
        else if (ev.target.closest('.lb-x') || ev.target === lb) closeLb();
      });
    });
  });

  // تأثير الكتابة لعنوان الهيرو — يتكتب لوحده أول ما الصفحة تفتح
  (function () {
    var h = document.querySelector('.hero-text h1');
    if (!h || !window.matchMedia || !matchMedia('(prefers-reduced-motion: no-preference)').matches) return;
    var full = (h.textContent || '').trim();
    if (!full) return;
    var box = h.getBoundingClientRect();
    h.style.minHeight = box.height + 'px';
    h.textContent = '';
    h.classList.add('tw');
    var i = 0;
    (function type() {
      h.textContent = full.slice(0, i);
      if (i < full.length) { i++; setTimeout(type, 65); }
      else { h.style.minHeight = ''; setTimeout(function () { h.classList.remove('tw'); }, 1800); }
    })();
  })();
})();

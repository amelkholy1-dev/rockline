/* لوحة التحكم: القائمة، تأكيد الحذف، معاينة الصور، ومحرر المحتوى */
(function () {
  'use strict';

  var side = document.getElementById('side');
  var mb = document.getElementById('menuBtn');
  if (mb && side) {
    mb.addEventListener('click', function (e) { e.stopPropagation(); side.classList.toggle('open'); });
    document.addEventListener('click', function (e) { if (side.classList.contains('open') && !side.contains(e.target)) side.classList.remove('open'); });
  }

  document.querySelectorAll('form[data-confirm]').forEach(function (f) {
    f.addEventListener('submit', function (e) { if (!window.confirm(f.getAttribute('data-confirm'))) e.preventDefault(); });
  });

  document.querySelectorAll('input[type=file][data-preview]').forEach(function (inp) {
    inp.addEventListener('change', function () {
      var box = inp.closest('form').querySelector('.preview');
      if (!box) return;
      box.innerHTML = '';
      Array.prototype.slice.call(inp.files || [], 0, 30).forEach(function (f) {
        if (!/^image\//.test(f.type)) return;
        var img = document.createElement('img');
        img.src = URL.createObjectURL(f);
        box.appendChild(img);
      });
      var span = inp.parentNode.querySelector('span');
      if (span && inp.files.length) span.textContent = inp.files.length + ' ملف متختار';
    });
  });

  // اختيار كل الصلاحيات / شيلها
  document.querySelectorAll('[data-check-all],[data-check-none]').forEach(function (b) {
    b.addEventListener('click', function () {
      var on = b.hasAttribute('data-check-all');
      b.closest('form').querySelectorAll('input[name=perms]').forEach(function (c) { c.checked = on; });
    });
  });

  // تلميح الرسم البياني
  document.querySelectorAll('[data-chart]').forEach(function (box) {
    var tip = box.querySelector('.tip');
    function show(g) {
      box.querySelectorAll('.bar.on').forEach(function (x) { x.classList.remove('on'); });
      g.classList.add('on');
      var r = g.querySelector('.hit').getBoundingClientRect(), b = box.getBoundingClientRect();
      var m = g.querySelector('.mark');
      var top = m ? m.getBoundingClientRect().top : r.bottom - 20;
      tip.textContent = g.getAttribute('data-tip');
      tip.hidden = false;
      tip.style.left = Math.max(60, Math.min(b.width - 60, r.left - b.left + r.width / 2)) + 'px';
      tip.style.top = (top - b.top) + 'px';
    }
    box.querySelectorAll('.bar').forEach(function (g) {
      g.addEventListener('mouseenter', function () { show(g); });
      g.addEventListener('click', function () { show(g); });
    });
    box.addEventListener('mouseleave', function () { tip.hidden = true; box.querySelectorAll('.bar.on').forEach(function (x) { x.classList.remove('on'); }); });
  });

  // open message from dashboard link
  if (location.hash && /^#m-/.test(location.hash)) {
    var d = document.querySelector(location.hash);
    if (d && d.tagName === 'DETAILS') { d.open = true; d.scrollIntoView({ block: 'center' }); }
  }

  // ---------- content editor ----------
  var C = window.CONTENT;
  var root = document.getElementById('editor');
  if (!C || !root) return;
  var ICONS = window.ICON_SVG || {};
  var sec = C.sec;
  var data = sec.kind === 'list' ? (Array.isArray(C.value) ? C.value : []) : (C.value || {});

  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }

  function fieldUI(f, obj) {
    var v = obj[f.k];
    if (f.type === 'bi' || f.type === 'bitext') {
      if (!v || typeof v !== 'object') v = obj[f.k] = { ar: '', en: '' };
      var mk = function (lang) {
        var inp = f.type === 'bitext' ? el('textarea', { rows: f.rows || 3 }) : el('input', {});
        inp.value = v[lang] || '';
        if (lang === 'en') inp.setAttribute('dir', 'ltr');
        inp.addEventListener('input', function () { v[lang] = inp.value; refreshTitles(); });
        return el('label', { class: 'fldx' }, [el('span', { text: f.label + (lang === 'ar' ? ' (عربي)' : ' (English)') }), inp]);
      };
      return [mk('ar'), mk('en')];
    }
    if (f.type === 'lines') {
      var ta = el('textarea', { rows: 8 });
      ta.value = (Array.isArray(v) ? v : []).join('\n');
      ta.addEventListener('input', function () { obj[f.k] = ta.value.split('\n'); });
      return [el('label', { class: 'fldx full' }, [el('span', { text: f.label }), ta])];
    }
    if (f.type === 'icon') {
      var cur = el('span', { class: 'cur', html: ICONS[v] || ICONS.star || '' });
      var grid = el('div', { class: 'icon-grid', hidden: '' });
      C.icons.forEach(function (n) {
        var b = el('button', { type: 'button', title: n, html: ICONS[n], class: n === v ? 'on' : '' });
        b.addEventListener('click', function () {
          obj[f.k] = n; cur.innerHTML = ICONS[n];
          grid.querySelectorAll('.on').forEach(function (x) { x.classList.remove('on'); });
          b.classList.add('on'); grid.hidden = true;
        });
        grid.appendChild(b);
      });
      var toggle = el('button', { type: 'button', class: 'btn sm ghost', text: 'غيّر الأيقونة', onclick: function () { grid.hidden = !grid.hidden; } });
      return [el('div', { class: 'fldx full' }, [el('span', { text: f.label }), el('div', { class: 'icon-pick' }, [cur, toggle]), grid])];
    }
    var inp = el('input', { dir: /url|value/.test(f.k) ? 'ltr' : 'auto' });
    inp.value = v || '';
    inp.addEventListener('input', function () { obj[f.k] = inp.value; refreshTitles(); });
    return [el('label', { class: 'fldx' }, [el('span', { text: f.label }), inp])];
  }

  function itemTitle(it) {
    for (var i = 0; i < sec.fields.length; i++) {
      var f = sec.fields[i], v = it[f.k];
      if (f.type === 'bi' || f.type === 'bitext') { if (v && v.ar) return v.ar; }
      else if (f.type === 'text' && v) return v;
    }
    return 'عنصر جديد';
  }
  function refreshTitles() {
    if (sec.kind !== 'list') return;
    root.querySelectorAll('.item').forEach(function (node, i) {
      var b = node.querySelector('.item-head b');
      if (b && data[i]) b.textContent = itemTitle(data[i]).slice(0, 80);
    });
  }

  function blank() {
    var o = {};
    sec.fields.forEach(function (f) {
      o[f.k] = (f.type === 'bi' || f.type === 'bitext') ? { ar: '', en: '' } : (f.type === 'lines' ? [] : (f.type === 'icon' ? 'star' : ''));
    });
    return o;
  }

  function render() {
    root.innerHTML = '';
    if (sec.kind === 'object') {
      var body = el('div', { class: 'item-body' });
      sec.fields.forEach(function (f) {
        fieldUI(f, data).forEach(function (n) { if (f.type === 'bitext') n.classList.add('full'); body.appendChild(n); });
      });
      root.appendChild(el('div', { class: 'item' }, [body]));
      return;
    }
    data.forEach(function (it, i) {
      var body = el('div', { class: 'item-body' });
      sec.fields.forEach(function (f) { fieldUI(f, it).forEach(function (n) { body.appendChild(n); }); });
      var head = el('div', { class: 'item-head' }, [
        el('span', { class: 'num', text: String(i + 1) }),
        el('b', { text: itemTitle(it).slice(0, 80) }),
        el('button', { type: 'button', class: 'icon-btn', title: 'لفوق', html: '&#9650;', onclick: function () { move(i, -1); } }),
        el('button', { type: 'button', class: 'icon-btn', title: 'لتحت', html: '&#9660;', onclick: function () { move(i, 1); } }),
        el('button', { type: 'button', class: 'icon-btn danger', title: 'حذف', html: '&#10005;', onclick: function () { if (confirm('حذف العنصر ده؟')) { data.splice(i, 1); render(); } } })
      ]);
      if (i === 0) head.querySelectorAll('.icon-btn')[0].disabled = true;
      if (i === data.length - 1) head.querySelectorAll('.icon-btn')[1].disabled = true;
      root.appendChild(el('div', { class: 'item' }, [head, body]));
    });
    root.appendChild(el('button', { type: 'button', class: 'btn ghost add-btn', html: '+ إضافة عنصر', onclick: function () {
      data.push(blank()); render();
      var items = root.querySelectorAll('.item'); var last = items[items.length - 1];
      if (last) { last.scrollIntoView({ block: 'center', behavior: 'smooth' }); var f = last.querySelector('input,textarea'); if (f) f.focus(); }
    } }));
  }
  function move(i, d) {
    var j = i + d;
    if (j < 0 || j >= data.length) return;
    var t = data[i]; data[i] = data[j]; data[j] = t;
    render();
  }

  render();
  document.getElementById('cform').addEventListener('submit', function () {
    document.getElementById('cjson').value = JSON.stringify(data);
  });
})();

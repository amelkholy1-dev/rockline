/* قائمة الطلب (سلة): أصناف بكمياتها محفوظة في المتصفح، وبتتحط في فورم عرض السعر */
(function () {
  'use strict';
  var KEY = 'rl_basket';
  var T = (window.NK && window.NK.t) || {};
  function load() {
    try {
      var a = JSON.parse(localStorage.getItem(KEY) || '[]');
      return (Array.isArray(a) ? a : []).filter(function (x) { return x && typeof x.name === 'string' && x.name && isFinite(x.qty); }).slice(0, 40);
    } catch (e) { return []; }
  }
  function save(a) { try { localStorage.setItem(KEY, JSON.stringify(a.slice(0, 40))); } catch (e) {} render(); }
  var round = function (n) { return Math.round(n * 1000) / 1000; };
  var RL = window.RLBasket = {
    get: load,
    count: function () { return load().length; },
    add: function (it) {
      var name = String(it.name || '').slice(0, 160), unit = String(it.unit || '').slice(0, 20), qty = Number(it.qty);
      if (!name || !(qty > 0)) return false;
      var a = load(), f = a.filter(function (x) { return x.name === name && x.unit === unit; })[0];
      if (f) f.qty = round(f.qty + qty); else a.push({ name: name, qty: round(qty), unit: unit });
      save(a); return true;
    },
    setQty: function (i, q) { var a = load(); if (a[i] && q > 0) { a[i].qty = round(q); save(a); } },
    remove: function (i) { var a = load(); a.splice(i, 1); save(a); },
    clear: function () { save([]); }
  };

  function text(a) { return a.map(function (x) { return '• ' + x.name + ' — ' + x.qty + ' ' + x.unit; }).join('\n'); }

  function render() {
    var a = load();
    var btn = document.getElementById('basketBtn'), cnt = document.getElementById('basketCount');
    if (btn) btn.hidden = !a.length;
    if (cnt) cnt.textContent = a.length;
    // حقل الأصناف في الفورمات (لو القايمة فيها حاجة بنكتبها فيه، وبنخلي الصنف والتفاصيل اختياريين)
    document.querySelectorAll('form.nform textarea[name="items"]').forEach(function (ta) {
      var form = ta.closest('form');
      if (a.length) ta.value = text(a);
      ['ptype', 'details'].forEach(function (n) {
        var el = form.querySelector('[name="' + n + '"]'); if (!el) return;
        var has = a.length || (n === 'details' && ta.value.trim());
        if (has) { el.removeAttribute('required'); } else { el.setAttribute('required', ''); }
        var star = el.closest('.fld') && el.closest('.fld').querySelector('em'); if (star) star.style.visibility = has ? 'hidden' : '';
      });
    });
    var box = document.getElementById('basketList');
    if (!box) return;
    box.hidden = false;
    if (!a.length) { box.innerHTML = '<p class="muted">' + (T.list_empty || '') + '</p>'; return; }
    var h = '<table class="blist-t"><tbody>';
    a.forEach(function (x, i) {
      h += '<tr><td class="bn">' + esc(x.name) + '</td><td><input type="number" min="0" step="any" value="' + x.qty + '" data-q="' + i + '" aria-label="' + esc(T.qty || '') + '"></td><td>' + esc(x.unit) + '</td><td><button type="button" class="bx" data-rm="' + i + '" aria-label="' + esc(T.list_remove || '') + '">×</button></td></tr>';
    });
    h += '</tbody></table><button type="button" class="btn line-navy sm" data-clear>' + esc(T.list_clear || '') + '</button>';
    box.innerHTML = h;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  document.addEventListener('click', function (e) {
    var t = e.target;
    var rm = t.closest && t.closest('[data-rm]'); if (rm) { RL.remove(+rm.getAttribute('data-rm')); return; }
    if (t.closest && t.closest('[data-clear]')) { RL.clear(); return; }
    var add = t.closest && t.closest('[data-add-basket]');
    if (add) {
      var box = add.closest('[data-basket-box]') || document;
      var q = box.querySelector('[data-bq]'), u = box.querySelector('[data-bu]');
      var ok = RL.add({ name: add.getAttribute('data-name'), qty: q ? q.value : 1, unit: u ? u.value : '' });
      var msg = box.querySelector('[data-bmsg]');
      if (msg) { msg.textContent = ok ? (T.added_to_list || '') : (T.required || ''); msg.className = 'bmsg ' + (ok ? 'ok' : 'err'); }
    }
  });
  document.addEventListener('change', function (e) {
    var q = e.target.closest && e.target.closest('[data-q]'); if (q) RL.setQty(+q.getAttribute('data-q'), parseFloat(q.value));
  });
  // بعد ما الفورم يتبعت بنجاح بيتعمله reset: نفضّي القايمة
  document.addEventListener('reset', function (e) { if (e.target.matches && e.target.matches('form.nform[data-kind="quote"]')) setTimeout(function () { RL.clear(); }, 0); }, true);
  document.addEventListener('nk:sent', function (e) { if (e.target.matches && e.target.matches('form.nform[data-kind="quote"]')) RL.clear(); });
  window.addEventListener('storage', render);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render); else render();
})();

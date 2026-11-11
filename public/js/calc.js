/* حاسبة الكميات: وزن حديد التسليح (القطر² ÷ 162 كجم/متر) وأكياس الأسمنت */
(function () {
  'use strict';
  var T = (window.NK && window.NK.t) || {};
  document.querySelectorAll('[data-calc]').forEach(function (root) {
    if (root.__ready) return; root.__ready = true;
    var dias = (root.getAttribute('data-dias') || '8,10,12,16,18,20,25,32').split(',').map(function (x) { return parseFloat(x); }).filter(function (x) { return x > 0; });
    var len0 = parseFloat(root.getAttribute('data-len')) || 12;
    var bag0 = parseFloat(root.getAttribute('data-bag')) || 50;
    var rows = root.querySelector('[data-rows]');
    var fmt = function (n, d) { return (isFinite(n) ? n : 0).toLocaleString('en', { maximumFractionDigits: d == null ? 2 : d }); };
    var L = function (k) { return root.getAttribute('data-l-' + k) || ''; };

    function perM(d) { return d * d / 162; }
    function addRow(d) {
      var r = document.createElement('div'); r.className = 'crow';
      var opts = dias.map(function (x) { return '<option value="' + x + '"' + (x === (d || 12) ? ' selected' : '') + '>' + x + '</option>'; }).join('');
      r.innerHTML = '<label>' + L('dia') + '<select data-d>' + opts + '</select></label>' +
        '<label>' + L('len') + '<input type="number" min="0.5" step="any" value="' + len0 + '" data-len></label>' +
        '<label>' + L('count') + '<input type="number" min="0" step="1" value="" placeholder="0" data-n></label>' +
        '<div class="cres"><small>' + L('per') + '</small><b data-pb>0</b> kg</div>' +
        '<button type="button" class="bx" data-del aria-label="x">×</button>';
      rows.appendChild(r); calc();
    }
    function steelItems() {
      var items = [];
      rows.querySelectorAll('.crow').forEach(function (r) {
        var d = parseFloat(r.querySelector('[data-d]').value), len = parseFloat(r.querySelector('[data-len]').value) || 0, n = parseFloat(r.querySelector('[data-n]').value) || 0;
        var kg = perM(d) * len * n;
        r.querySelector('[data-pb]').textContent = fmt(perM(d) * len, 2);
        if (n > 0 && len > 0) items.push({ d: d, len: len, n: n, kg: kg });
      });
      return items;
    }
    function calc() {
      var items = steelItems(), kg = items.reduce(function (s, x) { return s + x.kg; }, 0);
      root.querySelector('[data-kg]').textContent = fmt(kg, 1);
      root.querySelector('[data-t]').textContent = fmt(kg / 1000, 3);
      // أسمنت
      var bagKg = parseFloat(root.querySelector('[data-bagkg]').value) || bag0;
      var bags = parseFloat(root.querySelector('[data-bags]').value) || 0;
      root.querySelector('[data-bags-t]').textContent = fmt(bags * bagKg / 1000, 3);
    }
    root.addEventListener('input', function (e) {
      if (e.target.matches('[data-tons-in]')) {
        var bagKg = parseFloat(root.querySelector('[data-bagkg]').value) || bag0;
        var t = parseFloat(e.target.value) || 0;
        root.querySelector('[data-bags]').value = t ? Math.ceil(t * 1000 / bagKg) : '';
      } else if (e.target.matches('[data-bags]')) {
        root.querySelector('[data-tons-in]').value = '';
      }
      calc();
    });
    root.addEventListener('click', function (e) {
      var t = e.target;
      if (t.closest('[data-ct]')) {
        var k = t.closest('[data-ct]').getAttribute('data-ct');
        root.querySelectorAll('[data-ct]').forEach(function (b) { b.classList.toggle('on', b === t.closest('[data-ct]')); });
        root.querySelectorAll('[data-pane]').forEach(function (p) { p.hidden = p.getAttribute('data-pane') !== k; });
      } else if (t.closest('[data-addrow]')) addRow();
      else if (t.closest('[data-del]')) { var r = t.closest('.crow'); if (rows.children.length > 1) { r.remove(); calc(); } }
      else if (t.closest('[data-addlist]')) {
        var pane = t.closest('[data-pane]').getAttribute('data-pane'), ok = false;
        if (pane === 'steel') {
          steelItems().forEach(function (x) { ok = window.RLBasket && window.RLBasket.add({ name: L('steel') + ' ' + x.d + ' ' + L('mm') + ' (' + x.n + ' × ' + x.len + ' ' + L('m') + ')', qty: Math.round(x.kg / 1000 * 1000) / 1000, unit: L('ton') }) || ok; });
        } else {
          var bags = parseFloat(root.querySelector('[data-bags]').value) || 0;
          if (bags > 0 && window.RLBasket) ok = window.RLBasket.add({ name: L('cement'), qty: bags, unit: L('bag') });
        }
        var m = t.closest('[data-pane]').querySelector('[data-cmsg]');
        if (m) { m.textContent = ok ? (T.added_to_list || '') : (T.required || ''); m.className = 'bmsg ' + (ok ? 'ok' : 'err'); }
      }
    });
    addRow(12);
  });
})();

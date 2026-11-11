/* واجهة المساعد (الشات) */
(function () {
  'use strict';
  var root = document.getElementById('chat'); if (!root) return;
  var C = window.NKC || {};
  var fab = document.getElementById('chatFab'), box = document.getElementById('chatBox'), msgs = document.getElementById('chatMsgs');
  var form = document.getElementById('chatForm'), input = document.getElementById('chatInput'), chips = document.getElementById('chatChips');
  var url = root.getAttribute('data-url'), sendUrl = root.getAttribute('data-send');
  var KEY = 'rl_chat', hist = [], busy = false;
  root.hidden = false;
  try { hist = JSON.parse(sessionStorage.getItem(KEY) || '[]').slice(-20); } catch (e) { hist = []; }

  function save() { try { sessionStorage.setItem(KEY, JSON.stringify(hist.slice(-20))); } catch (e) {} }
  function el(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; }
  function linkify(node, text) {
    // نص عادي + لينكات https بتتحول لروابط (من غير innerHTML)
    var re = /(https?:\/\/[^\s]+)/g, last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) node.appendChild(document.createTextNode(text.slice(last, m.index)));
      var a = el('a', null, m[1].length > 40 ? m[1].slice(0, 38) + '…' : m[1]); a.href = m[1]; a.target = '_blank'; a.rel = 'noopener'; node.appendChild(a);
      last = m.index + m[1].length;
    }
    if (last < text.length) node.appendChild(document.createTextNode(text.slice(last)));
  }
  function add(who, text, actions) {
    var b = el('div', 'cm ' + who); linkify(b, text);
    if (actions && actions.length) { var w = el('div', 'cm-act'); actions.forEach(function (a) { var l = el('a', 'cm-btn', a.label); l.href = a.url; if (/^https?:/.test(a.url)) { l.target = '_blank'; l.rel = 'noopener'; } w.appendChild(l); }); b.appendChild(w); }
    msgs.appendChild(b); msgs.scrollTop = msgs.scrollHeight; return b;
  }
  function open(v) {
    box.hidden = !v; fab.setAttribute('aria-expanded', v ? 'true' : 'false'); fab.hidden = v;
    if (v) { if (!msgs.children.length) { add('bot', C.welcome || ''); hist.forEach(function (h) { add(h.role === 'user' ? 'me' : 'bot', h.text); }); } setTimeout(function () { input.focus(); }, 50); }
  }
  fab.addEventListener('click', function () { open(true); });
  document.getElementById('chatX').addEventListener('click', function () { open(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !box.hidden) open(false); });

  function ask(text) {
    text = String(text || '').trim(); if (!text || busy) return;
    busy = true; chips.hidden = true; add('me', text); input.value = '';
    var wait = add('bot', '…'); wait.classList.add('wait');
    var payload = { message: text, history: hist.slice(-8) };
    hist.push({ role: 'user', text: text });
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
      .then(function (j) {
        wait.remove();
        if (j && j.reply) { add('bot', j.reply, j.actions); hist.push({ role: 'bot', text: j.reply }); }
        else add('bot', C.error || '');
      })
      .catch(function () { wait.remove(); add('bot', C.error || ''); })
      .then(function () { busy = false; save(); });
  }
  form.addEventListener('submit', function (e) { e.preventDefault(); ask(input.value); });
  chips.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) ask(b.textContent); });

  // سيب رقمك: بيتسجل كرسالة استفسار في لوحة التحكم
  var leave = document.getElementById('chatLeave'), lm = document.getElementById('chatLeaveMsg');
  leave.addEventListener('submit', function (e) {
    e.preventDefault();
    var lastQ = ''; for (var i = hist.length - 1; i >= 0; i--) if (hist[i].role === 'user') { lastQ = hist[i].text; break; }
    var fd = new URLSearchParams({ kind: 'contact', channel: 'email', name: leave.name.value, phone: leave.phone.value, message: '[من المساعد] طلب اتصال' + (lastQ ? ' — آخر سؤال: ' + lastQ : ''), consent: 'on', website: '' });
    fetch(sendUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' }, body: fd.toString() })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
      .then(function (j) { lm.textContent = j && j.ok ? (C.ok || '') : (C.error || ''); if (j && j.ok) leave.reset(); })
      .catch(function () { lm.textContent = C.error || ''; });
  });
})();

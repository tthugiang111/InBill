// Vẽ phiếu 80×45mm và tự co chữ cho vừa. Dùng chung: trang in của extension + xem trước trên web.
(function (root) {
  'use strict';

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function fmtTime(t) {
    const d = t ? new Date(t) : new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  // job: { title, footer, store, time, items: [{ name, note, qty }] }
  // Trả về { shown, hidden, fontPt, twoCol } để kiểm tra.
  function renderSlip(container, job) {
    container.textContent = '';
    const slip = el('div', 'slip');
    slip.appendChild(el('div', 'slip-title', job.title || 'PHIẾU SẢN PHẨM'));
    slip.appendChild(el('div', 'slip-meta', [fmtTime(job.time), job.store].filter(Boolean).join(' · ')));
    const list = el('div', 'slip-list');
    slip.appendChild(list);
    if (job.footer) slip.appendChild(el('div', 'slip-footer', job.footer));
    container.appendChild(slip);

    const items = (job.items || []).slice();
    const rows = items.map((it) => {
      const wrap = el('div');
      const row = el('div', 'slip-row');
      row.appendChild(el('span', 'n', it.name));
      if (it.qty) row.appendChild(el('span', 'q', 'x' + it.qty));
      wrap.appendChild(row);
      if (it.note) wrap.appendChild(el('div', 'slip-note', it.note));
      list.appendChild(wrap);
      return wrap;
    });

    const overflow = () => list.scrollHeight > list.clientHeight + 1 || list.scrollWidth > list.clientWidth + 1;
    const shrink = (from, to) => {
      for (let pt = from; pt >= to; pt -= 0.5) {
        slip.style.fontSize = pt + 'pt';
        if (!overflow()) return pt;
      }
      return to;
    };

    // 1) hạ cỡ chữ 11pt -> 7pt   2) chia 2 cột 8pt -> 6pt   3) vẫn tràn thì cắt bớt + ghi "+N sản phẩm khác"
    let twoCol = false;
    let fontPt = shrink(11, 7);
    if (overflow()) {
      twoCol = true;
      list.classList.add('two-col');
      fontPt = shrink(8, 6);
    }
    let hidden = 0;
    if (overflow()) {
      const more = el('div', 'slip-more');
      list.appendChild(more);
      while (rows.length > 1 && overflow()) {
        list.removeChild(rows.pop());
        hidden += 1;
        more.textContent = `+${hidden} sản phẩm khác`;
      }
    }
    return { shown: rows.length, hidden, fontPt, twoCol };
  }

  const api = { renderSlip, fmtTime };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BillSlip = api;
})(typeof self !== 'undefined' ? self : globalThis);

// Chạy trong trang POS (mọi khung, kể cả cửa sổ/khung in bill).
// Việc 1: bắt mã thu ngân tít (máy quét = bàn phím gõ rất nhanh rồi Enter).
// Việc 2: bắt lúc POS in bill xong (hoặc lúc bấm nút thanh toán) và báo cho service worker.
(() => {
  'use strict';
  if (window.__sakukoBill2) return;
  window.__sakukoBill2 = true;

  const M = self.BillMatch;
  let active = false;
  let cfg = null;
  let index = M.buildIndex([]);

  function send(msg) {
    try {
      return chrome.runtime.sendMessage(msg).catch(() => null);
    } catch (e) {
      return Promise.resolve(null); // extension vừa được tải lại
    }
  }

  async function loadWatch() {
    try {
      const { watch } = await chrome.storage.local.get('watch');
      index = M.buildIndex((watch && watch.items) || []);
    } catch (e) { /* bỏ qua */ }
  }

  async function init() {
    const r = await send({ type: 'hello' });
    active = !!(r && r.active);
    cfg = r && r.cfg;
    if (active) await loadWatch();
  }
  init();

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.cfg) init();
      else if (changes.watch && active) loadWatch();
    });
  } catch (e) { /* bỏ qua */ }

  // ---------- 1. Bắt mã tít ----------
  const FAST_KEY_MS = 80; // máy quét gõ mỗi ký tự cách nhau vài ms; người gõ tay chậm hơn nhiều
  let buf = '';
  let lastKeyAt = 0;

  document.addEventListener('keydown', (e) => {
    if (!active || e.isComposing) return;
    const now = performance.now();
    if (e.key === 'Enter' || e.key === 'Tab') {
      const candidates = [];
      if (buf.length >= 4) candidates.push(buf);
      // Thu ngân gõ tay mã vào ô tìm kiếm rồi Enter cũng tính
      const t = e.target;
      if (t && typeof t.value === 'string' && t.type !== 'password') candidates.push(t.value);
      buf = '';
      for (const c of candidates) {
        const item = M.lookupCode(index, c);
        if (item) { send({ type: 'scan', barcode: item.barcode }); break; }
      }
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      if (now - lastKeyAt > FAST_KEY_MS) buf = '';
      buf += e.key;
      lastKeyAt = now;
    }
  }, true);

  // ---------- 2. Đọc nội dung bill ----------
  function textOf(rootEl) {
    const out = [];
    let len = 0;
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const tag = node.parentNode && node.parentNode.nodeName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') continue;
      out.push(node.nodeValue);
      len += node.nodeValue.length;
      if (len > 300000) break;
    }
    if (rootEl.querySelectorAll) {
      rootEl.querySelectorAll('input:not([type=password]):not([type=hidden]), textarea').forEach((i) => out.push(i.value));
    }
    return out.join(' ');
  }

  // Trả về barcode các sản phẩm trong danh sách có mặt trên bill.
  // Khớp theo TÊN chỉ khi văn bản chắc chắn là bill: khung/cửa sổ in riêng, hoặc vùng giỏ hàng đã khai báo.
  // Trang POS chính thường có cả lưới danh mục hàng nên ở đó chỉ khớp theo MÃ.
  function capture() {
    if (!index.size || !document.documentElement) return [];
    let roots = [];
    if (cfg && cfg.cartSelector) {
      try { roots = [...document.querySelectorAll(cfg.cartSelector)]; } catch (e) { roots = []; }
    }
    const trusted = roots.length > 0 || window !== window.top || !!window.opener;
    if (!roots.length) roots = [document.documentElement];
    return M.matchText(index, roots.map(textOf).join(' '), { names: trusted });
  }

  // ---------- 3. Tín hiệu "bill đã in xong" ----------
  let captured = null;
  window.addEventListener('beforeprint', () => {
    if (!active || cfg.triggerMode === 'click') return;
    captured = capture();
  });
  window.addEventListener('afterprint', () => {
    if (!active || cfg.triggerMode === 'click') return;
    send({ type: 'trigger', source: 'print', textCodes: captured || capture() });
    captured = null;
  });

  document.addEventListener('click', (e) => {
    if (!active || cfg.triggerMode === 'print') return;
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    let hit = false;
    if (cfg.paySelector) {
      try { hit = !!t.closest(cfg.paySelector); } catch (err) { hit = false; }
    }
    if (!hit && cfg.payText) {
      const btn = t.closest('button, a, [role="button"], input[type="button"], input[type="submit"]');
      if (btn) hit = M.norm(btn.textContent || btn.value || '').includes(M.norm(cfg.payText));
    }
    if (!hit) return;
    const textCodes = capture(); // chụp ngay, vì POS thường xoá giỏ sau khi thanh toán
    setTimeout(() => send({ type: 'trigger', source: 'click', textCodes }), cfg.clickDelayMs || 0);
  }, true);
})();

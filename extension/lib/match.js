// So khớp sản phẩm trên bill với danh sách chọn trên web.
// Dùng chung cho content script, service worker và test Node (extension/test).
(function (root) {
  'use strict';

  // Bỏ dấu tiếng Việt, về chữ thường, chỉ giữ chữ + số: "Sữa Rửa Mặt (120g)" -> "sua rua mat 120g"
  function norm(str) {
    return String(str == null ? '' : str)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[đĐ]/g, 'd')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  // items: [{barcode, name, printName, note, codes:[...]}] từ /api/bill/watchlist
  function buildIndex(items) {
    const byCode = new Map();
    const names = [];
    for (const item of items || []) {
      const codes = (item.codes && item.codes.length ? item.codes : [item.barcode]).filter(Boolean);
      for (const code of codes) byCode.set(String(code).trim().toUpperCase(), item);
      for (const raw of [item.name, item.printName]) {
        const n = norm(raw);
        // Tên quá ngắn dễ khớp bừa ("kem", "sua") nên bỏ qua
        if (n.length >= 6) names.push({ n: ' ' + n + ' ', item });
      }
    }
    return { byCode, names, size: (items || []).length };
  }

  // Tra 1 mã vừa tít. Trả về item hoặc null.
  function lookupCode(index, raw) {
    const code = String(raw == null ? '' : raw).trim().toUpperCase();
    if (code.length < 4) return null;
    return index.byCode.get(code) || null;
  }

  // Tìm các sản phẩm trong danh sách có mặt trong 1 đoạn văn bản (nội dung bill / vùng giỏ hàng).
  // opts.names = true: khớp cả theo TÊN (chỉ bật khi văn bản chắc chắn là bill, không lẫn danh mục hàng).
  // Trả về mảng barcode (không trùng).
  function matchText(index, text, opts) {
    const found = new Set();
    if (!index || !index.size || !text) return [];
    const tokens = String(text).toUpperCase().match(/[A-Z0-9]{4,}/g) || [];
    for (const t of tokens) {
      const item = index.byCode.get(t);
      if (item) found.add(item.barcode);
    }
    if (opts && opts.names) {
      const hay = ' ' + norm(text) + ' ';
      for (const { n, item } of index.names) {
        if (!found.has(item.barcode) && hay.includes(n)) found.add(item.barcode);
      }
    }
    return [...found];
  }

  // Trang hiện tại có phải trang POS đã khai báo không.
  // patterns: mỗi dòng 1 địa chỉ, ví dụ "pos.cuahang.vn" hoặc "https://abc.vn/ban-hang*"
  function urlMatches(url, patterns) {
    const u = String(url || '').toLowerCase().replace(/^blob:/, '').replace(/^https?:\/\//, '');
    if (!u) return false;
    return String(patterns || '')
      .split(/[\n,]+/)
      .map((p) => p.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, ''))
      .filter(Boolean)
      .some((p) => {
        const parts = p.split('*').map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&'));
        return new RegExp('^' + parts.join('.*')).test(u);
      });
  }

  const api = { norm, buildIndex, lookupCode, matchText, urlMatches };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BillMatch = api;
})(typeof self !== 'undefined' ? self : globalThis);

// Quyết định in gì khi bill POS vừa in xong. Hàm thuần (không đụng chrome.*) để test được bằng Node.
(function (root) {
  'use strict';

  // input:
  //   cfg        : cấu hình extension
  //   watch      : { items:[{barcode,name,printName,note}], settings:{title,footer} }
  //   scans      : { [barcode]: { count, ts } }   các mã thu ngân đã tít từ lần in trước
  //   textCodes  : [barcode]                      sản phẩm tìm thấy trong nội dung bill
  //   lastPrintAt: thời điểm in phiếu gần nhất (ms)
  //   now        : ms
  // output: { job | null, reason }
  function decide({ cfg, watch, scans, textCodes, lastPrintAt, now, source }) {
    if (!cfg.enabled) return { job: null, reason: 'disabled' };
    if (lastPrintAt && now - lastPrintAt < cfg.cooldownSec * 1000) return { job: null, reason: 'cooldown' };

    const ttl = cfg.scanTtlMin * 60 * 1000;
    const picked = new Set();
    if (cfg.matchMode !== 'text') {
      for (const [barcode, s] of Object.entries(scans || {})) {
        if (now - s.ts <= ttl) picked.add(barcode);
      }
    }
    if (cfg.matchMode !== 'scan') {
      for (const barcode of textCodes || []) picked.add(barcode);
    }

    // Chỉ in sản phẩm còn nằm trong danh sách đang bật trên web, theo thứ tự danh sách
    const items = [];
    for (const item of (watch && watch.items) || []) {
      if (!picked.has(item.barcode)) continue;
      const scan = (scans || {})[item.barcode];
      items.push({
        barcode: item.barcode,
        name: item.printName || item.name,
        note: item.note || '',
        qty: cfg.showQty && scan ? scan.count : 0,
      });
    }
    if (!items.length) return { job: null, reason: 'no-match' };

    const settings = (watch && watch.settings) || {};
    return {
      reason: 'print',
      job: {
        id: String(now) + '-' + Math.random().toString(36).slice(2, 8),
        time: now,
        store: cfg.store || '',
        title: settings.title || 'PHIẾU SẢN PHẨM',
        footer: settings.footer || '',
        source: source || '',
        items,
      },
    };
  }

  const api = { decide };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BillDecide = api;
})(typeof self !== 'undefined' ? self : globalThis);

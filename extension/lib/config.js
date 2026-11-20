// Cấu hình mặc định của extension (lưu ở chrome.storage.local, khoá "cfg").
(function (root) {
  'use strict';

  const DEFAULT_CFG = {
    enabled: true,
    serverUrl: '',        // địa chỉ web Xưởng tem, vd http://192.168.1.100:4200
    extKey: '',           // khoá BILL_EXT_KEY nếu server có đặt
    posUrls: '',          // địa chỉ trang POS, mỗi dòng 1 địa chỉ
    store: '',            // tên cửa hàng in trên phiếu
    matchMode: 'both',    // scan = chỉ theo mã tít | text = chỉ theo nội dung bill | both = cả hai
    triggerMode: 'print', // print = khi POS in bill xong | click = khi bấm nút thanh toán | both
    paySelector: '',      // CSS selector nút thanh toán / in bill (cho triggerMode click)
    payText: '',          // hoặc chữ trên nút, vd "Thanh toán"
    cartSelector: '',     // CSS selector vùng giỏ hàng (không bắt buộc)
    showQty: false,       // in số lượng = số lần tít
    cooldownSec: 5,       // POS in 2 liên thì chỉ in 1 phiếu
    scanTtlMin: 20,       // mã tít quá lâu chưa in bill thì bỏ
    clickDelayMs: 1500,   // chờ bill POS in trước rồi mới in phiếu (triggerMode click)
  };

  async function loadCfg() {
    const { cfg } = await chrome.storage.local.get('cfg');
    return { ...DEFAULT_CFG, ...(cfg || {}) };
  }

  const api = { DEFAULT_CFG, loadCfg };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BillConfig = api;
})(typeof self !== 'undefined' ? self : globalThis);

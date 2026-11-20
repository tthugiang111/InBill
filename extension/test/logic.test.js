// Chạy: node --test extension/test/
const test = require('node:test');
const assert = require('node:assert');
const M = require('../lib/match.js');
const { decide } = require('../lib/decide.js');
const { DEFAULT_CFG } = require('../lib/config.js');

const items = [
  { barcode: '4901301234567', name: 'Sữa rửa mặt Bioré 130g', printName: 'SRM Bioré', note: 'Tặng 1 mẫu thử', codes: ['4901301234567', 'OLD999888', 'SKK00123'] },
  { barcode: '4902430111222', name: 'Kem chống nắng Anessa 60ml', printName: '', note: '', codes: ['4902430111222'] },
  { barcode: '8930000000017', name: 'Trà', printName: '', note: '', codes: ['8930000000017'] },
];
const watch = { items, settings: { title: 'PHIẾU QUÀ TẶNG', footer: 'Cảm ơn' } };
const index = M.buildIndex(items);
const cfg = { ...DEFAULT_CFG, store: 'Sakuko Test' };
const now = 1_800_000_000_000;

test('norm bỏ dấu tiếng Việt', () => {
  assert.strictEqual(M.norm('Sữa Rửa Mặt (Bioré) – Đỏ'), 'sua rua mat biore do');
});

test('lookupCode: mã vạch, mã cũ, mã hàng; không khớp mã lạ', () => {
  assert.strictEqual(M.lookupCode(index, ' 4901301234567 ').barcode, '4901301234567');
  assert.strictEqual(M.lookupCode(index, 'old999888').barcode, '4901301234567');
  assert.strictEqual(M.lookupCode(index, 'SKK00123').barcode, '4901301234567');
  assert.strictEqual(M.lookupCode(index, '1234567890123'), null);
  assert.strictEqual(M.lookupCode(index, ''), null);
});

test('matchText: theo mã ở mọi nơi, theo tên chỉ khi names=true', () => {
  const receipt = 'HOA DON\nSUA RUA MAT BIORE 130G   1  89.000\nKem chống nắng Anessa 60ml x2\nTổng 500.000';
  assert.deepStrictEqual(M.matchText(index, receipt, { names: false }), []);
  assert.deepStrictEqual(M.matchText(index, receipt, { names: true }).sort(), ['4901301234567', '4902430111222']);
  assert.deepStrictEqual(M.matchText(index, 'ma: 4902430111222; 49024301112229', { names: false }), ['4902430111222']);
});

test('matchText: tên quá ngắn không được khớp bừa', () => {
  assert.deepStrictEqual(M.matchText(index, 'Trà sữa trân châu, trà đào', { names: true }), []);
});

test('urlMatches', () => {
  assert.ok(M.urlMatches('https://pos.cuahang.vn/ban-hang?x=1', 'pos.cuahang.vn'));
  assert.ok(M.urlMatches('http://localhost:4200/bill-pos-demo.html', 'abc.vn\nhttp://localhost:4200/bill-pos-demo.html'));
  assert.ok(M.urlMatches('https://a.vn/app/pos/1', 'a.vn/*/pos'));
  assert.ok(!M.urlMatches('https://facebook.com/pos.cuahang.vn', 'pos.cuahang.vn'));
  assert.ok(!M.urlMatches('https://pos.cuahang.vn', ''));
  assert.ok(!M.urlMatches('about:blank', 'pos.cuahang.vn'));
  assert.ok(M.urlMatches('blob:https://pos.cuahang.vn/1b2c-3d', 'pos.cuahang.vn'));
});

test('decide: gộp mã tít + nội dung bill, theo thứ tự danh sách', () => {
  const out = decide({
    cfg, watch, now, lastPrintAt: 0, source: 'print',
    scans: { '4902430111222': { count: 2, ts: now - 1000 } },
    textCodes: ['4901301234567'],
  });
  assert.strictEqual(out.reason, 'print');
  assert.deepStrictEqual(out.job.items.map((i) => i.name), ['SRM Bioré', 'Kem chống nắng Anessa 60ml']);
  assert.strictEqual(out.job.items[0].note, 'Tặng 1 mẫu thử');
  assert.strictEqual(out.job.title, 'PHIẾU QUÀ TẶNG');
  assert.strictEqual(out.job.store, 'Sakuko Test');
  assert.strictEqual(out.job.items[1].qty, 0); // showQty tắt
});

test('decide: không có sản phẩm trùng thì không in', () => {
  assert.strictEqual(decide({ cfg, watch, now, lastPrintAt: 0, scans: {}, textCodes: [] }).job, null);
  assert.strictEqual(decide({ cfg, watch, now, lastPrintAt: 0, scans: {}, textCodes: ['0000000000000'] }).job, null);
});

test('decide: liên 2 của cùng bill (trong thời gian chờ) không in lại', () => {
  const out = decide({ cfg, watch, now, lastPrintAt: now - 2000, scans: {}, textCodes: ['4901301234567'] });
  assert.strictEqual(out.reason, 'cooldown');
});

test('decide: mã tít quá cũ bị bỏ; chế độ scan/text chỉ dùng 1 nguồn', () => {
  const old = { '4901301234567': { count: 1, ts: now - 21 * 60 * 1000 } };
  assert.strictEqual(decide({ cfg, watch, now, lastPrintAt: 0, scans: old, textCodes: [] }).job, null);

  const scans = { '4901301234567': { count: 3, ts: now } };
  const textCodes = ['4902430111222'];
  const onlyScan = decide({ cfg: { ...cfg, matchMode: 'scan', showQty: true }, watch, now, lastPrintAt: 0, scans, textCodes });
  assert.deepStrictEqual(onlyScan.job.items.map((i) => [i.barcode, i.qty]), [['4901301234567', 3]]);
  const onlyText = decide({ cfg: { ...cfg, matchMode: 'text' }, watch, now, lastPrintAt: 0, scans, textCodes });
  assert.deepStrictEqual(onlyText.job.items.map((i) => i.barcode), ['4902430111222']);
});

test('decide: extension tắt thì không in', () => {
  const out = decide({ cfg: { ...cfg, enabled: false }, watch, now, lastPrintAt: 0, scans: {}, textCodes: ['4901301234567'] });
  assert.strictEqual(out.job, null);
});

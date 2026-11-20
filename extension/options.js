const TEXT = ['serverUrl', 'extKey', 'posUrls', 'store', 'triggerMode', 'payText', 'paySelector', 'matchMode', 'cartSelector'];
const NUM = ['clickDelayMs', 'cooldownSec', 'scanTtlMin'];
const BOOL = ['showQty', 'enabled'];
const $ = (id) => document.getElementById(id);

function say(text, isErr) {
  $('msg').textContent = text;
  $('msg').className = isErr ? 'err' : '';
}

async function load() {
  const cfg = await BillConfig.loadCfg();
  TEXT.forEach((k) => { $(k).value = cfg[k]; });
  NUM.forEach((k) => { $(k).value = cfg[k]; });
  BOOL.forEach((k) => { $(k).checked = !!cfg[k]; });
}

async function save() {
  const cfg = { ...BillConfig.DEFAULT_CFG };
  TEXT.forEach((k) => { cfg[k] = $(k).value.trim(); });
  NUM.forEach((k) => {
    const n = Number($(k).value);
    cfg[k] = Number.isFinite(n) && n >= 0 ? n : BillConfig.DEFAULT_CFG[k];
  });
  BOOL.forEach((k) => { cfg[k] = $(k).checked; });
  cfg.serverUrl = cfg.serverUrl.replace(/\/+$/, '');
  if (cfg.serverUrl && !/^https?:\/\//i.test(cfg.serverUrl)) cfg.serverUrl = 'http://' + cfg.serverUrl;
  await chrome.storage.local.set({ cfg });
  $('serverUrl').value = cfg.serverUrl;
  return cfg;
}

$('save').addEventListener('click', async () => {
  const cfg = await save();
  if (!cfg.serverUrl || !cfg.posUrls) return say('Đã lưu. Còn thiếu địa chỉ web hoặc địa chỉ POS.', true);
  const r = await chrome.runtime.sendMessage({ type: 'syncNow' });
  say(r && r.ok ? `Đã lưu. Danh sách có ${r.count} sản phẩm.` : 'Đã lưu, nhưng chưa tải được danh sách: ' + (r && r.error), !(r && r.ok));
});

$('sync').addEventListener('click', async () => {
  await save();
  const r = await chrome.runtime.sendMessage({ type: 'syncNow' });
  say(r && r.ok ? `Đã đồng bộ: ${r.count} sản phẩm.` : 'Lỗi đồng bộ: ' + (r && r.error), !(r && r.ok));
});

$('test').addEventListener('click', async () => {
  await save();
  await chrome.runtime.sendMessage({ type: 'testPrint' });
  say('Đã gửi lệnh in thử.');
});

load();

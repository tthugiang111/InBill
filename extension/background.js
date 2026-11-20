// Service worker: giữ danh sách sản phẩm (đồng bộ từ web), gom mã thu ngân tít,
// và khi bill POS in xong thì mở trang in phiếu 80×45mm.
importScripts('lib/match.js', 'lib/config.js', 'lib/decide.js');

const { loadCfg } = BillConfig;
const SYNC_MINUTES = 5;
const TRIGGER_WINDOW_MS = 400; // gom các tín hiệu "in xong" từ nhiều khung của cùng 1 lần in

// ---------- Trạng thái (chrome.storage.session — mất khi tắt trình duyệt) ----------
// Xếp hàng mọi thao tác đọc-sửa-ghi để 2 lần tít sát nhau không ghi đè nhau.
let queue = Promise.resolve();
function withState(fn) {
  const run = queue.then(async () => {
    const { st } = await chrome.storage.session.get('st');
    const state = st || { scans: {}, lastPrintAt: 0 };
    const result = await fn(state);
    await chrome.storage.session.set({ st: state });
    return result;
  });
  queue = run.catch(() => {});
  return run;
}

async function updateBadge(state) {
  const n = Object.keys(state.scans || {}).length;
  await chrome.action.setBadgeBackgroundColor({ color: '#be185d' });
  await chrome.action.setBadgeText({ text: n ? String(n) : '' });
}

// ---------- Đồng bộ danh sách từ web ----------
async function syncWatchlist() {
  const cfg = await loadCfg();
  if (!cfg.serverUrl) {
    await chrome.storage.local.set({ syncError: 'Chưa nhập địa chỉ web Xưởng tem' });
    return { ok: false, error: 'Chưa nhập địa chỉ web Xưởng tem' };
  }
  try {
    const res = await fetch(cfg.serverUrl.replace(/\/+$/, '') + '/api/bill/watchlist', {
      headers: cfg.extKey ? { 'X-Bill-Key': cfg.extKey } : {},
      cache: 'no-store',
    });
    if (!res.ok) throw new Error('Máy chủ trả về lỗi ' + res.status);
    const data = await res.json();
    if (!Array.isArray(data.items)) throw new Error('Dữ liệu không đúng định dạng');
    await chrome.storage.local.set({
      watch: { items: data.items, settings: data.settings || {}, syncedAt: Date.now() },
      syncError: '',
    });
    return { ok: true, count: data.items.length };
  } catch (err) {
    // Lỗi mạng: vẫn dùng danh sách đã lưu lần trước
    await chrome.storage.local.set({ syncError: String(err.message || err) });
    return { ok: false, error: String(err.message || err) };
  }
}

function ensureAlarm() {
  chrome.alarms.get('sync', (a) => {
    if (!a) chrome.alarms.create('sync', { periodInMinutes: SYNC_MINUTES });
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  ensureAlarm();
  const cfg = await loadCfg();
  if (!cfg.serverUrl || !cfg.posUrls) chrome.runtime.openOptionsPage();
  else syncWatchlist();
});
chrome.runtime.onStartup.addListener(() => { ensureAlarm(); syncWatchlist(); });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'sync') syncWatchlist(); });

// ---------- Trang gửi tin có phải POS không ----------
async function isPosSender(cfg, sender) {
  const tabUrl = (sender.tab && sender.tab.url) || '';
  if ([tabUrl, sender.url, sender.origin].some((u) => BillMatch.urlMatches(u, cfg.posUrls))) return true;
  // Bill mở ở cửa sổ con trống (about:blank) thì xét theo tab POS đã mở ra nó.
  // Tab có địa chỉ web riêng (bấm link từ POS sang trang khác) thì KHÔNG tính.
  if (!/^https?:/i.test(tabUrl) && sender.tab && sender.tab.openerTabId != null) {
    try {
      return BillMatch.urlMatches((await chrome.tabs.get(sender.tab.openerTabId)).url, cfg.posUrls);
    } catch (e) { /* tab mẹ đã đóng */ }
  }
  return false;
}

// ---------- In phiếu ----------
async function openPrint(job, posWindowId) {
  await chrome.storage.session.set({ ['job_' + job.id]: { job, posWindowId: posWindowId ?? null } });
  await chrome.storage.local.set({ lastJob: job });
  await chrome.windows.create({
    url: chrome.runtime.getURL('print.html?job=' + encodeURIComponent(job.id)),
    type: 'popup',
    width: 420,
    height: 320,
    focused: false,
  });
}

async function sendLog(job) {
  const cfg = await loadCfg();
  if (!cfg.serverUrl) return;
  try {
    await fetch(cfg.serverUrl.replace(/\/+$/, '') + '/api/bill/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cfg.extKey ? { 'X-Bill-Key': cfg.extKey } : {}) },
      body: JSON.stringify({
        store: job.store,
        source: job.source,
        items: job.items.map((i) => ({ barcode: i.barcode, name: i.name, qty: i.qty })),
      }),
    });
  } catch (e) { /* mất mạng thì bỏ qua log, không ảnh hưởng việc in */ }
}

// Gom tín hiệu "bill POS in xong" rồi quyết định 1 lần
let pending = null;
function onTrigger(msg, sender) {
  if (!pending) {
    pending = { textCodes: new Set(), source: msg.source, windowId: sender.tab && sender.tab.windowId };
    setTimeout(finalizeTrigger, TRIGGER_WINDOW_MS);
  }
  for (const c of msg.textCodes || []) pending.textCodes.add(c);
}

async function finalizeTrigger() {
  const p = pending;
  pending = null;
  if (!p) return;
  const cfg = await loadCfg();
  const { watch } = await chrome.storage.local.get('watch');
  const job = await withState(async (state) => {
    const now = Date.now();
    const out = BillDecide.decide({
      cfg, watch, scans: state.scans, textCodes: [...p.textCodes], lastPrintAt: state.lastPrintAt, now, source: p.source,
    });
    if (out.reason === 'cooldown') return null; // liên 2 của cùng bill
    state.scans = {};                            // bill đã xong: bắt đầu bill mới
    if (out.job) state.lastPrintAt = now;
    await updateBadge(state);
    return out.job;
  });
  if (job) {
    await openPrint(job, p.windowId);
    sendLog(job);
  }
}

function sampleJob(cfg, watch) {
  const items = ((watch && watch.items) || []).slice(0, 4).map((i) => ({
    barcode: i.barcode, name: i.printName || i.name, note: i.note || '', qty: cfg.showQty ? 1 : 0,
  }));
  const settings = (watch && watch.settings) || {};
  return {
    id: 'test-' + Date.now(),
    time: Date.now(),
    store: cfg.store || '',
    title: settings.title || 'PHIẾU SẢN PHẨM',
    footer: settings.footer || '',
    source: 'test',
    items: items.length ? items : [{ name: 'Sản phẩm mẫu 1', note: 'Ghi chú mẫu', qty: 0 }, { name: 'Sản phẩm mẫu 2', note: '', qty: 0 }],
  };
}

// ---------- Nhận tin ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    const cfg = await loadCfg();
    switch (msg && msg.type) {
      case 'hello': // content script hỏi: trang này có phải POS không
        return { active: cfg.enabled && (await isPosSender(cfg, sender)), cfg };

      case 'scan': { // thu ngân vừa tít 1 sản phẩm có trong danh sách
        if (!cfg.enabled || !(await isPosSender(cfg, sender))) return { ok: false };
        await withState(async (state) => {
          const cur = state.scans[msg.barcode] || { count: 0, ts: 0 };
          state.scans[msg.barcode] = { count: cur.count + 1, ts: Date.now() };
          await updateBadge(state);
        });
        return { ok: true };
      }

      case 'trigger': // bill POS vừa in xong / vừa bấm thanh toán
        if (!cfg.enabled || !(await isPosSender(cfg, sender))) return { ok: false };
        onTrigger(msg, sender);
        return { ok: true };

      case 'printDone': { // trang in báo xong: đóng cửa sổ in, trả con trỏ về POS
        const key = 'job_' + msg.id;
        const stored = (await chrome.storage.session.get(key))[key];
        await chrome.storage.session.remove(key);
        if (sender.tab) { try { await chrome.windows.remove(sender.tab.windowId); } catch (e) { /* đã đóng */ } }
        if (stored && stored.posWindowId != null) {
          try { await chrome.windows.update(stored.posWindowId, { focused: true }); } catch (e) { /* POS đã đóng */ }
        }
        return { ok: true };
      }

      case 'syncNow':
        return syncWatchlist();

      case 'testPrint': {
        const { watch } = await chrome.storage.local.get('watch');
        await openPrint(sampleJob(cfg, watch), null);
        return { ok: true };
      }

      case 'reprint': {
        const { lastJob } = await chrome.storage.local.get('lastJob');
        if (!lastJob) return { ok: false, error: 'Chưa có phiếu nào' };
        await openPrint({ ...lastJob, id: 're-' + Date.now() }, null);
        return { ok: true };
      }

      case 'clearScans':
        await withState(async (state) => { state.scans = {}; await updateBadge(state); });
        return { ok: true };

      case 'status': {
        const { watch, syncError, lastJob } = await chrome.storage.local.get(['watch', 'syncError', 'lastJob']);
        const { st } = await chrome.storage.session.get('st');
        return { cfg, watch, syncError, lastJob, scans: (st && st.scans) || {} };
      }

      default:
        return { ok: false, error: 'unknown message' };
    }
  })().then(sendResponse, (err) => sendResponse({ ok: false, error: String(err && err.message || err) }));
  return true; // trả lời bất đồng bộ
});

// Đổi cấu hình thì đồng bộ lại danh sách ngay
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.cfg) {
    const a = changes.cfg.oldValue || {};
    const b = changes.cfg.newValue || {};
    if (a.serverUrl !== b.serverUrl || a.extKey !== b.extKey) syncWatchlist();
  }
});

const $ = (id) => document.getElementById(id);
const ask = (type) => chrome.runtime.sendMessage({ type });

function setText(id, text, cls) {
  $(id).textContent = text;
  $(id).className = cls || '';
}

async function refresh() {
  const s = await ask('status');
  if (!s || !s.cfg) return;
  const items = (s.watch && s.watch.items) || [];
  if (!s.cfg.enabled) setText('state', 'Đang tắt', 'err');
  else if (!s.cfg.serverUrl || !s.cfg.posUrls) setText('state', 'Chưa cài đặt', 'err');
  else if (s.syncError) setText('state', 'Lỗi đồng bộ', 'err');
  else setText('state', 'Đang chạy', 'ok');
  setText('count', items.length + ' sản phẩm');
  setText('synced', s.watch && s.watch.syncedAt ? new Date(s.watch.syncedAt).toLocaleTimeString('vi-VN') : '—');
  if (s.syncError) setText('msg', s.syncError, 'err');

  const byCode = new Map(items.map((i) => [i.barcode, i]));
  const codes = Object.keys(s.scans || {});
  setText('pendingCount', codes.length ? `(${codes.length} sản phẩm sẽ in)` : '(chưa có sản phẩm nào trong danh sách)');
  const ul = $('pending');
  ul.textContent = '';
  for (const c of codes) {
    const li = document.createElement('li');
    const item = byCode.get(c);
    li.textContent = `${item ? item.printName || item.name : c} ×${s.scans[c].count}`;
    ul.appendChild(li);
  }
}

$('reprint').addEventListener('click', async () => {
  const r = await ask('reprint');
  setText('msg', r && r.ok ? 'Đã gửi lệnh in lại.' : (r && r.error) || 'Lỗi', r && r.ok ? 'ok' : 'err');
});
$('clear').addEventListener('click', async () => { await ask('clearScans'); refresh(); });
$('sync').addEventListener('click', async () => {
  const r = await ask('syncNow');
  setText('msg', r && r.ok ? `Đã đồng bộ ${r.count} sản phẩm.` : 'Lỗi: ' + (r && r.error), r && r.ok ? 'ok' : 'err');
  refresh();
});
$('options').addEventListener('click', () => chrome.runtime.openOptionsPage());

refresh();

// Trang in phiếu 80×45mm. Service worker mở trang này kèm ?job=<id>.
// Chrome chạy với cờ --kiosk-printing sẽ in thẳng ra máy in mặc định, không hiện hộp thoại.
(async () => {
  const id = new URLSearchParams(location.search).get('job');
  const key = 'job_' + id;
  const stored = (await chrome.storage.session.get(key))[key];
  const done = () => chrome.runtime.sendMessage({ type: 'printDone', id }).catch(() => window.close());
  if (!stored) return done();

  BillSlip.renderSlip(document.getElementById('slip'), stored.job);

  window.addEventListener('afterprint', done);
  setTimeout(done, 120000); // phòng khi hộp thoại in bị bỏ quên
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  requestAnimationFrame(() => setTimeout(() => window.print(), 50));
})();

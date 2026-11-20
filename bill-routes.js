// ==========================================================================
// MODULE "IN BILL THỨ 2" — danh sách sản phẩm cần in phiếu 80×45mm sau bill POS
// --------------------------------------------------------------------------
// Web (trang /bill.html) : admin chọn những sản phẩm nào sẽ được in phiếu thứ 2.
// Extension (thư mục /extension) : chạy trên máy thu ngân, tải danh sách này về,
//   so khớp với sản phẩm thu ngân vừa tít, rồi tự in phiếu 80×45mm.
//
// Gắn vào server.js bằng 1 dòng:  require('./bill-routes')(app, pool, {...})
// ==========================================================================
const path = require('path');
const express = require('express');

const DEFAULT_SETTINGS = {
  title: 'PHIẾU SẢN PHẨM',
  footer: 'Cảm ơn quý khách!',
};

const s = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

module.exports = function registerBillRoutes(app, pool, { getCookie, verifySessionToken }) {
  // ---------- Khởi tạo bảng ----------
  const ready = pool.query(`
    CREATE TABLE IF NOT EXISTS bill_items (
        id SERIAL PRIMARY KEY,
        barcode VARCHAR(30) NOT NULL UNIQUE,
        item_no VARCHAR(20),
        name VARCHAR(200) NOT NULL,
        print_name VARCHAR(60),
        note VARCHAR(80),
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS bill_settings (
        key VARCHAR(64) PRIMARY KEY,
        value TEXT
    );
    CREATE TABLE IF NOT EXISTS bill_print_logs (
        id SERIAL PRIMARY KEY,
        store_name VARCHAR(255),
        item_count INT,
        items JSONB,
        trigger_source VARCHAR(32),
        created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_bill_print_logs_created_at ON bill_print_logs(created_at DESC);
  `).catch((err) => console.error('Lỗi khởi tạo bảng bill:', err));

  // ---------- Phân quyền ----------
  // Admin = cùng quy tắc với /api/auth/me. BILL_ADMIN_BYPASS=1 chỉ dùng khi chạy thử trên máy dev.
  async function requireAdmin(req, res, next) {
    if (process.env.BILL_ADMIN_BYPASS === '1') {
      req.billUser = { name: 'dev' };
      return next();
    }
    const session = verifySessionToken(getCookie(req, 'sakuko_session'));
    if (!session) return res.status(401).json({ error: 'Chưa đăng nhập' });
    try {
      const r = await pool.query('SELECT open_id, name, email, role FROM users WHERE id = $1', [session.id]);
      const u = r.rows[0];
      const isHieu = u && ((u.email && u.email.toLowerCase() === 'hieuhv2@sakukovietnam.com.vn') ||
        u.open_id === 'ou_07ff157813f7a579760d5e076f2e0860' ||
        (u.name && u.name.trim() === 'Hoàng Văn Hiếu'));
      if (!u || !(isHieu || u.role === 'admin')) {
        return res.status(403).json({ error: 'Chỉ Admin mới được sửa danh sách in bill' });
      }
      req.billUser = u;
      next();
    } catch (err) {
      console.error('Lỗi kiểm tra quyền bill:', err);
      res.status(500).json({ error: 'DB error' });
    }
  }

  // Extension gọi không có cookie. Nếu đặt BILL_EXT_KEY trong .env thì extension phải gửi đúng khoá.
  function requireExtKey(req, res, next) {
    const key = process.env.BILL_EXT_KEY;
    if (key && req.get('X-Bill-Key') !== key) {
      return res.status(401).json({ error: 'Sai khoá extension (X-Bill-Key)' });
    }
    next();
  }

  async function loadSettings() {
    const r = await pool.query('SELECT key, value FROM bill_settings');
    const out = { ...DEFAULT_SETTINGS };
    for (const row of r.rows) if (row.key in out) out[row.key] = row.value;
    return out;
  }

  // Dùng chung file vẽ phiếu (slip.js / slip.css) giữa extension và trang xem trước trên web
  app.use('/bill-ext', express.static(path.join(__dirname, 'extension')));

  // ---------- API cho EXTENSION ----------
  // Danh sách đang bật + cấu hình phiếu. `codes` = mọi mã có thể xuất hiện khi tít (mã vạch, mã cũ, mã hàng).
  app.get('/api/bill/watchlist', requireExtKey, async (req, res) => {
    try {
      await ready;
      const [items, settings] = await Promise.all([
        pool.query(`
          SELECT b.barcode, b.item_no, b.name, b.print_name, b.note, i.old_barcode
          FROM bill_items b
          LEFT JOIN items i ON i.barcode = b.barcode
          WHERE b.active
          ORDER BY b.id`),
        loadSettings(),
      ]);
      res.json({
        updatedAt: new Date().toISOString(),
        settings,
        items: items.rows.map((r) => ({
          barcode: r.barcode,
          name: r.name,
          printName: r.print_name || '',
          note: r.note || '',
          codes: [...new Set([r.barcode, r.old_barcode, r.item_no].map((c) => s(c, 30)).filter(Boolean))],
        })),
      });
    } catch (err) {
      console.error('Lỗi /api/bill/watchlist:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // Extension báo về mỗi lần in phiếu (để admin xem thống kê)
  app.post('/api/bill/log', requireExtKey, async (req, res) => {
    const { store, items, source } = req.body || {};
    const list = Array.isArray(items) ? items.slice(0, 100) : [];
    try {
      await ready;
      await pool.query(
        'INSERT INTO bill_print_logs (store_name, item_count, items, trigger_source) VALUES ($1, $2, $3, $4)',
        [s(store, 255), list.length, JSON.stringify(list), s(source, 32)]
      );
      res.json({ success: true });
    } catch (err) {
      console.error('Lỗi /api/bill/log:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // ---------- API cho TRANG QUẢN TRỊ ----------
  app.get('/api/bill/items', requireAdmin, async (req, res) => {
    try {
      await ready;
      const r = await pool.query('SELECT * FROM bill_items ORDER BY id DESC');
      res.json(r.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // Thêm sản phẩm. Nhận 1 trong 2 dạng:
  //   { barcode, item_no?, name?, print_name?, note? }          — thêm 1 sản phẩm
  //   { barcodes: "mã 1\nmã 2\n..." }                            — dán nhiều mã vạch / mã hàng
  // Thiếu tên thì tự tra trong bảng items theo mã vạch hoặc mã hàng.
  app.post('/api/bill/items', requireAdmin, async (req, res) => {
    const body = req.body || {};
    const wanted = [];
    if (typeof body.barcodes === 'string') {
      for (const code of body.barcodes.split(/[\s,;]+/)) if (code.trim()) wanted.push({ barcode: code.trim() });
    } else if (body.barcode) {
      wanted.push(body);
    }
    if (!wanted.length) return res.status(400).json({ error: 'Thiếu mã vạch' });
    if (wanted.length > 500) return res.status(400).json({ error: 'Tối đa 500 mã mỗi lần' });

    const added = [];
    const notFound = [];
    try {
      await ready;
      for (const w of wanted) {
        let barcode = s(w.barcode, 30);
        let itemNo = s(w.item_no, 20);
        let name = s(w.name, 200);
        if (!name) {
          const found = await pool.query(
            'SELECT item_no, item_name, barcode FROM items WHERE barcode = $1 OR old_barcode = $1 OR item_no = $1 LIMIT 1',
            [barcode]
          );
          if (!found.rows.length) { notFound.push(barcode); continue; }
          name = s(found.rows[0].item_name, 200);
          itemNo = s(found.rows[0].item_no, 20);
          barcode = s(found.rows[0].barcode, 30) || barcode;
        }
        const r = await pool.query(
          `INSERT INTO bill_items (barcode, item_no, name, print_name, note, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (barcode) DO UPDATE
             SET active = TRUE, name = EXCLUDED.name, item_no = EXCLUDED.item_no, updated_at = NOW()
           RETURNING *`,
          [barcode, itemNo || null, name, s(w.print_name, 60) || null, s(w.note, 80) || null, req.billUser.name || null]
        );
        added.push(r.rows[0]);
      }
      res.json({ success: true, added, notFound });
    } catch (err) {
      console.error('Lỗi thêm bill item:', err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.patch('/api/bill/items/:id', requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id không hợp lệ' });
    const body = req.body || {};
    const sets = [];
    const params = [];
    if (typeof body.active === 'boolean') { params.push(body.active); sets.push(`active = $${params.length}`); }
    if ('print_name' in body) { params.push(s(body.print_name, 60) || null); sets.push(`print_name = $${params.length}`); }
    if ('note' in body) { params.push(s(body.note, 80) || null); sets.push(`note = $${params.length}`); }
    if (!sets.length) return res.status(400).json({ error: 'Không có gì để sửa' });
    params.push(id);
    try {
      const r = await pool.query(
        `UPDATE bill_items SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`,
        params
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Không tìm thấy' });
      res.json(r.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.delete('/api/bill/items/:id', requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id không hợp lệ' });
    try {
      await pool.query('DELETE FROM bill_items WHERE id = $1', [id]);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.get('/api/bill/settings', requireAdmin, async (req, res) => {
    try {
      await ready;
      res.json(await loadSettings());
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.put('/api/bill/settings', requireAdmin, async (req, res) => {
    const body = req.body || {};
    try {
      await ready;
      for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (!(key in body)) continue;
        await pool.query(
          `INSERT INTO bill_settings (key, value) VALUES ($1, $2)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
          [key, s(body[key], 60)]
        );
      }
      res.json(await loadSettings());
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.get('/api/bill/logs', requireAdmin, async (req, res) => {
    try {
      await ready;
      const r = await pool.query(
        'SELECT id, store_name, item_count, items, trigger_source, created_at FROM bill_print_logs ORDER BY created_at DESC LIMIT 100'
      );
      res.json(r.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Database error' });
    }
  });
};

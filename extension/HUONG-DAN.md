# In bill thứ 2 (phiếu 80×45mm) — Hướng dẫn

## 1. Nó làm gì

```
Thu ngân tít sản phẩm trên POS web ──► extension ghi nhận những mã có trong "danh sách in bill" trên web Xưởng tem
Thu ngân thanh toán, POS in bill   ──► extension chờ bill in xong
                                   ──► tự in thêm 1 phiếu 80×45mm liệt kê các sản phẩm trùng danh sách
Bill không có sản phẩm nào trùng   ──► không in gì thêm
```

Gồm 2 phần:

| Phần | Ở đâu | Ai dùng |
|---|---|---|
| Trang quản lý danh sách | `http://<máy chủ>:4200/bill.html` (nút 🧾 In bill trên Xưởng tem, chỉ Admin) | Admin chọn sản phẩm, đặt tên in, ghi chú, tiêu đề phiếu |
| Extension Chrome/Edge | thư mục `extension/` này | Cài trên từng máy thu ngân |

## 2. Phía máy chủ (làm 1 lần)

1. Cập nhật code, chạy `npm install`, khởi động lại `node server.js`. Ba bảng `bill_items`, `bill_settings`, `bill_print_logs` tự tạo.
2. Đăng nhập tài khoản Admin, mở `/bill.html`, thêm sản phẩm (tìm theo tên/mã vạch, hoặc dán nhiều mã).
3. Không bắt buộc: đặt `BILL_EXT_KEY=<chuỗi bí mật>` trong `.env` để chỉ extension có khoá mới tải được danh sách.

## 3. Cài trên máy thu ngân

1. Chép thư mục `extension/` vào máy (ví dụ `C:\sakuko-bill-ext`).
2. Mở `chrome://extensions` (Edge: `edge://extensions`) → bật **Developer mode** → **Load unpacked** → chọn thư mục vừa chép.
3. Bấm biểu tượng extension → **Cài đặt**, nhập:
   - **Địa chỉ web Xưởng tem**: ví dụ `http://192.168.1.100:4200`
   - **Địa chỉ trang POS**: địa chỉ trang bán hàng, ví dụ `pos.cuahang.vn`
   - **Tên cửa hàng**
4. Bấm **Lưu** → phải hiện "Danh sách có N sản phẩm". Bấm **In thử 1 phiếu** để kiểm tra máy in.

### In không hỏi (in im lặng)

Mặc định Chrome hiện hộp thoại in. Để phiếu tự ra:

1. Đặt máy in bill POS làm **máy in mặc định** của Windows.
2. Trong driver máy in, chọn/tạo khổ giấy rộng 80mm (loại "80 × Receipt" hoặc tạo khổ tuỳ chỉnh 80×45mm), lề 0.
3. Tạo lối tắt mở POS có cờ `--kiosk-printing`, và **luôn mở POS bằng lối tắt này** (phải tắt hết cửa sổ Chrome trước khi mở):

   ```
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing https://dia-chi-pos
   ```

Lưu ý: cờ này làm **mọi** lệnh in của Chrome trên máy đó in thẳng ra máy in mặc định (kể cả bill của POS).

## 4. Extension nhận biết sản phẩm thế nào

- **Mã thu ngân tít**: máy quét mã vạch gõ rất nhanh rồi Enter — extension bắt chuỗi đó và so với mã vạch / mã vạch cũ / mã hàng trong danh sách. Gõ tay mã vào ô rồi Enter cũng tính.
- **Nội dung bill in ra**: lúc POS in, extension đọc nội dung bill và tìm mã (và tên, nếu bill in ở khung/cửa sổ riêng) của sản phẩm trong danh sách.
- Mặc định dùng **cả hai** nguồn. Đổi ở Cài đặt → "Nguồn so khớp".

Thời điểm in: mặc định là ngay sau khi POS in bill xong (sự kiện in của trình duyệt). Nếu POS của bạn không in qua trình duyệt (in qua phần mềm trung gian), đổi sang "Khi thu ngân bấm nút thanh toán" và nhập chữ trên nút.

## 5. Giới hạn cần biết

- Thu ngân tít nhầm rồi **xoá sản phẩm khỏi bill**: extension không biết POS đã xoá, sản phẩm đó vẫn lên phiếu. Cách xử lý: bấm biểu tượng extension → **Xoá mã đang chờ** rồi tít lại; hoặc đổi "Nguồn so khớp" sang "Chỉ theo nội dung bill in ra".
- Số lượng trên phiếu (nếu bật) là **số lần tít**, không phải số lượng thu ngân sửa tay trên POS.
- Phiếu cố định 80×45mm: nhiều sản phẩm thì chữ tự nhỏ lại, chia 2 cột; quá khoảng 19 dòng thì ghi "+N sản phẩm khác". Đặt "Tên in trên phiếu" ngắn gọn để dễ đọc.
- Danh sách trên máy thu ngân cập nhật mỗi 5 phút (hoặc bấm **Đồng bộ danh sách**). Mất mạng thì dùng danh sách lần gần nhất.
- Chỉ chạy được khi POS là **trang web** mở bằng Chrome/Edge trên máy tính.

## 6. Thử không cần POS thật

Mở `http://<máy chủ>:4200/bill-pos-demo.html`, thêm địa chỉ đó vào "Địa chỉ trang POS", gõ mã vạch của một sản phẩm trong danh sách rồi Enter, bấm "Thanh toán & in bill".

## 7. Cho người sửa code

| File | Việc |
|---|---|
| `bill-routes.js` (gốc dự án) | Bảng DB + API `/api/bill/*` |
| `public/bill.html` | Trang quản lý danh sách |
| `extension/content.js` | Chạy trong trang POS: bắt mã tít, bắt sự kiện in |
| `extension/background.js` | Đồng bộ danh sách, gom mã, mở trang in |
| `extension/lib/decide.js`, `lib/match.js` | Luật so khớp và quyết định in (hàm thuần) |
| `extension/lib/slip.js`, `lib/slip.css`, `print.html` | Vẽ phiếu 80×45mm |

Test: `node --test extension/test/logic.test.js`

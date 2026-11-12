# Phạm vi kiểm chứng

Đã chạy:

- `npm test`: 34 kiểm thử đạt, không có kiểm thử bị bỏ qua. Node/jsdom và mock Chrome API; không cần browser hoặc mạng.
- `npm run check`: manifest MV3, file tham chiếu, syntax của 9 JS production, kích thước PNG, không eval, không network client/remote UI dependencies: đạt.
- Lint source giao diện bằng design-taste-frontend: 0 FAIL, 0 WARN.
- HTTP fetch HTML/JS công khai của hai website: thành công. Handler chophim thực tế và payload popup mflix đã giải mã được dùng trực tiếp trong kiểm thử.

Các nhóm kiểm thử:

1. Cài mới không site, không injection, không DNR rule, không host được cấp.
2. Chuẩn hóa URL/tên miền, chống nhầm hậu tố, ưu tiên mục con đã thiết lập riêng.
3. Thêm sau khi có quyền, reload đúng tab; pause/resume; công tắc video; xóa và thu hồi quyền; khôi phục sau startup; quyền bị thu hồi; rollback khi cài rule lỗi.
4. Mã popunder thật của hai site, window.open bị gán đè, onclick, removeEventListener, lớp phủ so với modal/player, không lặp MutationObserver vô hạn.
5. Hủy navigate ra ngoài; giữ điều hướng nội bộ và lịch sử; fallback đóng tab; context-menu intent chỉ dùng một lần.
6. Bridge không relay synthetic clicks; link thật được relay; ctrl/middle-click; không relay lớp phủ trống/phủ màn hình hoặc khi paused.
7. TVC chính xác được hoàn tất; video phim, nút intro và skip bị disabled không bị tác động; các nút JW/IMA hoạt động; tham số tập/máy chủ/hash được giữ.
8. UI thêm trang hiện tại/URL thủ công, từ chối quyền, pause, video toggle, reload, tìm kiếm, danh sách trống, xóa, hướng dẫn và render tên miền như text.

## Giới hạn của bằng chứng

Mock DNR kiểm tra rule được tạo và lifecycle của nó, không chạy bộ so khớp DNR của Chromium. Navigation API được mô phỏng bằng EventTarget. jsdom không layout như browser hoặc giải mã/phát media. Không coi những kiểm thử này là chứng minh đã chặn được mọi ad/network request trong trình duyệt thật.

Chưa cài và thử extension trên Chromium thật, chưa kiểm tra pixel và chưa phát phim thực tế. Phân tích website tuân theo skill api-reverse bằng CLI. Có thử renderer không dùng browser (WeasyPrint), nhưng thiếu thư viện native Pango/GObject trên máy nên chưa tạo được ảnh render; không thay bằng screenshot giả.

## Kiểm tra tích hợp tiếp theo khi có trình duyệt

Load unpacked trên hồ sơ sạch, xác nhận 0 website; thêm mflix và chophim bằng popup và manual; từ chối một lần cấp quyền; reload; thử click vùng trống/ảnh/link/nút player; thử link ngoài bằng click/ctrl/middle/context menu; thử TVC và đổi tập; pause và xóa; xác nhận rule/script không còn cho site đã tắt. Giữ uBlock hoạt động khi kiểm tra banner, và tắt userscript cũ để tránh hook chồng nhau.

Đây là checklist kiểm thử còn cần làm trong browser, không phải các bước đã được báo cáo là đạt.

# BetterFilms

<img src="extension/icons/128.png" width="80" height="80" alt="Logo BetterFilms">

Tiện ích cho **Chrome/Edge** giúp chặn nhảy tab, chuyển hướng ngoài ý muốn và bỏ qua TVC được nhận diện. Chỉ hoạt động trên những website bạn thêm vào danh sách.

## Cài đặt

1. Tải ZIP ở [bản phát hành mới nhất](https://github.com/wanzdoan/BetterFilms/releases/latest) và giải nén.
2. Mở `chrome://extensions` hoặc `edge://extensions`, bật **Chế độ nhà phát triển**.
3. Chọn **Tải tiện ích đã giải nén / Load unpacked** → chọn thư mục `BetterFilms` chứa `manifest.json`.

Có thêm bản **CRX3 tự ký** trong Releases. Chrome trên Windows/macOS giới hạn cài CRX ngoài Web Store; khi bị chặn, dùng ZIP theo cách trên. [Quy định của Chrome](https://developer.chrome.com/docs/extensions/how-to/distribute/install-extensions).

## Sử dụng

Mở website → bấm BetterFilms → **Bảo vệ trang này**. Có thể nhập tên miền thủ công, bật/tắt chặn nhảy tab hoặc TVC, và quản lý từng website ngay trong tiện ích.

Danh sách ban đầu trống. Quyền website được cấp khi cài; thêm tên miền không hỏi lại. Banner thông thường vẫn nên dùng uBlock Origin.

**Cập nhật:** chép file mới vào đúng thư mục extension cũ rồi bấm **Reload** để giữ danh sách website. Sau đó tải lại trang phim.

Website đổi tên miền thì cần thêm tên miền mới vào danh sách. Bản 1.2.1 hỗ trợ Chophim tại `chophim.cfd`; mục `chophim.lol` không tự áp dụng sang miền mới.

**Giữ để phát 2×:** khi phim đang phát toàn màn hình, giữ trên vùng video khoảng 350 ms để phát 2×; thả tay để trở về tốc độ trước đó. Có thể tắt tính năng trong popup. Chạm nhanh, thanh tua và nút điều khiển được giữ nguyên. Hoạt động khi trình phát web chuyển sự kiện chạm tới trang; trình phát toàn màn hình riêng của hệ điều hành có thể không hỗ trợ.

## Lưu ý

Không bảo đảm chặn mọi quảng cáo, nhất là quảng cáo ghép thẳng vào phim. Nếu một chức năng bị chặn nhầm, tạm dừng bảo vệ cho website đó. Thiết lập lưu cục bộ, không có telemetry. Chrome/Edge 120 trở lên.

## Phát triển

```sh
npm ci
npm test
npm run check
npm run package
npm run package:crx
```

Mã extension nằm trong `extension/`; gói cài được tạo trong `dist/`. Kiểm thử tự động dùng DOM và Chrome API giả lập.

Đóng gói CRX cần Chrome. Khóa ký lưu cục bộ trong `.local-keys/`, không đưa lên GitHub; giữ khóa này để các bản CRX sau có cùng ID. Có thể đặt `CHROME_PATH` hoặc `BETTERFILMS_SIGNING_KEY` nếu dùng đường dẫn riêng.

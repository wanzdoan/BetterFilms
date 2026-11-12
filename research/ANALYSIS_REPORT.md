# Phân tích hai website và thiết kế chặn chung

Mục tiêu: extension chọn website thủ công, chặn nhảy link/tab khó chịu và TVC; để bộ chặn quảng cáo hiện có lo banner. Không có HAR/cURL, cookie đăng nhập, Authorization hoặc bước xác thực nào được thu thập. Chỉ lấy HTML và asset được trang công khai tham chiếu. Không dò endpoint tài khoản, khai thác lỗ hổng hoặc thay trạng thái VIP.

## Bằng chứng chophim

URL: `https://chophim.lol/`, `/phim/cuoc-phieu-luu`, `/xem/cuoc-phieu-luu`. HTTP 200. Bản sao mã quảng cáo: `tests/fixtures/chophim-module.js`, tên chunk gốc `2ceb5394e21bed6c.js`, module 716278.

`PopunderAd` đăng ký listener click capture trên document. Chu kỳ 30 phút qua localStorage. Handler hủy click, mở bản sao trang phim, sau đó gọi `location.assign` đưa tab hiện tại tới link rút gọn. Chặn riêng window.open vẫn để lệnh assign chạy.

Chunk trình phát `08c848aec12a239d.js` chứa component TVC `oY` và trang `hv`. Trang đọc query `tvc=1` làm trạng thái đã hoàn tất TVC. Wrapper TVC có nhãn `Tiếp tục xem trong tab mới`: click/Enter/Space mở bản sao với query này, rồi chuyển tab cũ tới đích quảng cáo nếu mở được bản sao. Callback `onEnded` của video TVC trỏ tới `onComplete`.

Still dùng đúng query đã tìm thấy, giữ tập/máy chủ/hash, và gửi ended chỉ cho video trong wrapper TVC chính xác khi điều hướng SPA tạo lại component. Không sửa tài khoản, không giả subscription và không seek video phim.

## Bằng chứng mflix

URL: `https://mflix.store/`, `/movie/gap-anh-trang-2026.html`, `/movie-watch/gap-anh-trang-2026/1-1.html`. HTTP 200. Homepage dùng `window.POPUP_CONFIG`, `cooldown:120`, danh sách chiến dịch với cookie riêng và hai type main/secondary.

Asset `/assets/pu.js` được mã hóa bằng chuyển cơ số và eval. Đã giải lớp đóng gói bằng Python: đọc chuỗi ký tự, đổi từ cơ số trong tham số sang số, trừ offset và giải UTF-8; không chạy payload/eval. Kết quả ở `tests/fixtures/mflix-popup.js`.

Mã giải được tạo div trong suốt fixed, rộng/cao 100%, z-index 99999999. Sau 2 giây, lớp phủ bắt click. Type main mở đích quảng cáo trong tab mới. Type secondary mở bản sao trang phim rồi đổi tab cũ bằng location.replace; nếu window.open trả null thì fallback gán location.href. Đây là nguyên nhân chỉ chặn popup có thể làm quảng cáo chuyển sang chiếm tab hiện tại.

Still có adapter làm rỗng danh sách chiến dịch khi tính năng đang bật, giữ nguyên isVip và các trường khác. Lớp chung nhận diện handler, trả pointer-events của lớp phủ về none và chặn điều hướng ngoài trang. Không ẩn banner hoặc sửa cấu hình quảng cáo cơ bản.

Trang xem mflix có dấu `on_tvc=1` trong HTML, nhưng một tên biến đơn lẻ không chứng minh có TVC đang phát. Không kết luận “không thể có TVC” và không thêm cơ chế seek dựa trên dấu này. Bộ bỏ qua chung chỉ tác động tới các nút skip có bằng chứng.

## Điểm chung và kiến trúc

| Hành vi | Chophim | Mflix | Biện pháp |
| --- | --- | --- | --- |
| Cướp click | Document capture | Lớp phủ trong suốt | Wrapper listener nhận diện mã và bỏ lớp phủ khỏi hit testing |
| Sao chép tab phim | Có | Có ở secondary | Chặn window.open từ trang |
| Chuyển tab cũ | assign | replace hoặc href | Navigation API + quy tắc DNR theo initiator |
| Tab từ iframe/clean context | Có thể phát sinh | Có thể phát sinh | Đóng tab mới qua webNavigation khi không có chủ đích người dùng đã ghi nhận |
| TVC riêng đã xác định | Có | Chưa xác định | Adapter chophim; bộ bấm skip chung |

File MAIN được chèn từ document_start. File ISOLATED giữ Chrome API và kiểm tra sự kiện người dùng thật; không nhận lệnh mở URL từ custom event của trang. Không cố ghi đè Location.assign/replace vì API thường unforgeable. Không dùng webRequestBlocking bị giới hạn trong MV3.

DNR chỉ áp dụng điều hướng main_frame có initiator là tên miền đang bật, loại trừ đích cùng tên miền và các mục con được thiết lập riêng. Không chặn media, XHR, script, ảnh hoặc iframe như một bộ lọc quảng cáo thông thường. Đăng ký script và rule rỗng khi chưa thêm site hoặc đã xóa hết.

Liên kết ngoài được bấm có chủ ý được relay bằng tabs.update/create từ extension để tránh bị nhầm với page-initiated redirect. Các popup mở bằng nút JavaScript vẫn bị chặn theo lựa chọn ưu tiên bảo vệ.

## Tài liệu API chính thức đã đối chiếu

- [Content scripts và execution world](https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts)
- [Dynamic script registration](https://developer.chrome.com/docs/extensions/reference/api/scripting)
- [Optional permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions)
- [DNR và initiator/request domains](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest)
- [Navigation API](https://developer.chrome.com/docs/web-platform/navigation-api)
- [webNavigation](https://developer.chrome.com/docs/extensions/reference/api/webNavigation)

Snapshot là bằng chứng của thời điểm thu thập, không phải đảm bảo website sẽ giữ mã này trong tương lai. Chi tiết kiểm thử và giới hạn tích hợp ở `VALIDATION.md`.

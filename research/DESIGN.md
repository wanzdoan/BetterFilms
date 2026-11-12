# Thiết kế

Still là tên và dấu pause trong khung tab: việc bấm xem phim kết thúc ở đúng tab. Popup trả lời “Website hiện tại đã được bảo vệ chưa?”; trang quản lý trả lời “Still đang hoạt động ở đâu?”.

Đã áp dụng design-taste-frontend, hướng True-black flat, seed 1896824630. Black/white trung tính, mặt phẳng #111 nâng trên nền đen, không glow/gradient/shadow, một sắc xanh dịu #b7d9a8 chỉ cho trạng thái đang bật. Đây là điều chỉnh hue từ màu dữ liệu trong sheet để trạng thái bảo vệ không quá chói khi xem phim ban đêm. Button chính đảo trắng/đen. Inter 400/500/600 được đóng gói cùng license để không gọi font bên ngoài.

Không dùng sidebar T-frame trong popup 392px vì đây là màn hình một tác vụ; trang quản lý giữ sidebar 210px, topbar 64px và chuyển sang nav ngang khi dưới 800px. Popup có giới hạn cuộn 600px; mô tả thừa trong panel trạng thái được ẩn khi các công tắc đã hiện. Tên miền dài được wrap, dữ liệu được render bằng textContent.

Trạng thái mặc định là dữ liệu thật: 0 website. Không điền các trang nghiên cứu vào UI hoặc tạo số lần chặn giả. Empty state đặt ngay ở vị trí danh sách và chỉ tới thao tác thêm website. Loading/error, quyền bị từ chối, quyền bị thu hồi và tên miền không tìm thấy đều có nội dung riêng.

Kiểm tra source bằng lint của skill: 0 FAIL, 0 WARN. Kiểm thử DOM cho popup và quản lý bao phủ thêm, xóa, pause, công tắc, tìm kiếm, route hướng dẫn và lỗi quyền. Không khẳng định đây là kiểm tra pixel trong browser; không có screenshot browser trong quy trình nghiên cứu CLI. Các font, CSS và icon là tài nguyên cục bộ, không có dữ liệu mẫu cần người dùng thay thế.

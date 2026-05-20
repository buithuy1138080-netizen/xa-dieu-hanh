# **PROMPT YÊU CẦU PHÁT TRIỂN / NÂNG CẤP MODULE CON (MODULE 8\)**

*Dành cho Claude 3.5 Sonnet / Claude 3.7 Sonnet*

## **1\. BỐI CẢNH & MỤC TIÊU YÊU CẦU**

Tôi đang phát triển một hệ thống quản lý điều hành cấp xã. Hệ thống có một module con là **"Module 8: Theo dõi Nghị quyết, Đề án, Kế hoạch Đại hội 5 năm"** đã được định hình cấu trúc dữ liệu cơ sở (đính kèm trong tài liệu).

Hiện tại, tôi đã xây dựng xong giao diện **KPI Dashboard** cho module con này (như hình ảnh đính kèm) dùng để theo dõi hiệu quả thực thi các chỉ số. Tôi muốn bạn đóng vai trò là một **Chuyên gia Kiến trúc Hệ thống & Lập trình viên Backend (PostgreSQL \+ FastAPI)** để viết mã nguồn **BỔ SUNG** nhằm lồng ghép tính năng "KPI chiến lược" (bao gồm KPI năm và KPI nhiệm kỳ 5 năm) vào ngay trong module con này.

### **NGUYÊN TẮC BẮT BUỘC:**

1. **KHÔNG phá vỡ cấu trúc cũ:** Kế thừa 100% cấu trúc bảng dữ liệu, các quan hệ khóa ngoại (Foreign Key), quy tắc đặt tên (snake\_case) và logic đệ quy có sẵn trong tài liệu Module 8\.  
2. **KHÔNG tự động vẽ thêm bảng mới:** Chỉ chỉnh sửa bảng cũ thông qua lệnh migrations (ALTER TABLE) hoặc tạo/cập nhật VIEW tổng hợp.  
3. **Ánh xạ chính xác lên Giao diện UI thực tế:** Các trạng thái tính toán và cấu trúc JSON trả về phải khớp hoàn toàn với các biểu đồ và block số liệu hiển thị trên màn hình.

## **2\. CHI TIẾT CẤU TRÚC DATABASE HIỆN TẠI (MODULE 8\)**

Dưới đây là các thực thể dữ liệu hiện có trong module con của tôi:

* Bảng nghi\_quyet (Chứa thông tin nghị quyết, kế hoạch 5 năm).  
* Bảng muc\_tieu\_nq (Cây cấu trúc 3 cấp tự tham chiếu thông qua muc\_tieu\_cha\_id. Trong đó, chỉ tiêu chi tiết cấp dưới cùng sở hữu cap\_do \= 3 chính là các **KPI chiến lược** cần theo dõi).  
* Bảng bang\_theo\_doi\_chi\_tieu (Lưu số liệu tiến độ định lượng định kỳ theo tháng/quý/năm).  
* Bảng nq\_lien\_ket\_cong\_viec (Bảng trung gian liên kết công việc thực tế từ nhiệm vụ M4, chỉ đạo M3, hồ sơ M1 vào chỉ tiêu).  
* VIEW v\_nq\_tong\_quan (Sử dụng CTE đệ quy để tính toán phần trăm tiến độ % task và % số liệu từ các lá cấp 3 dồn lên các mục tiêu cấp 1 và cấp 2).

## **3\. CÁC NỘI DUNG CẦN THỰC HIỆN BỔ SUNG**

### **PHẦN I: MỞ RỘNG CẤU TRÚC DATABASE (DML/DDL SQL)**

1. Hãy viết lệnh ALTER TABLE bổ sung trường quản lý người theo dõi vào bảng chỉ tiêu:  
   * Trường bổ sung: can\_bo\_theo\_doi\_id (Kiểu int, cho phép NULL, là khóa ngoại FOREIGN KEY liên kết đến bảng can\_bo(id)).  
2. Viết câu lệnh SQL tạo các Index tối ưu hiệu năng truy vấn cho Dashboard nếu tài liệu chưa có:  
   * Index lọc theo năm và đơn vị: (nam\_hoan\_thanh, don\_vi\_phu\_trach\_id) trên bảng muc\_tieu\_nq.

### **PHẦN II: CẬP NHẬT VIEW TRẠNG THÁI KPI THEO UI**

Hãy viết câu lệnh CREATE OR REPLACE VIEW v\_nq\_tong\_quan (kế thừa CTE đệ quy từ tài liệu) để tính toán thêm cột trang\_thai (Trạng thái hiệu năng) cho từng KPI (cap\_do \= 3).

Quy tắc phân loại trạng thái phải ánh xạ chính xác vào các Block màu sắc trên UI đính kèm:

1. **'Hoàn thành'** (Màu Xanh lá đậm): Khi phần trăm số liệu đạt chỉ tiêu (pct\_so\_lieu \>= 100).  
2. **'Quá hạn'** (Màu Đỏ nhạt của Quá Hạn): Khi chỉ tiêu có năm hoàn thành (nam\_hoan\_thanh) nhỏ hơn Năm hiện tại nhưng tiến độ thực tế chưa đạt 100% (pct\_so\_lieu \< 100).  
3. **'Chậm tiến độ'** (Ứng với Block màu Đỏ trên UI): Khi chỉ tiêu của năm nay có tiến độ cập nhật thấp hơn ngưỡng cho phép (Ví dụ: cuối Quý 3 mà pct\_so\_lieu \< 70% hoặc cuối Quý 2 mà pct\_so\_lieu \< 50% theo quy tắc cảnh báo của Module 8).  
4. **'Có rủi ro'** (Ứng với Block màu Vàng trên UI): Khi chỉ tiêu đến hạn cập nhật nhưng chưa cập nhật số liệu quý mới sau ngày 10 đầu quý, hoặc tiến độ mấp mé ngưỡng trễ.  
5. **'Đúng tiến độ'** (Ứng với Block màu Xanh lá nhạt trên UI): Các trường hợp chỉ tiêu đang vận hành bình thường, tiến độ bám sát kế hoạch năm.

### **PHẦN III: THIẾT KẾ CÂU LỆNH SQL TRUY VẤN CHO CÁC WIDGET TRÊN DASHBOARD**

Hãy viết các câu lệnh SELECT tối ưu truy vấn dữ liệu theo bộ lọc **Năm** (Ví dụ: WHERE nam\_hoan\_thanh \= :filter\_year hoặc lấy toàn bộ nhiệm kỳ 5 năm nếu bộ lọc là tất cả) để trả về dữ liệu cho các Widget:

1. **Widget Số liệu Tổng hợp (Tổng KPI, Đúng tiến độ, Có rủi ro, Chậm tiến độ, Hoàn thành, Tiến độ TB, Quá hạn):**  
   * Đếm số lượng KPI theo từng trạng thái cụ thể.  
   * Tính Tiến độ TB bằng trung bình cộng tất cả pct\_so\_lieu của các KPI đang lọc.  
2. **Widget Tiến độ tất cả KPI (Biểu đồ cột ngang):**  
   * Lấy danh sách gồm: Tên KPI (ten), Đơn vị đo (don\_vi\_do), pct\_so\_lieu để hiển thị cột tiến độ trực quan.  
3. **Widget Phân bổ trạng thái (Biểu đồ tròn Donut):**  
   * Đếm số lượng và phần trăm tỷ lệ phân bổ của 4 nhóm trạng thái: *Đúng tiến độ, Có rủi ro, Chậm tiến độ, Hoàn thành*.  
4. **Widget Top KPI chậm tiến độ nhất:**  
   * Lấy Top (ví dụ: LIMIT 5\) các chỉ tiêu có trạng thái 'Chậm tiến độ' hoặc 'Có rủi ro', sắp xếp theo tiến độ pct\_so\_lieu tăng dần (thấp nhất lên trước).  
   * Các trường cần lấy: Tên KPI, Đơn vị phụ trách, Đơn vị đo, gia\_tri\_thuc\_te\_moi\_nhat, gia\_tri\_muc\_tieu và % hoàn thành.

### **PHẦN IV: VIẾT API ENDPOINT VỚI FASTAPI (PYTHON \+ SQLALCHEMY)**

Viết code Python sử dụng thư viện **FastAPI** và **SQLAlchemy** để bổ sung các endpoint xử lý nghiệp vụ cho giao diện KPI Dashboard:

1. GET /api/v1/nghi-quyet/dashboard-summary  
   * Tham số query: nghi\_quyet\_id: int, nam: Optional\[int\] \= None.  
   * Response JSON: Trả về số liệu tổng hợp cho các khối thẻ thông tin đầu trang.  
2. GET /api/v1/nghi-quyet/dashboard-charts  
   * Tham số query: nghi\_quyet\_id: int, nam: Optional\[int\] \= None.  
   * Response JSON: Cấu trúc dữ liệu mảng phẳng (Flat Array) cấp cho Bar Chart tiến độ và Donut Chart phân bổ trạng thái.  
3. GET /api/v1/nghi-quyet/dashboard-top-delayed  
   * Tham số query: nghi\_quyet\_id: int, nam: Optional\[int\] \= None, limit: int \= 5\.  
   * Response JSON: Danh sách các KPI chậm tiến độ nhất kèm theo thông tin đơn vị phụ trách để hiển thị ở góc dưới màn hình.

*Yêu cầu về Code Python:* Code sạch (Clean code), có xử lý ngoại lệ (Exception Handling) chặt chẽ bằng HTTPException, sử dụng các Pydantic Schema để định nghĩa rõ ràng kiểu dữ liệu Input/Output đầu ra.

Hãy xử lý bài toán một cách chi tiết, viết mã nguồn hoàn chỉnh rõ ràng để tôi có thể tích hợp trực tiếp vào hệ thống hiện tại của mình\!
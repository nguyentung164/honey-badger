# Hướng dẫn lấy Refresh Token cho OneDrive cá nhân

Để kết nối với OneDrive cá nhân, bạn cần có Client ID và Refresh Token. Dưới đây là hướng dẫn chi tiết để lấy Refresh Token.

## Bước 1: Đăng ký ứng dụng trong Azure Portal

1. Truy cập [Azure Portal - App Registrations](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
2. Đăng nhập bằng tài khoản Microsoft cá nhân của bạn
3. Nhấn "New registration" để tạo ứng dụng mới
4. Điền thông tin:
   - Name: "Honey Badger" (hoặc tên bạn muốn)
   - Supported account types: Chọn "Accounts in any organizational directory and personal Microsoft accounts"
   - Redirect URI: Chọn "Web" và nhập `https://login.microsoftonline.com/common/oauth2/nativeclient`
5. Nhấn "Register" để tạo ứng dụng
6. Sau khi tạo, sao chép "Application (client) ID" - đây là Client ID bạn sẽ sử dụng trong ứng dụng

## Bước 2: Cấu hình quyền cho ứng dụng

1. Trong trang chi tiết ứng dụng, chọn "API permissions" từ menu bên trái
2. Nhấn "Add a permission"
3. Chọn "Microsoft Graph"
4. Chọn "Delegated permissions"
5. Tìm và chọn các quyền sau:
   - Files.ReadWrite.All
   - Files.ReadWrite
   - Sites.ReadWrite.All
6. Nhấn "Add permissions" để lưu
7. Nhấn "Grant admin consent for [tenant]" để cấp quyền (nếu có)

## Bước 3: Lấy Authorization Code

1. Mở trình duyệt và truy cập URL sau (thay `YOUR_CLIENT_ID` bằng Client ID của bạn):
```
https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=165366fb-7e1e-4278-9876-882abf00bb34&response_type=code&redirect_uri=https://login.microsoftonline.com/common/oauth2/nativeclient&scope=Files.ReadWrite.All Files.ReadWrite Sites.ReadWrite.All offline_access
```

2. Đăng nhập bằng tài khoản Microsoft cá nhân của bạn
3. Cấp quyền cho ứng dụng khi được yêu cầu
4. Sau khi được chuyển hướng, sao chép toàn bộ URL từ thanh địa chỉ
5. URL sẽ có dạng: `https://login.microsoftonline.com/common/oauth2/nativeclient?code=AUTHORIZATION_CODE`
6. Trích xuất phần `AUTHORIZATION_CODE` từ URL (phần sau `code=` và trước dấu `&` nếu có)

## Bước 4: Đổi Authorization Code lấy Refresh Token

### Cách 1: Sử dụng Postman

1. Mở Postman
2. Tạo request POST mới đến `https://login.microsoftonline.com/common/oauth2/v2.0/token`
3. Trong tab "Body", chọn "x-www-form-urlencoded"
4. Thêm các tham số sau:
   - `client_id`: Client ID của bạn
   - `redirect_uri`: `https://login.microsoftonline.com/common/oauth2/nativeclient`
   - `code`: Authorization Code bạn đã lấy ở bước 3
   - `grant_type`: `authorization_code`
   - `scope`: `Files.ReadWrite.All Files.ReadWrite Sites.ReadWrite.All offline_access`
5. Gửi request
6. Trong kết quả JSON trả về, sao chép giá trị của trường `refresh_token`

### Cách 2: Sử dụng cURL

Mở Terminal hoặc Command Prompt và chạy lệnh sau (thay thế các giá trị tương ứng):

```bash
curl -X POST https://login.microsoftonline.com/common/oauth2/v2.0/token -H "Content-Type: application/x-www-form-urlencoded" -d "client_id=165366fb-7e1e-4278-9876-882abf00bb34&redirect_uri=https://login.microsoftonline.com/common/oauth2/nativeclient&code=M.C556_BAY.2.U.e7e1bbd4-c5ea-4287-f2c1-d7032645baf9&grant_type=authorization_code&scope=Files.ReadWrite.All Files.ReadWrite Sites.ReadWrite.All offline_access"
```

Trong kết quả JSON trả về, sao chép giá trị của trường `refresh_token`.

### Cách 3: Sử dụng công cụ trực tuyến

1. Truy cập [OAuth 2.0 Playground](https://oauth.pstmn.io/)
2. Nhập thông tin tương tự như trong Postman
3. Nhấn "Get New Access Token"
4. Sao chép giá trị Refresh Token từ kết quả

## Bước 5: Cấu hình trong ứng dụng

1. Mở ứng dụng Honey Badger
2. Vào phần Cài đặt > OneDrive
3. Nhập Client ID và Refresh Token vào các trường tương ứng
4. Lưu cài đặt

## Lưu ý

- Refresh Token có thời hạn dài (thường là 90 ngày) và sẽ tự động được làm mới khi sử dụng
- Nếu gặp lỗi xác thực, bạn có thể cần lấy Refresh Token mới
- Đảm bảo bảo mật Refresh Token vì nó cho phép truy cập vào OneDrive của bạn

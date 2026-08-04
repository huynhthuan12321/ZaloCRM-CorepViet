# ZaloCRM Control MCP Server

MCP server độc lập dùng transport **stdio**, cho phép một MCP host (Claude Desktop, Hermes...) tạm dừng,
bật lại và xem trạng thái trợ lý AI tự động của ZaloCRM qua Public API.

## Yêu cầu

- Node.js 20 trở lên.
- B1 đã được triển khai trên ZaloCRM.
- Public API key của đúng tổ chức cần điều khiển.

## Cài đặt và chạy local

```bash
npm install
copy .env.example .env
npm run build
node dist/index.js
```

Điền hai biến trong `.env` trước khi chạy:

```dotenv
ZALOCRM_API_BASE=https://zalocrm.corepviet.com
ZALOCRM_API_KEY=public_api_key_cua_ban
```

Server giao tiếp qua stdin/stdout nên khi chạy trực tiếp sẽ không hiện giao diện hay log khởi động. MCP host
sẽ khởi chạy process và giao tiếp bằng JSON-RPC. API key chỉ được đọc từ biến môi trường, không được ghi log.

## Các tool

- `tat_tu_van`: tạm dừng mọi trả lời AI tự động.
- `bat_tu_van`: bật lại trả lời AI tự động; phạm vi/chế độ trọn/nhắc lại vẫn giữ nguyên.
- `xem_trang_thai`: xem công tắc tổng, phạm vi, chế độ trọn và nhắc lại khách im lặng.

## Cấu hình Claude Desktop trên Windows

Thêm server vào `mcpServers` trong file cấu hình Claude Desktop. Thay đường dẫn và giá trị mẫu bằng thông tin
thật; không commit file cấu hình chứa API key.

```json
{
  "mcpServers": {
    "zalocrm-control": {
      "command": "node",
      "args": ["D:\\ZaloCRM-CorepViet\\mcp-server\\dist\\index.js"],
      "env": {
        "ZALOCRM_API_BASE": "https://zalocrm.corepviet.com",
        "ZALOCRM_API_KEY": "public_api_key_cua_ban"
      }
    }
  }
}
```

Khởi động lại MCP host, rồi thử lần lượt: “xem trạng thái tư vấn”, “tắt tư vấn”, “bật tư vấn”. Hermes hoặc
MCP host khác cấu hình cùng command, args và hai biến môi trường tương tự.

## Kiểm tra tự động

Lệnh dưới đây dựng một API giả lập chỉ ở máy local, kết nối MCP qua stdio và gọi đủ ba tool. Nó không truy cập
hay thay đổi dữ liệu ZaloCRM thật.

```bash
npm run test:smoke
```

## Docker (tùy chọn)

```bash
docker build -t zalocrm-control-mcp .
docker run --rm -i \
  -e ZALOCRM_API_BASE=https://zalocrm.corepviet.com \
  -e ZALOCRM_API_KEY=public_api_key_cua_ban \
  zalocrm-control-mcp
```

Phải giữ `-i` vì transport là stdio. Bản này không phải MCP HTTP-remote và chưa dùng trực tiếp từ ứng dụng
Claude trên điện thoại; trường hợp đó cần một server Streamable HTTP có xác thực ở bước riêng.

import { createRequire } from 'node:module';
const require = createRequire('file:///D:/ZaloCRM-CorepViet/frontend/');
const ExcelJS = require('exceljs');

const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet('KhachHang');
ws.addRow(['STT', 'Họ và tên', 'Ghi chú', 'Số điện thoại', 'Email', 'Địa chỉ']);
const names = [
  'Nguyễn Văn Hùng', 'Trần Thị Kim Liên', 'Lê Đức Thọ', 'Phạm Thị Ngọc Ánh',
  'Hoàng Văn Dũng', 'Vũ Thị Hồng Nhung', 'Đặng Minh Trí', 'Bùi Thị Thu Hà',
  'Ngô Quang Vinh', 'Đỗ Thị Lan Anh', 'Mai Văn Phúc', 'Lý Thị Bích Ngọc',
  'Trịnh Công Sơn', 'Cao Thị Mỹ Linh', 'Phan Văn Khải',
];
names.forEach((name, i) => {
  const n = String(i + 1).padStart(4, '0');
  ws.addRow([i + 1, name, 'khách lead FB', `090400${n}`, `kh${i + 1}@example.com`, 'Quận 1, TP.HCM']);
});
await wb.xlsx.writeFile(new URL('./import-nhieu-cot.xlsx', import.meta.url).pathname.slice(1));
console.log('OK: 15 rows, phone at column 4');

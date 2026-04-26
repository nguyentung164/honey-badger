# Honey Badger

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Electron](https://img.shields.io/badge/Electron-2C2E3B?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-20232a?logo=react&logoColor=61DAFB)](https://reactjs.org)
[![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![pnpm](https://img.shields.io/badge/pnpm-F69220?logo=pnpm&logoColor=white)](https://pnpm.io)
[![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-0f172a?logo=tailwindcss&logoColor=white)](https://ui.shadcn.dev/)
[![SVN](https://img.shields.io/badge/SVN-809CC9?logo=subversion&logoColor=white)](https://subversion.apache.org/)
[![Git SCM](https://img.shields.io/badge/Git-SCM-F05032?logo=git&logoColor=white)](https://git-scm.com/)
[![OpenAI](https://img.shields.io/badge/OpenAI-412991?logo=openai&logoColor=white)](https://openai.com/)

Ứng dụng desktop quản lý SVN & Git cho Windows. Tải tại [Releases](https://github.com/nguyentung164/honey-badger/releases).

## Tính năng

### 1. Version Control

**SVN**

- Xem danh sách file thay đổi (status)
- Commit, Update (chọn revision cụ thể), Revert
- Cleanup: sửa lock, externals, unversioned/ignored (chuyển Recycle Bin), unused (vacuum pristine)
- Show Log: xem lịch sử commit, filter, phân tích AI
- Diff Viewer: so sánh thay đổi, syntax highlighting
- Blame: xem ai sửa từng dòng
- Merge: gộp nhánh, tạo snapshot trước merge, xử lý conflict

**Git**

- Status, stage/unstage, Dual Table (staged/unstaged)
- Commit, Undo Commit, Push, Pull, Fetch (streaming log realtime)
- Branch: switch, create, delete
- Stash: list, apply, pop, drop, clear
- Merge, Rebase, Cherry-pick, Interactive Rebase
- Tags: tạo, xóa, push
- Remote: add, remove, set URL
- Clone, Init
- Blame: xem ai sửa từng dòng
- Reset: soft, mixed, hard
- Hooks: pre-commit, commit-msg, prepare-commit-msg, post-commit, pre-push, pre-rebase, post-merge, post-checkout

### 2. VCS Users

- **SVN:** Xem danh sách credentials đã cache (realm, username), xóa khi cần
- **Git:** Xem/sửa config global và local (user.name, user.email), xem/xóa credentials đã lưu

### 3. AI

- **Generate commit message:** Tạo message từ diff theo Conventional Commit, hỗ trợ OpenAI, Claude, Google
- **Check Coding Rules:** AI đánh giá vi phạm coding style, gợi ý sửa
- **SpotBugs AI Chat:** Phân tích kết quả SpotBugs, trò chuyện để hiểu và fix bugs
- **Commit Analysis:** Phân tích commit patterns trong Show Log (chất lượng message, thói quen làm việc, rủi ro, KPI)

### 4. Kiểm tra Code

- **Coding Rules:** Tùy chỉnh rules, phát hiện vi phạm trên diff, báo trước khi commit
- **SpotBugs:** Chạy phân tích Java, xem kết quả, code snippet vi phạm, tích hợp AI chat

### 5. Thống kê

- **Dashboard:** Biểu đồ commits, contributors, file changes; filter theo author, date range
- **Commit message history:** Lưu và tìm lại message đã generate
- **Commit review:** Đánh dấu reviewed/unreviewed, thống kê theo task
- **AI analysis history:** Lưu lịch sử phân tích AI

### 6. Thông báo

- **Email:** Gửi thông tin commit qua SMTP khi commit
- **MS Teams:** Gửi tin nhắn qua webhook khi commit (hỗ trợ nhiều webhook)

### 7. Task Management

- Quản lý tasks, projects, users (MySQL)
- Master data: statuses, priorities, types, sources
- Sub-tasks, task links (blocks, blocked by, relates to, duplicates)
- Copy task, Import Redmine CSV
- OneDrive: upload file đính kèm task
- Commit review gắn với tasks (theo ticket ID), favorite tasks
- Thông báo deadline task (hôm nay, ngày mai)
- Guest mode: xem Task Management không cần đăng nhập

### 8. Khác

- **Đa ngôn ngữ:** Tiếng Anh, Nhật, Việt
- **Appearance:** Theme (dark/light), font size, font family, button variant
- **External editor:** Mở file bằng VS Code, Notepad++, v.v.
- **Auto-update:** Kiểm tra và cài bản mới
- **Git check updates:** Thông báo khi có commit mới từ remote
- **Auto refresh:** Tự reload khi file trong source folder thay đổi
- **Conflict resolver:** Giao diện xử lý conflict khi merge
- **Commit convention:** Validate message (block/warn mode)
- **Reference ID:** Ô nhập ticket/issue ID (Redmine, v.v.) thêm vào đầu commit message
- **Support/Feedback:** Gửi feedback hỗ trợ qua Teams
- **Config export/import:** Sao lưu và khôi phục cấu hình

## Yêu cầu

- Windows
- TortoiseSVN (nếu dùng SVN) – bật tùy chọn "command-line" khi cài đặt
- Git command-line (nếu dùng Git)
- JRE 11+ (nếu dùng SpotBugs)
- MySQL (nếu dùng Task Management)

## Cấu hình

1. **Settings** → Thêm Source Folders (app tự detect SVN/Git)
2. **Appearance:** Ngôn ngữ, theme, font, button style
3. **Configuration:** Mail server (SMTP), Teams webhook, API keys (OpenAI/Claude/Google), Coding rules, External editor, Commit convention, Auto refresh, Start on login, Show notifications
4. **Version Control:** Source folders, Git hooks, VCS users
5. **Rules:** Coding rules (tùy chỉnh)
6. **Integrations:** Mail server, OneDrive, Task DB (MySQL)

## Giấy phép

MIT – xem [LICENSE](LICENSE).

## Tác giả

Nguyễn Quang Tùng – nguyentung164@gmail.com

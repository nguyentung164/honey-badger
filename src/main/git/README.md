# Git Functionality

Module này cung cấp các chức năng Git cơ bản cho ứng dụng Electron, sử dụng thư viện `simple-git`.

## Các chức năng có sẵn

### 1. Log (`log.ts`)
- Xem lịch sử commit
- Hỗ trợ lọc theo ngày, commit range, author
- Trả về thông tin chi tiết về các commit

### 2. Status (`status.ts`)
- Xem trạng thái hiện tại của repository
- Hiển thị các file đã thay đổi, staged, unstaged
- Thông tin về branch hiện tại và tracking

### 3. Commit (`commit.ts`)
- Tạo commit với message
- Commit các file được chọn hoặc tất cả thay đổi

### 4. Diff (`diff.ts`)
- Xem diff của các file đã thay đổi
- Xem diff của staged changes
- Hỗ trợ xem diff cho file cụ thể

### 5. Revert (`revert.ts`)
- Revert các thay đổi của file
- Reset staged changes
- Hỗ trợ revert nhiều file cùng lúc

### 6. Branch (`branch.ts`)
- Xem danh sách branches
- Tạo branch mới
- Checkout branch
- Xóa branch

### 7. Push/Pull (`push-pull.ts`)
- Push changes lên remote
- Pull changes từ remote
- Fetch changes từ remote
- Xem danh sách remotes

### 8. Stash (`stash.ts`)
- Tạo stash với message
- Xem danh sách stash
- Pop stash (apply và xóa)
- Drop stash (xóa không apply)

### 9. Merge (`merge.ts`)
- Merge branch với strategy
- Abort merge operation
- Resolve merge conflicts
- Kiểm tra merge status

### 10. Tags (`tag.ts`)
- Tạo annotated và lightweight tags
- Xem danh sách tags
- Xóa tags (local và remote)
- Push tags lên remote

### 11. Validation (`validation.ts`)
- Validate commit message format
- Validate branch name
- Validate tag name
- Kiểm tra conventional commit format

## Cách sử dụng

### Trong Main Process
```typescript
import { log, status, commit, getDiff } from 'main/git'

// Xem log
const logResult = await log('.', { 
  dateFrom: '2024-01-01', 
  dateTo: '2024-12-31' 
})

// Xem status
const statusResult = await status()

// Commit
const commitResult = await commit('feat: add new feature', '', ['file1.ts', 'file2.ts'])

// Xem diff
const diffResult = await getDiff(['file1.ts'])
```

### Trong Renderer Process
```typescript
import { ipcRenderer } from 'electron'

// Xem log
const logResult = await ipcRenderer.invoke('git:log', '.', { 
  dateFrom: '2024-01-01', 
  dateTo: '2024-12-31' 
})

// Xem status
const statusResult = await ipcRenderer.invoke('git:status')

// Commit
const commitResult = await ipcRenderer.invoke('git:commit', 'feat: add new feature', '', ['file1.ts'])

// Xem diff
const diffResult = await ipcRenderer.invoke('git:get-diff', ['file1.ts'])
```

## IPC Handlers

Tất cả các chức năng Git đều được expose qua IPC handlers:

- `git:log` - Xem lịch sử commit
- `git:status` - Xem trạng thái repository
- `git:commit` - Tạo commit
- `git:get-diff` - Xem diff
- `git:get-staged-diff` - Xem staged diff
- `git:revert` - Revert changes
- `git:reset-staged` - Reset staged changes
- `git:get-branches` - Xem danh sách branches
- `git:create-branch` - Tạo branch mới
- `git:checkout-branch` - Checkout branch
- `git:delete-branch` - Xóa branch
- `git:push` - Push changes
- `git:pull` - Pull changes
- `git:fetch` - Fetch changes
- `git:get-remotes` - Xem danh sách remotes
- `git:stash` - Tạo stash
- `git:stash-list` - Xem danh sách stash
- `git:stash-pop` - Pop stash
- `git:stash-drop` - Drop stash
- `git:merge` - Merge branch
- `git:abort-merge` - Abort merge
- `git:resolve-conflict` - Resolve conflict
- `git:get-merge-status` - Kiểm tra merge status
- `git:create-tag` - Tạo tag
- `git:list-tags` - Xem danh sách tags
- `git:delete-tag` - Xóa tag
- `git:push-tag` - Push tag

## Lưu ý

1. Tất cả các chức năng đều kiểm tra xem thư mục hiện tại có phải là Git repository không
2. Các lỗi được log và trả về message rõ ràng
3. Sử dụng `configurationStore.store.sourceFolder` làm working directory
4. Tất cả các functions đều là async và trả về Promise 
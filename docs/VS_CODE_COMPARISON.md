# So sánh Honey-badger vs Visual Studio Code

> **Cập nhật:** 2026-07-01  
> **Phiên bản app:** 1.1.9 (theo `package.json`)  
> **Tham chiếu VS Code:** [User Interface](https://code.visualstudio.com/docs/getstarted/userinterface), [Code Navigation](https://code.visualstudio.com/docs/editing/editingevolved), [Source Control](https://code.visualstudio.com/docs/sourcecontrol/overview), [Debugging](https://code.visualstudio.com/docs/debugtest/debugging), [Terminal](https://code.visualstudio.com/docs/terminal/basics)

Honey-badger là **công cụ VCS + team workflow** có editor nhúng (Monaco), không phải IDE đầy đủ như VS Code. Tài liệu này liệt kê tính năng theo nhóm, dựa trên code thực tế trong repo.

## Chú thích trạng thái

| Ký hiệu | Ý nghĩa |
|---------|---------|
| ✅ | Đầy đủ hoặc tương đương VS Code |
| 🟡 | Một phần — có nhưng thiếu chi tiết hoặc hành vi khác |
| ❌ | Chưa có |
| ➕ | Honey-badger có thêm (VS Code không có sẵn hoặc cần extension) |
| — | Không áp dụng |

## File code tham chiếu chính

| Khu vực | Đường dẫn |
|---------|-----------|
| Editor workbench | `src/renderer/pages/editor/EditorWorkbench.tsx` |
| Explorer | `src/renderer/pages/editor/explorer/` |
| Explorer file ops | `src/renderer/pages/editor/explorer/useExplorerFileOperations.ts` |
| Explorer selection | `src/renderer/pages/editor/explorer/explorerSelection.ts` |
| Compare tab (editor) | `src/renderer/pages/editor/editor-area/EditorComparePane.tsx`, `useEditorWorkspace.openCompare` |
| Editor workspace / tabs | `src/renderer/pages/editor/hooks/useEditorWorkspace.ts` |
| Editor search | `src/renderer/pages/editor/search/EditorSearchPanel.tsx`, `useEditorSearch.ts` |
| Search globs / replace | `src/shared/editor/globPatterns.ts`, `searchReplace.ts` |
| LSP | `src/renderer/pages/editor/lsp/EditorLanguageService.ts` |
| LSP helpers | `src/renderer/pages/editor/lsp/lspMonacoConvert.ts`, `lspWorkspaceEdit.ts` |
| LSP lazy | `src/renderer/pages/editor/hooks/useLazyEditorLsp.ts` |
| Git staging | `src/renderer/pages/main/GitStagingTable.tsx` |
| SVN | `src/renderer/pages/main/SvnFileTable.tsx` |
| Diff viewer | `src/renderer/pages/diffviewer/CodeDiffViewer.tsx` |
| Terminal | `src/renderer/pages/main/IntegratedTerminalPanel.tsx` |
| Settings | `src/renderer/components/dialogs/SettingsDialog.tsx` |

---

## 1. Workbench & bố cục UI

| # | Tính năng VS Code | Honey-badger | Ghi chú |
|---|-------------------|--------------|---------|
| 1 | Activity Bar (Explorer, Search, SCM, Run, Extensions…) | 🟡 | Editor tab chỉ có **Explorer + Search** (`EditorActivityBar.tsx`) |
| 2 | Primary Side Bar (kéo thả view) | 🟡 | Sidebar editor cố định, resize được |
| 3 | Secondary Side Bar (Chat, v.v.) | ❌ | |
| 4 | Panel (Output, Problems, Debug, Terminal) | 🟡 | **Terminal** ở mọi shell tab (panel chung `MainPage`); chưa có Output/Problems panel |
| 5 | Status Bar | 🟡 | Editor có path, ngôn ngữ, cursor, LSP (`EditorStatusBar.tsx`) |
| 6 | Command Palette (`Ctrl+Shift+P`) | ❌ | Chỉ Quick Open `Ctrl+P` |
| 7 | Editor groups — split ngang/dọc | ❌ | Một vùng editor duy nhất |
| 8 | Floating editor windows | 🟡 | Detach window cho Tasks/PR/Automation…, không phải editor tab |
| 9 | Tab preview + pin | ✅ | `useEditorWorkspace.ts` |
| 10 | Open Editors list | ✅ | `EditorExplorerPanel` — collapsible section above workspace tree |
| 11 | Profiles / Settings sync | ❌ | |
| 12 | Workspace Trust | ❌ | |
| 13 | Multi-root workspace | 🟡 | Multi-repo Git commit; explorer **một** `repoCwd` |
| 14 | Session restore (tabs/layout) | 🟡 | Restore tab file (`editorSessionPersist.ts`); **tab compare không persist**; layout sidebar có persist |
| 15 | Zen Mode / Centered layout | ❌ | |

---

## 2. Editor lõi (Monaco)

| # | Tính năng VS Code | Honey-badger | Ghi chú |
|---|-------------------|--------------|---------|
| 16 | Syntax highlighting đa ngôn ngữ | ✅ | Monaco + `monacoLanguage.ts` |
| 17 | Multi-cursor / column selection | ✅ | Monaco mặc định |
| 18 | Find / Replace trong file (`Ctrl+F/H`) | ✅ | `EditorWorkbench.tsx` |
| 19 | Go to Line (`Ctrl+G`) | ✅ | `EditorGoToLineDialog.tsx` |
| 20 | Quick Open file (`Ctrl+P`) | ✅ | `EditorQuickOpen.tsx` |
| 21 | Minimap | ✅ | `buildMonacoEditorOptions.ts` |
| 22 | Code folding | ✅ | |
| 23 | Bracket matching & colorization | ✅ | |
| 24 | Indent guides | ✅ | |
| 25 | Sticky Scroll (theo scope/symbol) | 🟡 | Monaco sticky scroll bật; **không** có symbol path như VS Code |
| 26 | Breadcrumbs (file + symbol) | 🟡 | Breadcrumb **đường dẫn file** (`EditorFileBreadcrumbs.tsx`); chưa có symbol |
| 27 | Word wrap, whitespace render | ✅ | Settings trong localStorage |
| 28 | Format document (`Alt+Shift+F`) | ✅ | |
| 29 | Format on save | ✅ | Toggle trong `EditorSettingsDialog.tsx`; `useEditorWorkspace.saveTab` |
| 30 | Auto-save after delay | ✅ | `EditorWorkbench.tsx` |
| 31 | Save (`Ctrl+S`) | ✅ | Đọc text từ Monaco bridge |
| 32 | Binary file handling | ✅ | Hiện thông báo, không edit |
| 33 | Large file optimizations | ✅ | Tắt một số tính năng nặng khi file lớn |
| 34 | Snippets / Emmet | 🟡 | Monaco cơ bản; **không** Emmet đầy đủ |
| 35 | User/Workspace settings UI | 🟡 | `EditorSettingsDialog.tsx` + localStorage; có CodeLens / Inlay hints; chưa đủ như VS Code Settings |
| 36 | Keybindings editor | ❌ | Một số shortcut hard-code |
| 37 | `settings.json` per project | ❌ | App dùng `configuration` export/import chung |
| 38 | Compare hai file trong editor tab | ✅ | Tab `kind: 'compare'`, Monaco DiffEditor read-only (`EditorComparePane.tsx`) |

---

## 3. Code intelligence (LSP / IntelliSense)

| # | Tính năng VS Code | Honey-badger | Ghi chú |
|---|-------------------|--------------|---------|
| 39 | Extension-based language support | 🟡 | Built-in TS/JS + Java (`EditorLanguageService.ts`) |
| 40 | Completion (IntelliSense) | 🟡 | LSP provider + `completionItem/resolve` (auto-import); **lazy ~1.5s idle** (`useLazyEditorLsp.ts`) |
| 41 | Parameter hints (signature help) | 🟡 | `registerSignatureHelpProvider`; trigger `(` `,`; phụ thuộc LSP lazy |
| 42 | Hover | 🟡 | LSP provider có |
| 43 | Go to Definition (`F12`) | 🟡 | Provider có; **shortcut chưa bind** |
| 44 | Peek Definition / References | ❌ | |
| 45 | Go to Symbol in file (`Ctrl+Shift+O`) | ❌ | |
| 46 | Go to Symbol in workspace (`Ctrl+T`) | ❌ | |
| 47 | Find All References | 🟡 | LSP provider có |
| 48 | Rename symbol (`F2`) | 🟡 | LSP provider có; **F2 trong explorer = đổi tên file** |
| 49 | Signature help | 🟡 | Provider có |
| 50 | Document formatting (LSP) | 🟡 | Provider có |
| 51 | Diagnostics (squiggles) | 🟡 | Markers LSP (severity map đúng); **không** Problems panel |
| 52 | Code Actions / Quick Fix (💡) | ✅ | LSP + resolve; hỗ trợ `edit` và `command` |
| 53 | CodeLens | ✅ | LSP + `workspace/executeCommand`; references đặt cursor đúng vị trí |
| 54 | Inlay hints | ✅ | LSP provider; TS preferences bật parameter/type hints |
| 55 | Import suggestions / organize imports | ✅ | Completion resolve + `additionalTextEdits`; **Shift+Alt+O** + toast |
| 56 | Next Edit Suggestions (AI) | ❌ | VS Code 1.99+ |
| 57 | Ngôn ngữ LSP | 🟡 | TS/JS/Java; VS Code hỗ trợ hàng chục qua extension |

---

## 4. Explorer & điều hướng file

| # | Tính năng VS Code | Honey-badger | Ghi chú |
|---|-------------------|--------------|---------|
| 58 | File tree lazy load | ✅ | `useProjectFileTree.ts` + virtual list |
| 59 | Tạo / xóa / đổi tên file & folder | ✅ | Context menu + **inline edit** (phantom row / F2); IPC `system.ts` |
| 60 | Cut / Copy / Paste file & folder | ✅ | Clipboard nội bộ explorer; paste guard (không dán vào con của chính nó) |
| 61 | Multi-select (`Ctrl` / `Shift` / `Ctrl+A`) | ✅ | `explorerSelection.ts`, `EditorExplorerPanel.tsx` |
| 62 | Drag & drop file | ❌ | |
| 63 | `files.exclude` / ẩn `.git` | ❌ | |
| 64 | Ẩn theo `.gitignore` | ❌ | |
| 65 | Filter tree (`Ctrl+Alt+F`) | ❌ | |
| 66 | Reveal in OS Explorer | ✅ | Context menu |
| 67 | Copy path / Copy relative path | ✅ | |
| 68 | Open in Integrated Terminal | ✅ | Mở terminal tại thư mục file/folder (`terminalLaunchBridge.ts`) |
| 69 | Open in external editor | 🟡 | Có ở VCS table; explorer editor chưa |
| 70 | Outline view (symbols) | ❌ | |
| 71 | Compare Selected (2 file) | ✅ | Mở **tab diff trong editor** (`openCompare`, `EditorComparePane.tsx`); read-only side-by-side |
| 72 | Git decorations trên tree | ✅ | Badge file + dot folder (`explorerGitDecorations.ts`) |
| 73 | Undo / Redo thao tác file | ✅ | `explorerUndoStack.ts` — `Ctrl+Z` / `Ctrl+Y` |
| 74 | Xóa file — confirm dialog | ✅ | `ExplorerDeleteConfirmDialog.tsx` (shadcn AlertDialog) |
| 75 | File watcher reload tab | 🟡 | Debounce 400ms; **tắt khi `pnpm dev`** (`import.meta.env.DEV`) |
| 76 | Sync tab khi rename / delete explorer | ✅ | `renameExplorerPath`, `closeTabsForExplorerDelete` trong `useEditorWorkspace.ts` |

---

## 5. Tìm kiếm

| # | Tính năng VS Code | Honey-badger | Ghi chú |
|---|-------------------|--------------|---------|
| 77 | Search across files (`Ctrl+Shift+F`) | ✅ | `EditorSearchPanel.tsx` |
| 78 | Replace across files | ✅ | Replace All + Replace per file; regex `$1`; reload tab đã mở |
| 79 | Regex / case / whole word | ✅ | |
| 80 | Include/exclude globs | ✅ | Comma-separated, VS Code Search glob rules (`globPatterns.ts`) |
| 81 | Semantic / AI search | ❌ | VS Code experimental |
| 82 | Search trong SCM changes | ❌ | |

---

## 6. Source Control — Git

| # | Tính năng VS Code | Honey-badger | Ghi chú |
|---|-------------------|--------------|---------|
| 83 | Staging / unstaging | ✅ | `GitStagingTable.tsx` |
| 84 | Inline diff trong SCM | ✅ | Layout diff + diff viewer window |
| 85 | Commit + message | ✅ | AI generate message |
| 86 | Amend / sign-off | ✅ | `CommitFooterActions.tsx` |
| 87 | Branch switch / create / delete | ✅ | Dialogs đầy đủ |
| 88 | Pull / Push / Fetch | ✅ | |
| 89 | Stash | ✅ | `GitStashDialog.tsx` |
| 90 | Merge / conflict resolve | ✅ | + conflict diff viewer |
| 91 | Rebase / interactive rebase | ✅ | `GitInteractiveRebaseDialog.tsx` |
| 92 | Cherry-pick UI | ✅ | |
| 93 | Tags | ✅ | |
| 94 | Clone / Init | ✅ | |
| 95 | Remotes management | ✅ | |
| 96 | Reset (soft/mixed/hard) | ✅ | |
| 97 | Git hooks editor | ✅ | Settings |
| 98 | Source Control Graph | 🟡 | **Show Log** có graph (`ShowLog.tsx`) |
| 99 | GitHub PR/Issues in editor | 🟡 | **PR Manager** riêng, mạnh hơn extension cơ bản |
| 100 | Gitleaks / secret scan | ➕ | Trước commit |
| 101 | Multi-repo commit | ➕ | VS Code cần multi-root |
| 102 | AI commit analysis | ➕ | Show Log AI |
| 103 | Submodule UI | ❌ | |
| 104 | Git worktree UI | ❌ | |

---

## 7. Source Control — SVN

| # | Tính năng | VS Code | Honey-badger |
|---|-----------|---------|--------------|
| 105 | SVN built-in | ❌ (cần extension) | ➕ **Đầy đủ** — update, commit, log, merge, conflict, blame |
| 106 | SVN + Git hybrid folder | — | ➕ `SvnFileTable` + Git staging |

---

## 8. Diff & Merge

| # | Tính năng VS Code | Honey-badger | Ghi chú |
|---|-------------------|--------------|---------|
| 107 | Side-by-side diff | ✅ | `CodeDiffViewer.tsx` + tab compare trong editor |
| 108 | Inline diff | ✅ | |
| 109 | Stage/unstage từ diff | ✅ | Git staging modes |
| 110 | Navigate change (`F7`) | ✅ | |
| 111 | Blame gutter | ✅ | `useDiffViewerBlame.ts` |
| 112 | 3-way merge / conflict | ✅ | `GitConflictDiffView`, `ConflictEditor` |
| 113 | Binary/image diff | ✅ | `BinaryDiffPanel.tsx` |
| 114 | Minimap / collapse unchanged | ✅ | |
| 115 | Compare workspace files (explorer) | ✅ | Tab editor `a.ts ↔ b.ts`; không mở cửa sổ diff riêng |

---

## 9. Terminal

| # | Tính năng VS Code | Honey-badger | Ghi chú |
|---|-------------------|--------------|---------|
| 116 | Integrated terminal | ✅ | `IntegratedTerminalPanel.tsx`, node-pty |
| 117 | Multiple tabs | ✅ | |
| 118 | Shell profiles (pwsh/cmd/PowerShell) | ✅ | |
| 119 | Terminal settings UI | ✅ | Font, theme, cursor… |
| 120 | Split terminal | ❌ | |
| 121 | Shell integration (cwd, command status) | ❌ | |
| 122 | Run selection in terminal | ❌ | |
| 123 | `Ctrl+`` toggle | ✅ | VCS + Editor |

---

## 10. Debug & Test

| # | Tính năng VS Code | Honey-badger | Ghi chú |
|---|-------------------|--------------|---------|
| 124 | Run and Debug view | ❌ | |
| 125 | Breakpoints | ❌ | |
| 126 | Debug console | ❌ | |
| 127 | `launch.json` | ❌ | |
| 128 | Test Explorer / run tests in IDE | ❌ | |
| 129 | Playwright test automation | ➕ | Tab **Automation** |
| 130 | SpotBugs / coding rules | ➕ | Cửa sổ riêng + pre-commit pipeline |

---

## 11. Tasks, Build, Extensions

| # | Tính năng VS Code | Honey-badger | Ghi chú |
|---|-------------------|--------------|---------|
| 131 | Tasks (`tasks.json`) | ❌ | |
| 132 | NPM scripts panel | ❌ | |
| 133 | Extension Marketplace | ❌ | |
| 134 | MCP servers (agent mode) | ❌ | VS Code 1.99+ |
| 135 | Dev Pipelines (visual CI) | ➕ | `DevPipelinesPage.tsx` |
| 136 | Commit workflow quality gates | ➕ | Rules + SpotBugs + Playwright |

---

## 12. AI & Chat

| # | Tính năng VS Code | Honey-badger | Ghi chú |
|---|-------------------|--------------|---------|
| 137 | Copilot inline complete | ❌ | |
| 138 | Chat / Agent mode | ❌ | |
| 139 | AI commit message | ➕ | |
| 140 | AI Show Log analysis | ➕ | |
| 141 | AI automation (generate/repair tests) | ➕ | |
| 142 | BYOK multi-provider (OpenAI/Claude/Google) | 🟡 | Settings API keys; không chat editor |

---

## 13. Settings, Theme, i18n

| # | Tính năng VS Code | Honey-badger | Ghi chú |
|---|-------------------|--------------|---------|
| 143 | Settings GUI (`Ctrl+,`) | 🟡 | `SettingsDialog.tsx` + `EditorSettingsDialog.tsx` |
| 144 | Keyboard shortcuts editor | ❌ | |
| 145 | Color themes | ✅ | 12 theme (`useAppearanceStore.ts`) |
| 146 | Light/Dark/System | ✅ | |
| 147 | Font family/size (app) | ✅ | |
| 148 | i18n | ✅ | en / vi / ja |
| 149 | Config export/import | ➕ | Backup toàn app |

---

## 14. Remote & Collaboration

| # | Tính năng VS Code | Honey-badger | Ghi chú |
|---|-------------------|--------------|---------|
| 150 | Remote SSH / WSL / Containers | ❌ | |
| 151 | Live Share | ❌ | |
| 152 | GitHub Codespaces | ❌ | |

---

## 15. Tính năng honey-badger không có trong VS Code

| # | Tính năng | Mô tả ngắn |
|---|-----------|------------|
| 153 | Task Management | Gantt, board, workload, Redmine import |
| 154 | EVM Tool | Earned Value, WBS, AC ledger |
| 155 | Progress / Team Progress | Heatmap, daily report |
| 156 | Report Manager (PL) | Báo cáo PL |
| 157 | Achievements / Leaderboard | Gamification |
| 158 | Holiday calendar VN/JP | TitleBar |
| 159 | MS Teams webhook / mail | Integrations |
| 160 | Auto-updater | Electron updater |
| 161 | Master admin | Users, projects, coding rules |

---

## Tóm tắt theo mức độ ưu tiên (Editor gần VS Code hơn)

> Cập nhật sau khi hoàn thiện LSP (CodeLens, Inlay hints, Quick Fix, organize imports).

| Ưu tiên | Thiếu quan trọng nhất | Đã có (không cần làm lại) |
|---------|------------------------|---------------------------|
| **Cao** | Command Palette (`Ctrl+Shift+P`), Problems panel, shortcut **F12** / **Shift+F12** / **F2** rename symbol, Go to Symbol (`Ctrl+Shift+O`), Outline view | Code Actions, CodeLens, Inlay hints, organize imports (**Shift+Alt+O**), search replace + globs, compare tab, explorer CRUD |
| **Trung bình** | Peek Definition/References, workspace symbol (`Ctrl+T`), split editor, drag & drop explorer, `files.exclude` / `.gitignore` filter | Signature help, hover, definition/references **providers** (chỉ thiếu shortcut/UI) |
| **Thấp** | Debug, Extensions marketplace, Remote, Copilot-style AI inline | — |

**Không nên ưu tiên** (ngoài scope VCS + team workflow): Debug view, `launch.json`, Extension Marketplace, Remote SSH, inline Copilot.

## Kết luận

| Lĩnh vực | So với VS Code |
|----------|----------------|
| Git / SVN / Diff / Terminal | **Bằng hoặc vượt** (đặc biệt SVN, team workflow, quality gates) |
| Editor / Explorer / Compare tab | **Gần VS Code** — CRUD file, multi-select, compare tab, undo file ops, search replace |
| Editor / LSP (TS·JS·Java) | **Cơ bản đủ dùng** — completion, diagnostics, Quick Fix, CodeLens, inlay hints, organize imports; thiếu shortcuts + Problems panel + symbol nav |
| Debug / Extensions | **Chưa có** — không phải trọng tâm sản phẩm |
| Team & enterprise (Tasks, EVM, PR, Automation) | **Vượt trội** — ngoài phạm vi VS Code thuần |

---

## Lịch sử thay đổi gần đây (Editor)

| Thay đổi | Mô tả |
|----------|-------|
| **Explorer CRUD** | Tạo file/folder (inline phantom row), đổi tên inline (F2), xóa có confirm (`ExplorerDeleteConfirmDialog`) |
| **Explorer clipboard** | Cut / Copy / Paste nhiều mục; cut làm mờ item; guard paste vào self/descendant |
| **Explorer multi-select** | `Ctrl+click` toggle, `Shift+click` range, `Shift+↑/↓`, `Ctrl+A`; context menu theo selection |
| **Compare Selected** | Chọn 2 file → tab diff trong editor (`EditorComparePane`, label `a ↔ b`); không mở diff window |
| **Explorer context menu** | Cấu trúc giống VS Code (folder vs file vs multi); bỏ Open to Side / Open in Browser / Open With |
| **Open in Terminal** | Từ explorer, mở terminal tại thư mục file/folder |
| **Undo / Redo file ops** | `Ctrl+Z` / `Ctrl+Y` cho rename, create, delete, move, copy-paste (`explorerUndoStack.ts`) |
| **Tab sync** | Rename/delete explorer đóng hoặc cập nhật tab editor tương ứng |
| **Search replace** | Replace All / per-file; include/exclude globs (comma-separated, VS Code rules) |
| **LSP — CodeLens, Inlay hints, Quick Fix** | Providers + `codeAction/resolve`, `completionItem/resolve`; CodeLens click qua `workspace/executeCommand` |
| **LSP — Organize imports** | **Shift+Alt+O** + toast; `ensureDocumentReady` đợi server |
| **LSP — Diagnostics** | Map severity LSP → Monaco đúng; workspace edit hỗ trợ create/rename/delete file |
| **Editor settings** | Toggle CodeLens, Inlay hints trong `EditorSettingsDialog.tsx` |
| Performance | Text trong Monaco, không lưu content vào Zustand mỗi keystroke |
| LSP lazy | Kích hoạt sau **~1.5s idle** trong file TS/JS/Java (`LSP_IDLE_MS = 1500`) |
| File watcher | Bật khi production; tắt khi `pnpm dev` |

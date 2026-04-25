## 📝 Changelog / 変更履歴 / Thay đổi

### English (en)
**feat: add commit review tracking, AI analysis history, and enhance Git/SVN workflows**

- Add PL review marking, filtering, reminder, and statistics in Show Log
- Add Redmine issue link opening from commit messages via system IPC external URL support
- Add AI analysis history saving/browsing and enable safe HTML rendering for AI analysis output (rehype-raw)
- Unify IndexedDB into a centralized module and migrate commit message history, AI analysis, AI analysis history, and commit review stores
- Enhance Git branches with upstream ahead/behind tracking and display tracking info in the UI
- Improve Git diff handling by skipping deleted files safely and returning deleted paths when no diff is available
- Speed up Git log file statistics by switching to parallel name-status/numstat parsing and reducing per-file commands
- Update Git/SVN commit flow to send email/Teams notifications with added/modified/deleted summaries and coding rule/SpotBugs check flags, removing violations injection
- Prevent duplicate Git/SVN update notifications by tracking last notified revision/commit and resetting state after sync
- Refine SVN merge revision range parsing to avoid invalid defaults and better handle empty/partial ranges
- Replace console logging with structured logging across main/renderer and adjust UI copy/toolbars, bump version to 1.0.6, and remove obsolete files/services

---

### Japanese (ja)
**feat: コミットレビュー追跡、AI 分析履歴を追加し、Git/SVN ワークフローを強化**

- Show Log に PL レビューマーキング、フィルタリング、リマインダー、統計を追加
- システム IPC 外部 URL サポート経由でコミットメッセージから Redmine 課題リンクを開く機能を追加
- AI 分析履歴の保存/閲覧を追加し、AI 分析出力での安全な HTML レンダリングを有効化 (rehype-raw)
- IndexedDB を一元化モジュールに統合し、コミットメッセージ履歴、AI 分析、AI 分析履歴、コミットレビューストアを移行
- Git ブランチを上流の ahead/behind 追跡で強化し、UI に追跡情報を表示
- 削除済みファイルを安全にスキップし、diff が利用できない場合は削除されたパスを返すことで Git diff 処理を改善
- 並列 name-status/numstat 解析への切り替えとファイル毎のコマンド削減により Git ログファイル統計を高速化
- Git/SVN コミットフローを更新し、追加/変更/削除サマリーとコーディングルール/SpotBugs チェックフラグ付きでメール/Teams 通知を送信、違反インジェクションを削除
- 最後に通知されたリビジョン/コミットを追跡し、同期後に状態をリセットすることで Git/SVN 重複更新通知を防止
- 無効なデフォルトを回避し、空/部分範囲をより適切に処理するよう SVN マージリビジョン範囲の解析を改良
- main/renderer 全体でコンソールログを構造化ロギングに置換し、UI コピー/ツールバーを調整、バージョンを 1.0.6 にアップ、廃止ファイル/サービスを削除

---

### Vietnamese (vi)
**feat: thêm theo dõi commit review, lịch sử phân tích AI và nâng cấp quy trình Git/SVN**

- Thêm đánh dấu, lọc, nhắc nhở và thống kê PL review trong Show Log
- Thêm tính năng mở link Redmine issue từ commit message qua hỗ trợ system IPC external URL
- Thêm lưu/duyệt lịch sử phân tích AI và kích hoạt render HTML an toàn cho kết quả phân tích AI (rehype-raw)
- Hợp nhất IndexedDB thành module tập trung và di chuyển các store: commit message history, AI analysis, AI analysis history và commit review
- Nâng cấp Git branches với theo dõi upstream ahead/behind và hiển thị thông tin tracking trong UI
- Cải thiện xử lý Git diff bằng cách bỏ qua file đã xóa an toàn và trả về đường dẫn đã xóa khi không có diff
- Tăng tốc thống kê file Git log bằng cách chuyển sang phân tích song song name-status/numstat và giảm lệnh cho từng file
- Cập nhật quy trình commit Git/SVN để gửi thông báo email/Teams với tóm tắt added/modified/deleted và cờ kiểm tra coding rule/SpotBugs, xóa bỏ violations injection
- Ngăn chặn thông báo cập nhật Git/SVN trùng lặp bằng cách theo dõi revision/commit đã thông báo lần cuối và reset trạng thái sau khi đồng bộ
- Tinh chỉnh phân tích phạm vi revision merge SVN để tránh giá trị mặc định không hợp lệ và xử lý tốt hơn các phạm vi rỗng/một phần
- Thay thế console logging bằng structured logging trên main/renderer và điều chỉnh UI copy/thanh công cụ, nâng phiên bản lên 1.0.6 và xóa các file/service lỗi thời
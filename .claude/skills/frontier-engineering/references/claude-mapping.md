# Ánh xạ nguyên tắc sang công cụ Claude

Đối chiếu ngày 2026-10-28 với tài liệu Claude Code và Claude Platform (S9–S12 trong [sources.md](sources.md)). Tên lệnh, cờ và mặc định có thể đổi theo phiên bản; kiểm tra tài liệu hiện hành trước khi đưa lệnh cụ thể cho người dùng. Mỗi môi trường (Claude Code, claude.ai, API) có bộ công cụ khác nhau, nên chỉ dùng những gì phiên hiện tại thực sự có.

## Mục lục

1. Đặt quy tắc ở đâu
2. Kiểm tra Claude tự chạy được
3. Subagent: khi nào đáng
4. Viết prompt giao việc cho Claude
5. Chạy không có người giám sát
6. Mẹo cũ nên bỏ

## 1. Đặt quy tắc ở đâu

Có hai loại chỉ dẫn. Hướng dẫn (prompt, CLAUDE.md, skill) được Claude đọc rồi tự quyết có áp hay không, nên có thể có ngoại lệ hợp lý. Bảo đảm (hook, deny rule, sandbox, managed settings) do harness thực thi mỗi lần, bất kể model nghĩ gì. Chọn theo câu hỏi: quy tắc này có được phép ngoại lệ không?

| Cần gì | Đặt ở | Ghi chú |
| --- | --- | --- |
| Lệnh test/typecheck/lint, chỗ code dễ gây hiểu lầm, quyết định không có trong repo, điều đã phải sửa hai lần | `CLAUDE.md` | Giữ ngắn (tài liệu khuyên dưới khoảng 200 dòng). Bỏ những gì Claude tự đọc ra từ code. Sở thích cá nhân vào `CLAUDE.local.md` và gitignore. |
| Quy tắc chỉ áp cho một vùng code | `.claude/rules/*.md` có `paths:` | Chỉ nạp khi Claude làm việc ở vùng đó. |
| Quy trình hoặc tri thức của nhóm (release, runbook, cách viết docs) | Skill tại `.claude/skills/<name>/SKILL.md` | Mọi phiên chỉ thấy tên và mô tả; nội dung nạp khi cần. Quy trình có tác dụng phụ thêm `disable-model-invocation: true` để chỉ người dùng gọi được. |
| Việc luôn phải xảy ra hoặc không bao giờ được xảy ra | Hook (ví dụ Stop hook chạy typecheck), deny rule, sandbox, managed settings | Một dòng CLAUDE.md vẫn bị bỏ qua dù đã nhấn mạnh là dấu hiệu nó thuộc về đây. Ngược lại, hook cho thứ chỉ là sở thích thì nên xóa. |
| Hệ thống ngoài repo (issue tracker, dashboard lỗi) | CLI sẵn có (như `gh`) hoặc MCP server | MCP server không dùng vẫn chiếm ngữ cảnh, nên tắt bớt. |

Trước khi ghi một dòng cho Claude, hỏi: Claude có tìm được điều này khi đọc code không, và nó có thực sự đi tìm không? Cả hai đều có thì bỏ.

Thay đổi cấu hình lâu dài (settings, hook, permission) chỉ thực hiện khi người dùng đồng ý.

## 2. Kiểm tra Claude tự chạy được

Claude dừng khi việc trông đã xong. Có một kiểm tra trả về pass/fail thì Claude tự khép vòng: sửa, chạy, đọc lỗi, sửa tiếp. Ví dụ: file test, exit code của build, linter, script so đầu ra với fixture, ảnh chụp trình duyệt đặt cạnh mockup.

Mức ràng buộc từ mềm đến cứng:
- Trong prompt: "chạy test auth sau khi sửa và tiếp tục đến khi pass".
- Điều kiện mục tiêu (`/goal` trong Claude Code), hữu ích cho lần chạy nền dài.
- Stop hook: harness không cho kết thúc lượt khi script chưa pass.
- Reviewer chưa thấy quá trình viết: `/code-review`, subagent chỉ đọc, hoặc một phiên thứ hai.

`/verify` cho Claude build, chạy app và nhìn kết quả, bắt được loại lỗi mà test và typecheck bỏ sót. Dù dùng cách nào, đòi bằng chứng: lệnh và đầu ra, hoặc ảnh chụp.

Tài liệu prompting ghi Claude Opus 5 tự kiểm chứng tốt mà không cần nhắc, và chỉ dẫn kiểm chứng chép từ prompt cũ dễ gây kiểm chứng quá mức. Cung cấp một kiểm tra cụ thể thay vì một lời nhắc "hãy kiểm tra kỹ".

## 3. Subagent: khi nào đáng

Đáng dùng khi:
- chạy song song các phần việc độc lập;
- giữ đầu ra dài (toàn bộ test, tìm kiếm rộng) khỏi ngữ cảnh chính;
- cần reviewer chưa thấy lập luận tạo ra code;
- cần giới hạn công cụ, ví dụ agent chỉ có `Read, Grep, Glob`.

Không đáng với việc đơn giản, tuần tự, sửa một file hay một lệnh grep. Giao cùng việc cho subagent cùng model không làm câu trả lời tốt hơn, và subagent phải tự thu thập lại ngữ cảnh nên có thể chậm hơn làm trực tiếp.

Giảm chi phí: model nhỏ (Haiku) cho việc đơn giản; yêu cầu tóm tắt ngắn; định nghĩa reviewer chỉ đọc trong `.claude/agents/` để giới hạn do harness thực thi chứ không chỉ do prompt yêu cầu.

## 4. Viết prompt giao việc cho Claude

- Coi Claude như đồng nghiệp giỏi nhưng chưa có ngữ cảnh: nêu file, triệu chứng và "xong" trông thế nào. Đưa thẳng thứ đã có (file, ảnh chụp, log) thay vì mô tả lại.
- Giải thích lý do thay vì ra lệnh cứng; Claude khái quát hóa từ lý do tốt hơn từ mệnh lệnh. Viết điều cần làm thay vì chỉ liệt kê điều cấm.
- Model hiện tại làm theo chỉ dẫn khá sát nghĩa. Bỏ kiểu nhấn mạnh "CRITICAL: You MUST...", vì nó dễ làm Claude áp quá tay; viết thường là đủ.
- Nói rõ phạm vi, vì Claude thường đọc yêu cầu theo hướng tối thiểu. Muốn bản đầy đủ thì liệt kê phần cần có (có thể kèm "be ambitious"). Muốn tối thiểu thì ghi "không thêm tính năng, abstraction hay file ngoài yêu cầu".
- Muốn Claude làm chứ không chỉ gợi ý thì dùng động từ hành động ("sửa hàm này"), không hỏi "có thể gợi ý...".
- Có sở thích giữa hai cách đều hợp lý thì nói trước; Claude không đọc được điều đó từ code.
- Dữ liệu dài đi kèm chỉ dẫn: bọc bằng thẻ XML nhất quán (`<context>`, `<instructions>`, `<input>`), đặt dữ liệu phía trên và câu hỏi ở cuối.
- Độ sâu suy nghĩ do mức effort điều khiển, không do câu "think hard". Trong Claude Code, một lượt khó riêng lẻ có thể dùng `ultrathink`.
- Chưa rõ mình muốn gì: bảo Claude phỏng vấn đến khi viết được spec (ví dụ ra `SPEC.md`), rồi mở phiên mới để build từ spec đó.
- Prompt cho subagent phải tự đủ vì nó không thấy hội thoại: mục tiêu, đường dẫn, ràng buộc, định dạng và độ dài báo cáo.

Khi Claude đi lệch hai lần liên tiếp trong cùng phiên, một prompt mới gộp những gì đã học (sau `/clear` trong Claude Code) thường hiệu quả hơn lần sửa thứ ba chồng lên hai lần thất bại.

## 5. Chạy không có người giám sát

Trước khi để Claude chạy một mình (`claude -p`, scheduled task, CI), trả lời năm câu cho đúng tác vụ đó:

1. Xong trông thế nào? Một điều kiện mục tiêu, một file spec, hoặc một test đang fail cần chuyển xanh.
2. Tự kiểm tra bằng gì? Bộ test, Stop hook, bước review.
3. Được chạm vào đâu? Permission rules, `--allowedTools` kèm chế độ `dontAsk`, sandbox, worktree, nhánh duy nhất được push.
4. Cái gì làm nó dừng? `--max-turns`, `--max-budget-usd`, giới hạn chi tiêu.
5. Kết quả đi đâu và ai duyệt? PR, comment hoặc bản tóm tắt; một người duyệt merge, deploy hay bất cứ việc gì không đảo ngược được.

Thử trên vài mẫu trước, sửa prompt, rồi mới chạy toàn bộ. Theo dõi vài lần chạy đầu của scheduled task mới, và bảo vệ nhánh chính bằng branch rule mà task không vượt qua được.

## 6. Mẹo cũ nên bỏ

| Mẹo cũ | Vì sao bỏ |
| --- | --- |
| Viết hoa, thêm IMPORTANT để Claude không bỏ sót | Model hiện tại theo câu viết thường; nhấn mạnh dễ làm áp quá tay. Quy tắc cứng chuyển thành hook hoặc deny rule; dòng bị lạc nghĩa là file quá dài. |
| "Đừng lười", "lặp đến khi xong" | Model đã tự đi hết việc đã thống nhất; câu này dễ gây làm quá. Đưa một kiểm tra pass/fail thay thế. |
| "think hard", "be thorough" | Mức effort mới là nút điều khiển; các câu này chỉ là văn bản thường. |
| Dùng subagent để có câu trả lời tốt hơn hoặc để tiết kiệm ngữ cảnh | Cùng model không thông minh hơn; ngữ cảnh hiện lớn và tự nén. Subagent vẫn tốt cho song song, cô lập đầu ra và review độc lập. |
| Mô tả kiến trúc và cấu trúc thư mục trong CLAUDE.md | Claude tự đọc repo; chỉ ghi điều không có trong repo. |
| Thêm "hãy tự kiểm tra kỹ trước khi kết thúc" vào mọi prompt | Với model mới dễ gây kiểm chứng thừa; đưa kiểm tra cụ thể thay vì lời nhắc chung. |

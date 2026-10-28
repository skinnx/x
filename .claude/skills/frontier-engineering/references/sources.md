# Nguồn và giới hạn diễn giải

Nguồn S1–S4 đối chiếu ngày 2026-10-27; S5–S8 ngày 2026-10-28; S9–S12 (tài liệu chính chủ về Claude) đối chiếu ngày 2026-10-28 khi chuyển skill sang Claude. Dùng nguồn chính chủ và ghi rõ phần tuyển tập biên soạn; các tóm tắt dưới đây là diễn giải. Không coi uy tín tổ chức là bằng chứng cho mọi bối cảnh. Không có tuyên bố các tổ chức bảo trợ skill.

## Mục lục

- S1 Amp Labs: Software after Software
- S2 OpenAI: Harness engineering
- S3 Anthropic: Building effective agents
- S4 Google DeepMind: AlphaEvolve
- S5 Mario Zechner / Pi: Thoughts on slowing the fuck down
- S6 Tuyển tập lopopolo/harness-engineering
- S7 Claude.dev: How the Claude Code team does code review
- S8 Claude.dev: The new rules of context engineering for Claude 5 generation models
- S9 Claude Code docs: Best practices for Claude Code
- S10 Claude Platform docs: Prompting best practices
- S11 Anthropic Engineering: Effective context engineering for AI agents
- S12 Claude Platform docs: Skill authoring best practices
- Bản đồ quy tắc

## S1 — Amp Labs: Software after Software

- URL: https://amplabs.com/
- Loại: tuyên ngôn; trang không hiển thị ngày xuất bản.
- Phạm vi liên quan: mục 3–6, 9–12.
- Ý chính: chuyển đơn vị công việc sang mục tiêu giao cho agent; coi trọng phán đoán và kết quả; xem lại nghi thức cũ; thử nghiệm cách làm mới.
- Giới hạn: việc model gần hoàn hảo, review phai nhạt và giá trị code suy giảm là dự báo/quan điểm, không phải bằng chứng thực nghiệm phổ quát. Nhịp tám tuần ở mục 2.5 là đề xuất của Amp.
- Vận dụng: trao quyền chọn cách làm; không biến dự báo thành lý do bỏ kiểm chứng.

## S2 — OpenAI: Harness engineering: leveraging Codex in an agent-first world

- URL: https://openai.com/index/harness-engineering/
- Tác giả: Ryan Lopopolo. Ngày: 2026-02-11.
- Loại: kinh nghiệm một dự án beta nội bộ.
- Phần liên quan: Redefining the role of the engineer; Increasing application legibility; We made repository knowledge the system of record.
- Ý chính: người định hướng, agent thực thi; khả năng quan sát và môi trường làm việc quyết định hiệu quả; tài liệu ngắn dẫn tới nguồn sâu hơn giúp agent tiếp cận tri thức.
- Giới hạn: kết quả của nhóm đó không chứng minh mọi repo có thể bỏ người review. Bài vẫn mô tả review bằng agent và vòng phản hồi. Bài viết về Codex; khi áp cho Claude, đối chiếu với S9.
- Vận dụng: sửa môi trường thiếu năng lực trước khi chỉ tăng độ dài prompt.

## S3 — Anthropic: Building effective agents

- URL: https://www.anthropic.com/research/building-effective-agents
- Ngày: 2024-12-19.
- Loại: kinh nghiệm triển khai và hướng dẫn kiến trúc.
- Phần liên quan: When (and when not) to use agents; When and how to use frameworks; Parallelization.
- Ý chính: chọn giải pháp đơn giản; thêm phức tạp khi có nhu cầu; cân nhắc chi phí và độ trễ; dùng workflow cho đường đi xác định và agent cho tính linh hoạt.
- Giới hạn: trang hiện có chú thích tooling đã thay đổi và trỏ tới Managed Agents; không dùng bài để chọn SDK/model hiện tại.
- Vận dụng: một agent trước; không biến "agent-first" thành "mọi thứ phải là agent".

## S4 — Google DeepMind: AlphaEvolve: A Gemini-powered coding agent for designing advanced algorithms

- URL: https://deepmind.google/blog/alphaevolve-a-gemini-powered-coding-agent-for-designing-advanced-algorithms/
- Tác giả: AlphaEvolve team. Ngày: 2025-05-14.
- Loại: giới thiệu hệ thống và ứng dụng nghiên cứu.
- Phần liên quan: Designing better algorithms with large language models.
- Ý chính: tạo ứng viên, chạy evaluator, dùng phản hồi để cải thiện; phù hợp với miền đo tiến bộ rõ ràng.
- Giới hạn: kết quả tối ưu thuật toán không chứng minh evaluator tự động đánh giá đầy đủ UX, nhu cầu thị trường hoặc mọi tính đúng đắn của sản phẩm.
- Vận dụng: chọn thước đo và kiểm tra đúng/sai trước khi mở rộng thử nghiệm; phân biệt điểm proxy với mục tiêu thực.

## S5 — Mario Zechner / Pi: Thoughts on slowing the fuck down

- URL: https://mariozechner.at/posts/2026-03-25-thoughts-on-slowing-the-fuck-down/
- Ngày: 2026-03-25. Loại: quan điểm và kinh nghiệm tác giả Pi, không phải nghiên cứu của lab.
- Phần liên quan: Agentic search has low recall; Merchants of learned complexity.
- Ý chính: bỏ sót code hiện hữu có thể dẫn tới trùng lặp và quyết định cục bộ làm tăng độ phức tạp.
- Vận dụng: tìm implementation, nơi gọi và quy ước trước khi thêm mới. Không suy rằng phải đọc toàn bộ repo hoặc cấm agent tự triển khai.

## S6 — Tuyển tập lopopolo/harness-engineering

- Proof: https://github.com/lopopolo/harness-engineering/blob/trunk/docs/proof/README.md
- Feedback: https://github.com/lopopolo/harness-engineering/blob/trunk/docs/feedback/README.md
- Xuất xứ playbook: https://github.com/lopopolo/harness-engineering/blob/trunk/playbooks/README.md
- Loại: tuyển tập và diễn giải có dẫn nguồn; không gán toàn bộ nội dung cho quy trình OpenAI đã kiểm chứng. Repo ghi playbook là tổng hợp biên soạn, không phải playbook Ryan trực tiếp xuất bản.
- Ý chính: bằng chứng phải khớp lời tuyên bố; chuyển sửa sai lặp lại thành cải tiến tại nơi sở hữu nguyên nhân; review cần hội tụ.
- Vận dụng: kiểm tra kết quả tại ranh giới người dùng và đặt bài học đúng code, tool, test hoặc tài liệu. Không mở rộng sửa toàn repo chỉ vì tìm thấy một lỗi.

## S7 — Claude.dev: How the Claude Code team does code review

- URL: https://claude.dev/blog/solving-code-review-at-anthropic/
- Tác giả: Addy Osmani, Morgan Westlee Lunt, Qing Wang. Ngày: 2026-10-15.
- Loại: kinh nghiệm đội Claude Code.
- Ý chính: finding cần bằng chứng; phân biệt lỗi mới/có sẵn; giảm cảnh báo nhiễu và vòng review; tránh lặp finding, tập trung diff khi review lại.
- Vận dụng: sửa, phản biện hoặc hoãn có lý do; dừng khi không còn vấn đề có tác động chưa xử lý. Không áp cứng giới hạn ba vòng hay toàn bộ cơ chế review của họ lên mọi tác vụ.

## S8 — Claude.dev: The new rules of context engineering for Claude 5 generation models

- URL: https://claude.dev/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models/
- Tác giả: Thariq Shihipar. Ngày: 2026-07-24.
- Loại: kinh nghiệm theo thế hệ model; không phải quy luật bất biến.
- Ý chính: giảm chỉ dẫn trùng và mâu thuẫn; giữ thông tin đặc thù; tải hướng dẫn chi tiết khi cần.
- Vận dụng: khi được giao sửa skill, gộp hoặc bỏ phần thừa trước khi thêm quy tắc. Không tự sửa hướng dẫn hay bỏ ràng buộc bắt buộc của phiên.

## S9 — Claude Code docs: Best practices for Claude Code

- URL: https://code.claude.com/docs/en/best-practices (địa chỉ cũ anthropic.com/engineering/claude-code-best-practices chuyển hướng tới đây).
- Loại: tài liệu sản phẩm chính chủ, trang được cập nhật liên tục, không ghi ngày.
- Phần liên quan: Deterministic and non-deterministic instructions; Tell Claude what it can't see; Keep CLAUDE.md short; Give Claude a check to run; Enforce the rules that can't have exceptions; Know what subagents cost; Let Claude run without you; What you can stop doing.
- Ý chính: chỉ ghi điều Claude không tự tìm được trong repo; CLAUDE.md ngắn; đưa Claude một kiểm tra pass/fail và đòi bằng chứng; quy tắc không có ngoại lệ thuộc về hook, deny rule hoặc sandbox chứ không phải câu nhấn mạnh; subagent đáng khi song song, cô lập đầu ra dài hoặc review độc lập, còn cùng model thì không cho câu trả lời tốt hơn; reviewer được bảo tìm lỗi luôn tìm ra thứ gì đó nên cần "skip style"; chạy tự động cần định nghĩa xong, kiểm tra, phạm vi, giới hạn và người duyệt; bỏ mẹo cũ như viết hoa, "think hard", "đừng lười".
- Giới hạn: lệnh, cờ và mặc định (auto mode, effort, `/goal`, `/verify`, `--max-budget-usd`) là của Claude Code tại thời điểm đối chiếu và có thể đổi; không áp cho claude.ai hay API khi không có tính năng tương ứng.
- Vận dụng: mục 3–5 của SKILL.md và toàn bộ claude-mapping.md.

## S10 — Claude Platform docs: Prompting best practices

- URL: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
- Loại: tài liệu chính chủ, trang được cập nhật liên tục; tại thời điểm đối chiếu áp cho các model Claude thế hệ 4.5 đến 5.x.
- Ý chính: rõ ràng, có ngữ cảnh và lý do; model mới làm theo sát nghĩa nên giảm từ ngữ gay gắt; viết điều cần làm thay vì điều cấm; tránh overengineering (tính năng, abstraction, file ngoài yêu cầu); test kiểm chứng tính đúng chứ không định nghĩa lời giải, không hard-code; dùng subagent có chừng mực; Claude Opus 5 tự kiểm chứng tốt và chỉ dẫn kiểm chứng chép từ prompt cũ có thể gây kiểm chứng quá mức.
- Giới hạn: một số kỹ thuật gắn với model cụ thể; trang khuyên kiểm lại bằng eval trước khi áp sang model khác.
- Vận dụng: mục 2 và 4 của SKILL.md, khung prompt, mục 4 và 6 của claude-mapping.md.

## S11 — Anthropic Engineering: Effective context engineering for AI agents

- URL: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- Tác giả: Prithvi Rajasekaran, Ethan Dixon, Carly Ryan, Jeremy Hadfield (Applied AI, Anthropic). Ngày: 2025-09-29.
- Loại: hướng dẫn kiến trúc chung.
- Ý chính: prompt ở "độ cao vừa phải", tránh cả logic cứng lẫn hướng dẫn mơ hồ; bắt đầu tối thiểu rồi thêm chỉ dẫn theo lỗi quan sát được; giữ tham chiếu nhẹ (đường dẫn, link) và nạp khi cần; subagent làm việc trong ngữ cảnh sạch và trả tóm tắt cô đọng.
- Giới hạn: không nêu chi tiết chi phí phối hợp multi-agent; chọn cách quản lý ngữ cảnh tùy loại tác vụ.
- Vận dụng: giữ đường dẫn tới nguồn chuẩn thay vì nạp hết; chỉ thêm chỉ dẫn khi có lỗi đã quan sát.

## S12 — Claude Platform docs: Skill authoring best practices

- URL: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
- Loại: tài liệu chính chủ về viết Agent Skills.
- Ý chính: ngắn gọn và giả định Claude đã giỏi; description nêu skill làm gì và khi nào dùng (tối đa 1024 ký tự); SKILL.md dưới 500 dòng; tham chiếu chỉ một tầng từ SKILL.md; file tham chiếu dài có mục lục; tránh thông tin nhạy thời gian; thử skill trên các model sẽ dùng.
- Vận dụng: cấu trúc của chính skill này; mục 5 của SKILL.md khi được giao sửa skill.

## Bản đồ quy tắc

| Quy tắc của skill | Căn cứ | Tính chất |
| --- | --- | --- |
| Giao mục tiêu, giữ quyền chọn implementation | S1, S2 | Tổng hợp vận dụng |
| Giảm nghi thức, giải pháp đơn giản trước | S1, S3 | Tổng hợp có điều kiện |
| Giữ đúng phạm vi: không thêm tính năng/abstraction ngoài yêu cầu, nhưng làm đủ khi được yêu cầu bản đầy đủ | S9, S10 | Hướng dẫn chính chủ cho Claude |
| Cung cấp nguồn chuẩn và đầu ra quan sát được | S2, S11 | Vận dụng kinh nghiệm và hướng dẫn chung |
| Chỉ ghi điều Claude không tự tìm được; CLAUDE.md ngắn | S9, S8 | Hướng dẫn chính chủ cho Claude |
| Quy tắc không ngoại lệ đặt ở hook/deny rule/sandbox, không ở câu nhấn mạnh | S9 | Hướng dẫn chính chủ cho Claude Code |
| Đánh giá kết quả bằng phản hồi phù hợp | S2, S4 | Tổng hợp; không đồng nhất các miền |
| Đưa kiểm tra pass/fail và báo bằng chứng cụ thể | S9, S6 | Tổng hợp vận dụng |
| Kiểm chứng tương xứng, tránh kiểm chứng thừa | S10 + thiết kế skill | Một phần dựa trên ghi chú về Opus 5 |
| Không hard-code, không sửa test để qua | S10 | Hướng dẫn chính chủ cho Claude |
| Mặc định làm trực tiếp; subagent khi song song, cô lập đầu ra hoặc review độc lập | S3, S9, S10 | Tổng hợp; giới hạn spawn của môi trường luôn ưu tiên |
| Kiểm tra theo tác động; không chạy lại vô ích | Thiết kế skill | Không gán cho lab nào |
| Bỏ scaffolding sau thử nghiệm đại diện | S1 đối chiếu S2–S4 | Đề xuất của skill, không phải đồng thuận |
| Tìm implementation và nơi gọi trước khi tạo mới | S5 | Vận dụng có giới hạn phạm vi |
| Bằng chứng khớp kết quả đã hứa | S6 | Tổng hợp vận dụng |
| Lỗi lặp lại được sửa tại nơi sở hữu nguyên nhân | S6, S7, S9 | Tổng hợp vận dụng |
| Review có bằng chứng, bỏ qua style, có điểm dừng | S6, S7, S9 | Không áp cứng số vòng |
| Prompt: nêu lý do, chỉ dẫn tích cực, bỏ viết hoa/"think hard"/"đừng lười" | S9, S10 | Hướng dẫn chính chủ cho Claude |
| Chạy tự động cần định nghĩa xong, kiểm tra, phạm vi, giới hạn, người duyệt | S9 | Hướng dẫn chính chủ cho Claude Code |
| Gộp/xóa chỉ dẫn thừa khi cập nhật skill | S8, S12 | Chỉ khi được giao cập nhật |
| Không tự mở rộng quyền, publish, lịch chạy hay hook | Thiết kế skill và quyền phiên làm việc | Ranh giới vận hành |

Không suy từ "AI viết nhiều code" sang "code luôn đúng"; từ "giảm nghi thức" sang "bỏ mọi quy trình"; từ "nhiều agent có thể nhanh" sang "luôn chạy song song"; từ "model tự kiểm chứng tốt" sang "không cần kiểm tra". Khi nguồn mâu thuẫn, trình bày điều kiện và ưu tiên bằng chứng trực tiếp của tác vụ hiện tại.

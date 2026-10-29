# Threadsmith

Công cụ soạn và lên lịch thread tự host cho **X, Bluesky, Mastodon, Threads, LinkedIn, Telegram và Discord**, thay thế Typefully và Postiz. Toàn bộ chạy trong **một tiến trình**, dữ liệu lưu trong **một file SQLite**, không cần tài khoản và chạy được trên localhost hoặc VPS.

Thay vì làm một ứng dụng lịch có gắn thêm AI, Threadsmith coi AI agent là người dùng ngang hàng với bạn. Mọi thao tác trên giao diện đều làm được qua REST và OpenAPI, MCP, CLI, webhooks, luồng sự kiện SSE và `llms.txt`. Claude Code còn dùng được Threadsmith qua một Agent Skill có sẵn. Ngoài ra có một copilot viết bài chạy bằng Claude hoặc bất kỳ model tương thích OpenAI nào, kể cả Ollama chạy local miễn phí.

> **Trạng thái.** Bản 0.2. Phần đăng lên cả 7 nền tảng đã được kiểm tra với máy chủ giả lập mô phỏng theo tài liệu API chính thức (đăng thread nối tiếp, upload ảnh, lỗi giữa chừng rồi đăng tiếp phần còn lại). Phần này **chưa** được chạy với tài khoản thật trên bất kỳ nền tảng nào vì lúc xây dựng chưa có thông tin đăng nhập. Xem thêm [Giới hạn](#giới-hạn-đã-biết).

---

## So với Postiz

| | Threadsmith | Postiz |
|---|---|---|
| Hạ tầng tự host | **1 tiến trình Node + 1 file SQLite** | Postgres + Redis + Temporal + nhiều service |
| Nền tảng | 7 (X, Bluesky, Mastodon, Threads, LinkedIn, Telegram, Discord) | ~30 |
| Agent điều khiển qua | REST + OpenAPI, MCP (19 tool), CLI `--json`, `llms.txt`, webhook ký HMAC, SSE, Agent Skill | REST, MCP (~9 tool), CLI |
| Đăng tiếp sau lỗi giữa thread | Có, theo từng kênh, không đăng trùng; bài đã lên bị khóa | — |
| Đếm ký tự | Theo luật từng nền tảng (X weighted, Bluesky grapheme, Mastodon URL=23, Threads emoji theo byte…) | Đếm chung |
| Phiên bản riêng cho từng kênh + AI "Adapt" | Có | Có (AI) |
| Không cần khóa X | Chế độ thủ công: nhắc giờ + sao chép | Cần kết nối |
| Chi phí X API | Ghi rõ ($0,015/bài, $0,20 nếu có link) | — |

Postiz hơn ở số nền tảng (Instagram, Facebook, TikTok, YouTube, Pinterest…), làm việc nhóm và analytics. Threadsmith chọn ít kênh hơn nhưng nhẹ, an toàn khi lỗi giữa chừng và dễ cho agent điều khiển hơn. Số liệu Postiz lấy từ các trang so sánh tháng 7–10/2026, hãy kiểm tra lại trên postiz.com.

## Tính năng

**Soạn bài**
- Mỗi bài trong thread là một thẻ riêng, có bộ đếm ký tự **theo đúng cách X tính**: chữ CJK và mỗi emoji tính 2, mỗi URL tính 23. Với tiếng Việt, X chỉ tính 2 cho các chữ thuộc khối Unicode *Latin Extended Additional* (ạ, ả, ấ, ầ, ẩ, ẫ, ậ, ặ, ẹ, ẻ, ẽ, ế, ệ, ỉ, ị, ọ, ỏ, ố, ộ, ớ, ợ, ụ, ủ, ứ, ừ, ữ, ự, ỳ, ỵ, ỷ, ỹ…), còn á, à, ã, é, è, í, ì, ó, ò, õ, ú, ù, ý, â, ê, ô, ơ, ư, ă, đ vẫn tính 1. Nhiều công cụ khác đếm sai chữ tiếng Việt.
- Gõ hoặc dán `---` trên một dòng riêng để tách bài. Kéo thả để sắp xếp lại thứ tự. Có chế độ Text để sửa cả thread trong một ô.
- Mỗi bài đính kèm tối đa 4 ảnh (dán, kéo thả hoặc chọn file) và sửa được alt text.
- Bản nháp tự lưu vào SQLite. Tải lại trang không mất chữ.
- Phím tắt: `⌘/Ctrl+Enter` thêm vào hàng đợi, `⌘/Ctrl+Shift+C` sao chép thread, `⌘/Ctrl+K` mở bảng lệnh.

**Hàng đợi**
- Đăng theo **khung giờ trống kế tiếp** hoặc chọn giờ cụ thể. Khung giờ khai báo trong `threadsmith.config.json` và **tự nạp lại khi sửa file**, không cần khởi động lại. Nếu bản sửa bị lỗi (JSON sai, múi giờ không tồn tại, khung giờ viết sai), app **giữ cấu hình hợp lệ trước đó** và báo lỗi trên giao diện cho tới khi bạn sửa file. Riêng lúc khởi động, file lỗi làm app dừng ngay kèm thông báo lỗi.
- Hàng đợi hiển thị theo từng ngày, khung giờ còn trống hiện mờ. Bấm vào một khung trống để soạn bài cho đúng giờ đó.
- Giờ nhập không có offset (ví dụ `2026-11-03T09:00`) được hiểu theo `timezone` trong config, dù bạn gọi từ giao diện, REST, MCP hay CLI. Giờ có `Z` hoặc offset (`+07:00`) là thời điểm chính xác. Chỉ ghi ngày (không có giờ) hoặc giờ đã qua đều bị từ chối.

**Đăng bài**
- **Chế độ API**: đăng qua X API v2 bằng khóa trong `.env`. Nếu một bài giữa thread bị lỗi, các bài đã lên X được ghi lại. Khi bấm Retry, thread đăng tiếp từ chỗ dừng và không đăng trùng. Những bài **đã lên X bị khóa**: không sửa, xóa hay đổi thứ tự được (server trả 409). Bạn chỉ sửa các bài phía sau rồi Retry.
- **Chế độ thủ công (miễn phí)**: không cần khóa X. Đến giờ, trình duyệt gửi thông báo (Web Push, vẫn nhận được khi tab đã đóng nếu trình duyệt còn chạy). Bạn bấm "Sao chép thread" hoặc "Mở trong X" rồi đánh dấu "Đã đăng". Nếu thread đã lên X một phần (lần đăng qua API bị lỗi giữa chừng), giao diện và `threadsmith copy` chỉ sao chép các bài chưa lên, kèm link bài cuối đã lên để bạn đăng tiếp dưới dạng trả lời (API export trả thêm `alreadyLive`, `remainingText`, `replyToUrl`).
- Vòng lặp lập lịch chạy ngay trong tiến trình. Mỗi bài được "nhận" bằng một giao dịch nguyên tử nên không bao giờ đăng hai lần. Nếu máy chủ tắt giữa lúc đang đăng, bài đó được chuyển sang `failed` kèm hướng dẫn, thay vì tự đăng lại một cách mù quáng.
- **Bài bị lỡ giờ khi app tắt** (laptop ngủ, container dừng…): khi bật lại, bài nào đã trễ quá `lateGraceMinutes` (mặc định 60 phút) thì **không tự đăng muộn**. Bài chuyển sang `due`, ghi lý do vào trường lỗi, hiện ở đầu hàng đợi và gửi thông báo "Time to post". Bạn tự quyết: Đăng ngay (ở chế độ API, Retry hoặc Publish now sẽ đăng bài này), sao chép để đăng tay, hoặc hẹn giờ khác. Đặt `"lateGraceMinutes": 0` nếu muốn luôn đăng, trễ bao lâu cũng được.

**Đa nền tảng**
- Kết nối tài khoản ở trang **Connect** (hoặc `POST /api/accounts`). Thông tin đăng nhập được kiểm tra với nền tảng ngay khi kết nối, rồi lưu **mã hóa AES-256-GCM** trong SQLite, không bao giờ trả ra qua API. Khóa mã hóa lấy từ `SECRET_KEY` hoặc tự sinh vào `data/secret.key`: **sao lưu file này cùng database**.
- Mỗi bài chọn một hoặc nhiều kênh đích. Không chọn kênh nào thì bài chạy đúng như chế độ chỉ-X cũ (khóa X trong `.env`, hoặc sao chép thủ công).
- Mỗi thẻ hiện bộ đếm theo từng kênh đã chọn. Có thể "Customize" để tạo phiên bản riêng cho một kênh, hoặc nhờ copilot **Adapt** viết lại cho hợp kênh đó.
- Trước khi xếp hàng, server kiểm tra từng kênh (độ dài, số ảnh, định dạng và dung lượng ảnh) và chặn ngay nếu kênh nào sẽ từ chối.
- Mỗi kênh đăng độc lập: kênh lỗi không chặn kênh khác, Retry chỉ đăng lại phần chưa lên.

| Nền tảng | Giới hạn | Thread | Ảnh | Chi phí / điều kiện |
|---|---|---|---|---|
| X | 280 (weighted) | trả lời nối tiếp | 4 | Trả phí theo lượt |
| Bluesky | 300 grapheme | trả lời nối tiếp | 4, ≤2 MB | Miễn phí, app password |
| Mastodon | 500 (URL = 23) | trả lời nối tiếp | 4 | Miễn phí, token có scope `profile write:statuses write:media` |
| Threads | 500 | trả lời nối tiếp | 20, JPEG/PNG | Miễn phí, cần app Meta và `PUBLIC_URL` HTTPS công khai |
| LinkedIn | 3000 | gộp thành 1 bài | 20, JPEG/PNG/GIF | Miễn phí, app có `w_member_social` |
| Telegram | 4096 (chú thích ảnh 1024) | tin nhắn trả lời nối tiếp | 10 | Miễn phí, bot là admin kênh |
| Discord | 2000 | tin nhắn liên tiếp | 10 | Miễn phí, webhook |

Token Threads và LinkedIn hết hạn sau khoảng 60 ngày; khi đó tài khoản hiện lỗi đỏ, bấm Check sau khi dán token mới.

**Kết nối AI**: xem [mục riêng bên dưới](#kết-nối-ai).

---

## Chạy nhanh

Yêu cầu Node.js **≥ 22.13** (vì dùng `node:sqlite` có sẵn trong Node, không phải biên dịch native) và pnpm.

```bash
cd artifacts/threadsmith
pnpm install
cp .env.example .env                                   # có thể để trống: app chạy ở chế độ thủ công
cp threadsmith.config.example.json threadsmith.config.json
pnpm build                                             # build giao diện web
pnpm start                                             # → http://127.0.0.1:3000
```

Chế độ phát triển (server tự reload, Vite HMR): `pnpm dev`, sau đó mở http://localhost:5173. Proxy của Vite đọc cùng `PORT` trong `.env` với server.

Nếu không có `threadsmith.config.json`, app tự tạo một file mặc định theo múi giờ của máy.

---

## Cấu hình khung giờ: `threadsmith.config.json`

```json
{
  "timezone": "Asia/Ho_Chi_Minh",
  "maxChars": 280,
  "slots": [
    { "days": "mon-fri", "from": "09:00", "to": "16:00", "everyMinutes": 60 },
    { "days": "sat,sun", "times": ["10:00"] }
  ],
  "schedulerIntervalSeconds": 15,
  "lateGraceMinutes": 60,
  "voice": ["Dán 3–10 bài hay nhất của bạn; copilot sẽ viết theo giọng này."]
}
```

| Trường | Ý nghĩa |
|---|---|
| `timezone` | Múi giờ IANA dùng cho khung giờ, cách hiển thị và để hiểu giờ nhập không có offset. Dữ liệu luôn lưu theo UTC. |
| `maxChars` | 280 với tài khoản thường. Tài khoản X Premium đăng được bài dài tới 25.000 ký tự. |
| `slots[].days` | `mon-fri`, `sat,sun`, `daily`, `weekdays`, `weekends`, hoặc liệt kê `mon,wed,fri`. Viết sai sẽ bị báo lỗi, không bị bỏ qua. |
| `slots[].times` | Danh sách giờ cố định `HH:MM` (24 giờ). |
| `slots[].from/to/everyMinutes` | Một dải giờ, ví dụ thứ Hai tới thứ Sáu từ 9:00 đến 16:00, mỗi 60 phút (tối thiểu 5). `from` không được muộn hơn `to`; dải giờ qua nửa đêm thì tách thành hai quy tắc. |
| `schedulerIntervalSeconds` | Bao lâu vòng lập lịch kiểm tra bài đến giờ một lần (mặc định 15, tối thiểu 5). |
| `lateGraceMinutes` | Bài trễ quá số phút này (vì app tắt đúng lúc đến giờ) sẽ chuyển sang `due` thay vì tự đăng muộn. Mặc định 60; `0` = luôn đăng. |
| `voice` | Vài bài mẫu để copilot bắt chước giọng văn của bạn. |

Một khung giờ coi là "trống" khi chưa có bài nào được hẹn đúng phút đó. `GET /api/config` trả cấu hình đang dùng, kèm `configError` nếu lần sửa gần nhất bị từ chối; `threadsmith health` cũng in lỗi này.

---

## Đăng lên X: chi phí thật

Phần này viết thẳng vì đây là chỗ hầu hết công cụ né không nói.

### X API không còn gói miễn phí cho người mới

- Từ **06/02/2026**, X API chuyển sang **trả theo lượt dùng (pay-per-use)**. Bạn nạp credit trước, mỗi request bị trừ tiền. Không có gói thuê bao.
- Gói Free cũ **không phải chỉ đọc**. Ngược lại, trước đây nó cho phép *ghi* khoảng 500 bài mỗi tháng. Gói này hiện **đóng với người đăng ký mới**, và người dùng Free cũ được chuyển sang pay-per-use.
- Giá trên trang giá chính thức của X (docs.x.com, xem tháng 10/2026):

| Thao tác | Giá |
|---|---|
| Tạo một bài đăng | **$0,015** |
| Tạo một bài đăng **có chứa URL** | **$0,20** |
| Đọc một bài | $0,005 |

- **Mỗi bài trong thread tính tiền riêng.** Một thread 5 bài tốn 5 lượt tạo.
- Theo các nguồn thứ ba, giá bài có URL tăng từ $0,01 lên $0,20 kể từ 20/04/2026.
- X tặng $20 credit sau khi bạn lưu thẻ và nạp lần đầu, và tặng thêm khoản bằng lần tự nạp đầu tiên, tối đa $50. Đây là khuyến mãi, không phải gói miễn phí.

### So với Typefully

Theo các bài tổng hợp giá tháng 10/2026 (trang giá của Typefully render bằng JS nên không đọc trực tiếp được; hãy kiểm tra lại tại typefully.com/pricing):
- Gói Free: 10 bài mỗi tháng.
- Gói Creator: **$99/năm** (khoảng $8,25/tháng).
- Gói Business: $20/tháng cho mỗi social set.

| Mức dùng mỗi tháng | Chi phí X API | Typefully Creator |
|---|---|---|
| 30 thread × 4 bài, không có link | 120 × $0,015 = **$1,80** | ~$8,25 |
| 30 thread × 4 bài, mỗi thread một link | 30 × (3 × $0,015 + $0,20) = **$7,35** | ~$8,25 |
| 100 thread × 5 bài, không có link | 500 × $0,015 = **$7,50** | ~$8,25 |
| 100 thread × 5 bài, mỗi thread một link | 100 × (4 × $0,015 + $0,20) = **$26,00** | ~$8,25 |

**Kết luận thẳng:** tự đăng qua X API **rẻ hơn Typefully khi bạn đăng ít và ít chèn link**. Nếu mỗi thread đều có link, chi phí **cao hơn rõ rệt**. Điểm hòa vốn so với $8,25/tháng vào khoảng **550 bài không có link**, hoặc **khoảng 41 bài có link** mỗi tháng. Typefully cũng phải trả X cho mỗi lượt gọi API, nên giá của họ có thể còn thay đổi.

### Không muốn trả gì: chế độ thủ công

Để trống khóa X trong `.env`. Threadsmith vẫn làm đủ mọi việc: soạn, xếp hàng đợi, nhắc giờ. Đến giờ đăng:
1. Bạn nhận thông báo trên trình duyệt ("Time to post").
2. Bấm vào thông báo, app mở đúng bài đó với nút **Sao chép thread**.
3. Nút **Mở trong X** mở trình soạn của X với sẵn bài đầu tiên (đường dẫn intent của X chỉ điền được bài đầu). Các bài sau bạn dán từng bài khi trả lời nối tiếp.
4. Bấm **Đã đăng** (có thể dán link) để đóng bài.

Về thông báo:
- Web Push cần trình duyệt còn chạy. Tab của app không cần mở.
- Trên VPS, service worker chỉ hoạt động khi trang chạy qua **HTTPS**. Localhost là ngoại lệ.
- Nếu không bật thông báo, bài vẫn chuyển sang trạng thái `due` và hiện nổi bật ở đầu hàng đợi.

### Bật chế độ API

1. Vào developer.x.com, tạo app, nạp credit trong Developer Console.
2. Trong *User authentication settings*, đặt quyền app là **Read and write**. Làm bước này **trước khi** tạo Access Token. Nếu đổi quyền sau đó, phải tạo lại token, nếu không mọi lần đăng sẽ bị lỗi 403.
3. Chép 4 khóa vào `.env`: `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET` (OAuth 1.0a user context), rồi khởi động lại.

Threadsmith ký request bằng OAuth 1.0a tự viết bằng `node:crypto`, không dùng thư viện X bên thứ ba. Ảnh được upload qua `POST /2/media/upload`. Lỗi từ X được dịch ra hướng dẫn cụ thể: sai khóa, thiếu quyền ghi, hết credit, bị giới hạn tốc độ (kèm giờ mở lại), nội dung trùng lặp.

---

## Kết nối AI

Điểm khác biệt chính của Threadsmith: agent có nhiều cách điều khiển công cụ, không chỉ MCP.

| Kênh | Địa chỉ | Dùng khi |
|---|---|---|
| **MCP** (Streamable HTTP) | `http://127.0.0.1:3000/mcp` | Claude Code, Claude Desktop, Cursor, mọi MCP client |
| **REST + OpenAPI 3.1** | `/openapi.json`, tài liệu tương tác tại `/docs` | Mọi ngôn ngữ, n8n, Zapier, function calling |
| **CLI** | `node cli/threadsmith.mjs …` (đầu ra `--json`) | Agent dạng shell như Claude Code, cron, script |
| **Agent Skill** | `skill/threadsmith/SKILL.md` | Dạy Claude quy trình soạn → kiểm tra → hẹn giờ |
| **llms.txt** | `/llms.txt`, `/llms-full.txt` | Agent tự đọc hướng dẫn dùng |
| **Webhooks** (ký HMAC) | `POST /api/webhooks` | Nhận sự kiện `post.due`, `post.published`, `post.failed`… |
| **SSE** | `GET /api/events` | Theo dõi trạng thái theo thời gian thực |
| **Copilot** | `/api/ai/*` và trong giao diện | Chuyển ghi chú thành thread, viết câu mở đầu, rút gọn cho vừa giới hạn, viết lại, alt text |

MCP không có tool copilot: agent kết nối qua MCP tự viết nội dung (copilot chỉ có qua REST `/api/ai/*`, CLI `threadsmith ai …` và giao diện).

Hai tiện ích cho agent:
- **`Idempotency-Key`**: gửi header này trên **mọi request POST dưới `/api`** (tạo bài, hẹn giờ, đăng, upload ảnh, tạo webhook…). Gọi lại cùng đường dẫn với cùng key trong vòng 24 giờ sẽ nhận lại đúng status và body JSON của lần thành công đầu tiên, kèm header `Idempotent-Replayed: true`, thay vì làm lại lần nữa. Phản hồi lỗi (4xx/5xx) không được lưu, nên gửi lại sau lỗi đó là thử lại thật. Riêng đăng bài và Retry trả về 200 kể cả khi X từ chối (bài ở trạng thái `failed`); câu trả lời này cũng được lưu, nên muốn thử lại thì dùng key mới hoặc `threadsmith retry`.
- **`scheduledAt: "next"`**: agent không cần tự tính giờ, chỉ cần xin khung giờ trống kế tiếp.

### Claude Code

```bash
claude mcp add --transport http threadsmith http://127.0.0.1:3000/mcp
# khi có AUTH_TOKEN:
claude mcp add --transport http threadsmith https://threads.example.com/mcp --header "Authorization: Bearer $AUTH_TOKEN"

# Agent Skill (tùy chọn, dạy Claude quy trình và cách dùng CLI):
cp -r skill/threadsmith ~/.claude/skills/
```

### Claude.ai và ChatGPT (custom connector)

Connector chạy trên máy chủ của Anthropic hoặc OpenAI, nên Threadsmith phải có một URL **HTTPS công khai** (xem [Triển khai VPS](#triển-khai-trên-vps)) và phải đặt `AUTH_TOKEN`. Hộp thoại thêm connector chỉ nhận URL (và thông tin OAuth), không cho thêm header `Authorization`, còn Threadsmith không có OAuth. Vì vậy hãy đưa token vào URL:

```
https://threads.example.com/mcp?token=<AUTH_TOKEN>
```

Server nhận `?token=` thay cho header trên mọi đường dẫn cần token. Khi khai báo connector, để trống phần OAuth (hoặc chọn "No authentication"), vì token đã nằm trong URL. Lưu ý:
- Chỉ dùng qua HTTPS. Với `http://`, token đi qua mạng dưới dạng chữ thường.
- Token nằm trong URL nên có thể bị ghi vào log: access log của reverse proxy (Caddy chỉ ghi khi bạn bật `log`), log phía connector, lịch sử trình duyệt nếu bạn mở URL đó. Đừng dán URL này vào chỗ công khai. Nếu nghi bị lộ, đổi `AUTH_TOKEN` rồi cập nhật connector.
- Cách `?token=` đã được kiểm tra bằng request MCP gửi thẳng tới server, chưa thử với connector thật của Claude.ai hay ChatGPT.

### CLI

```bash
export THREADSMITH_URL=http://127.0.0.1:3000   # THREADSMITH_TOKEN=... nếu có AUTH_TOKEN
node cli/threadsmith.mjs new --file notes.md --at next   # tách bài theo ---
node cli/threadsmith.mjs schedule <id> 2026-11-03T09:00  # giờ theo múi giờ của server
node cli/threadsmith.mjs queue --days 7
node cli/threadsmith.mjs copy <id> --clipboard
node cli/threadsmith.mjs count "Chữ ệ, ố, ữ tính 2; chữ á, ơ, ư, đ tính 1"
node cli/threadsmith.mjs help
```

CLI hiển thị giờ theo múi giờ trong config của server (lấy từ `GET /api/config`, có ghi tên múi giờ), không theo múi giờ của máy chạy CLI. Nhờ vậy giờ bạn thấy có thể gõ lại nguyên văn. `publish` và `retry` thoát với mã 1 nếu X từ chối bài, nên script có thể dựa vào exit code.

### Copilot

- **Claude**: đặt `ANTHROPIC_API_KEY`. Model mặc định là `claude-opus-5-5` (đổi bằng `AI_MODEL`).
- **Model local hoặc khác**: đặt `AI_PROVIDER=openai-compatible`, `AI_BASE_URL` (ví dụ `http://localhost:11434/v1` cho Ollama) và `AI_MODEL`.

Copilot đếm lại kết quả bằng đúng quy tắc đếm của X và sửa thêm một vòng nếu còn vượt giới hạn.

### Webhooks

Mỗi lần gửi là một request `POST` JSON `{ id, type, createdAt, data }` kèm header `X-Threadsmith-Signature: sha256=<HMAC-SHA256(raw body, secret)>`. `secret` chỉ hiện **một lần** khi tạo webhook. Cách kiểm tra chữ ký:

```js
import { createHmac, timingSafeEqual } from "node:crypto";
const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
const ok = timingSafeEqual(Buffer.from(expected), Buffer.from(req.headers["x-threadsmith-signature"]));
```

---

## Triển khai trên VPS

```bash
# .env
HOST=0.0.0.0
PORT=3000
AUTH_TOKEN=<kết quả của: openssl rand -hex 32>   # bắt buộc khi cổng có thể truy cập từ máy khác
PUBLIC_URL=https://threads.example.com
VAPID_SUBJECT=mailto:ban@example.com
```

**Tạo `AUTH_TOKEN`** bằng `openssl rand -hex 32` (64 ký tự hex, không cần ngoặc kép). App đọc `.env` bằng `process.loadEnvFile` của Node, với các quy tắc:
- Giá trị không có ngoặc: từ ký tự `#` trở đi bị coi là chú thích và **bị cắt mất**, khoảng trắng hai đầu bị bỏ. Ví dụ `AUTH_TOKEN=Xy7#kP2` thực ra chỉ là `Xy7`, một token rất yếu, và token đầy đủ của bạn sẽ bị từ chối.
- Muốn giữ `#`, `$` hay khoảng trắng thì bọc giá trị trong ngoặc đơn `'...'` hoặc ngoặc kép `"..."`. `\"` bên trong ngoặc kép không hoạt động, nên giá trị có chứa `"` thì dùng ngoặc đơn.
- Biến đã có sẵn trong môi trường (export trong shell, hoặc `Environment=` của systemd) được ưu tiên hơn `.env`.

**`PUBLIC_URL`** là địa chỉ công khai (phải có `http://` hoặc `https://`). App dùng nó cho link trong thông báo, webhook, `/llms.txt` và `/openapi.json`, và chấp nhận tên miền của nó trong header Host.

**Chặn Host và Origin.** Khi **không** đặt `AUTH_TOKEN`, server chỉ trả lời request có header Host là `localhost`, `127.0.0.1`, `[::1]`, giá trị `HOST` (nếu không phải `0.0.0.0`), tên miền của `PUBLIC_URL` hoặc một tên trong `ALLOWED_HOSTS`. Request khác nhận 403 `forbidden_host`, nhờ vậy trang web lạ không dùng được DNS rebinding để điều khiển app. Nếu mở app từ máy khác trong mạng LAN mà không đặt token, thêm tên hoặc IP đó: `ALLOWED_HOSTS=192.168.1.20,mybox.local`. Dù có token hay không, request ghi (POST, PATCH, DELETE…) mang header `Origin` của một trang khác đều bị từ chối 403 `forbidden_origin` (chống CSRF). Agent và CLI không gửi `Origin` nên không bị ảnh hưởng.

**`VAPID_SUBJECT`** là địa chỉ liên hệ gửi kèm Web Push (`mailto:` hoặc `https:`). Mặc định là `mailto:threadsmith@localhost`. Có dịch vụ push (như của Apple cho Safari và iOS) từ chối địa chỉ `localhost`, nên hãy đặt một địa chỉ thật. Cặp khóa VAPID được tạo tự động lần đầu và lưu trong `data/threadsmith.db`.

Dùng Caddy làm reverse proxy để có HTTPS tự động. HTTPS cần cho Web Push và cho connector của Claude.ai, ChatGPT:

```
threads.example.com {
  reverse_proxy 127.0.0.1:3000
}
```

### Chạy bằng systemd

Chạy app bằng một user riêng, không phải root, và để systemd khởi động lại khi app lỗi. Ví dụ dưới đây giả sử mã nguồn nằm ở `/opt/threadsmith/artifacts/threadsmith`, bạn đã chạy `pnpm install`, `pnpm build` và đã tạo `.env`, `threadsmith.config.json` ở đó.

```bash
cd /opt/threadsmith/artifacts/threadsmith
sudo useradd --system --user-group --no-create-home --shell /usr/sbin/nologin threadsmith
sudo mkdir -p data && sudo chown -R threadsmith:threadsmith data   # chỉ data/ là ghi được
sudo chown root:threadsmith .env && sudo chmod 640 .env    # user của app đọc được, người khác thì không
command -v node                                           # đường dẫn tuyệt đối cho ExecStart, cần Node ≥ 22.13
```

`/etc/systemd/system/threadsmith.service`:

```ini
[Unit]
Description=Threadsmith
After=network-online.target
Wants=network-online.target

[Service]
User=threadsmith
Group=threadsmith
WorkingDirectory=/opt/threadsmith/artifacts/threadsmith
Environment=NODE_ENV=production
ExecStart=/usr/bin/node --import tsx --disable-warning=ExperimentalWarning server/index.ts
Restart=on-failure
RestartSec=5
NoNewPrivileges=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/opt/threadsmith/artifacts/threadsmith/data
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictSUIDSGID=yes
LockPersonality=yes

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now threadsmith
journalctl -u threadsmith -f                              # xem log
```

Ghi chú:
- **`ExecStart` phải là đường dẫn tuyệt đối tới `node`** (thay `/usr/bin/node` bằng kết quả `command -v node`). systemd không đọc `PATH` từ shell của bạn, nên `/usr/bin/env pnpm start` sẽ thất bại với mã 127 khi Node hay pnpm được cài bằng nvm, fnm, volta hoặc nằm trong `/opt`. Lệnh trên chạy thẳng Node với `tsx` trong `node_modules`, nên service không cần pnpm. pnpm chỉ dùng lúc cài đặt và build.
- **`WorkingDirectory` là bắt buộc**: `--import tsx` tìm `tsx` trong thư mục hiện tại.
- App tự đọc `.env` trong thư mục app, nên không cần `EnvironmentFile=`. Nếu vẫn muốn giữ biến môi trường trong file của systemd, chúng sẽ được ưu tiên hơn `.env`. Lưu ý cú pháp `EnvironmentFile` của systemd không hoàn toàn giống `.env`.
- `ProtectHome=yes` chặn mọi thứ trong `/home`. Nếu Node cài bằng nvm, fnm hoặc volta trong thư mục home, hãy cài Node cho toàn hệ thống (gói NodeSource, hoặc bản tarball chính thức giải nén vào `/usr/local` hay `/opt`), hoặc đổi thành `ProtectHome=read-only`.
- `ProtectSystem=strict` biến cả hệ thống thành chỉ đọc, trừ `data/` (khai báo trong `ReadWritePaths`) và `/tmp` riêng của service (`PrivateTmp`). Vì vậy `threadsmith.config.json` phải có sẵn (app chỉ tự tạo file mặc định khi file chưa tồn tại), còn sửa file thì vẫn tự nạp lại như thường. Nếu đổi `DATA_DIR`, nhớ đổi cả `ReadWritePaths`.
- Sau khi `git pull`, `pnpm install` hoặc `pnpm build`, chạy `sudo systemctl restart threadsmith`.

Khi đặt `AUTH_TOKEN`:
- Giao diện web hỏi token một lần rồi lưu lại.
- API và MCP nhận token qua header `Authorization: Bearer`, hoặc qua `?token=` trong URL cho client không gửi được header (xem [Claude.ai và ChatGPT](#claudeai-và-chatgpt-custom-connector)).
- Thẻ `<img>` và EventSource dùng cookie.
- Không có OAuth: `/.well-known/*` trả 404 dạng JSON để MCP client không nhầm.

Chỉ chạy **một** tiến trình cho mỗi file dữ liệu. Thiết kế là một node duy nhất.

## Dữ liệu và sao lưu

Dữ liệu của app nằm trong `data/`:
- `threadsmith.db`: SQLite ở chế độ WAL, chứa bài, lịch đăng, webhook, đăng ký Web Push và khóa VAPID.
- `media/`: ảnh đã upload.

Hai file nằm **ngoài** `data/` cũng cần sao lưu: `threadsmith.config.json` (khung giờ, giọng văn mẫu) và `.env` (token, khóa X, khóa AI).

Để sao lưu:
- Chạy `sqlite3 data/threadsmith.db ".backup backup.db"` trong lúc app đang chạy, rồi chép thư mục `media/`; hoặc
- dừng app rồi chép cả thư mục `data/`.

Thư mục `data/` **di chuyển được**: app chỉ dùng tên file ảnh lưu trong database, không dùng đường dẫn tuyệt đối, nên bạn có thể khôi phục `data/` sang máy khác hoặc thư mục khác rồi trỏ `DATA_DIR` tới đó. Ảnh vẫn hiện và vẫn đăng được. `DATA_DIR` đổi vị trí lưu, `CONFIG_PATH` đổi đường dẫn file cấu hình. Đường dẫn tương đối được tính từ thư mục app, không phải thư mục bạn đứng khi chạy lệnh.

---

## Kiến trúc

```
server/
  index.ts       boot: phục hồi bài đang dở, webhooks, push, vòng lập lịch, HTTP
  app.ts         ghép mọi thứ vào một cổng: /api, /mcp, /openapi.json, /docs, /llms.txt, /media, giao diện web
  repo.ts        lớp nghiệp vụ; mọi thay đổi trạng thái đi qua đây và phát sự kiện
  config.ts      khung giờ, "khung trống kế tiếp", hàng đợi theo ngày (tự nạp lại config)
  db.ts          node:sqlite + migration
  api.ts         REST (OpenAPI), SSE, upload media
  webhooks.ts    webhook ký HMAC, thử lại khi lỗi
  scheduler.ts   vòng lặp đăng bài trong tiến trình
  x.ts           X API v2: OAuth 1.0a, upload ảnh, thread nối tiếp, đăng tiếp sau lỗi
  push.ts        Web Push (VAPID)
  ai/            copilot: Claude SDK hoặc endpoint tương thích OpenAI
  mcp.ts         MCP server (Streamable HTTP, stateless)
  llms.ts        /llms.txt, /llms-full.txt
shared/          kiểu dữ liệu và bộ đếm ký tự dùng chung cho server, web, MCP
web/             React 19 + Vite + Tailwind 4 + TanStack Query + dnd-kit
cli/             CLI không phụ thuộc thư viện ngoài
skill/           Agent Skill cho Claude
```

Stack: Node 22+/24, TypeScript chạy bằng `tsx` (không cần bước build cho server), Hono 4 với `@hono/zod-openapi` và zod v4, `node:sqlite`, React 19, Vite 8, Tailwind 4, Anthropic SDK, MCP SDK.

## Giới hạn đã biết

- **Chưa đăng thử lên nền tảng thật nào.** OAuth 1.0a của X đã được kiểm tra bằng ví dụ chữ ký trong tài liệu X. Mọi adapter (X, Bluesky, Mastodon, Threads, LinkedIn, Telegram, Discord) được viết theo tài liệu API chính thức đọc vào tháng 10/2026 và kiểm tra với máy chủ giả lập. Mã lỗi, giới hạn và thời gian xử lý ảnh thực tế có thể khác. Hãy thử một bài ngắn trên từng kênh trước.
- Mới hỗ trợ **ảnh** (PNG, JPEG, WebP, GIF, tối đa 5 MB). Chưa hỗ trợ video.
- Chưa hỗ trợ Instagram, Facebook, TikTok, YouTube, Pinterest (cần app review hoặc tài khoản business).
- Telegram để mặc định bật xem trước link. Discord webhook trỏ vào thread con thì link trả về trỏ kênh cha.
- Chưa có thống kê lượt xem hay tương tác (đọc dữ liệu từ X cũng tốn tiền theo lượt).
- Một người dùng, một tài khoản X cho mỗi instance.
- Bộ đếm ký tự bám theo quy tắc twitter-text v3. Phần nhận diện URL không có scheme (như `example.com`) chỉ là gần đúng, nên X có thể đếm lệch vài ký tự với tên miền lạ. Vì trước khi đăng, server dùng chính bộ đếm này để chặn bài vượt giới hạn (tránh thread bị đăng dở), một bài sát giới hạn có tên miền lạ hiếm khi có thể bị chặn dù X vẫn nhận.
- **Web Push** đã được kiểm tra với một dịch vụ push giả lập (ký VAPID, mã hóa payload, xóa đăng ký hết hạn), chưa thử nhận thông báo trên trình duyệt thật.
- **Copilot với Claude** đã được kiểm tra với một Messages API giả lập (header, body, xử lý từ chối và lỗi), chưa gọi Claude thật. Đường tương thích OpenAI cũng chỉ thử với máy chủ giả lập.

## Nguồn giá

- Giá X API: docs.x.com/x-api/getting-started/pricing (xem 28/10/2026), kết hợp các bài tổng hợp tháng 10/2026 về thời điểm chuyển sang pay-per-use (06/02/2026) và lần đổi giá 20/04/2026.
- Giá Typefully: các bài tổng hợp tháng 10/2026, vì trang typefully.com/pricing không đọc tự động được. Hãy kiểm tra lại trước khi quyết định.

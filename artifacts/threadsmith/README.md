# Threadsmith

**Agent làm việc đăng bài mạng xã hội, bạn chỉ quyết định.** Agent của bạn (Claude Code, Claude Duet, Cursor, một routine chạy theo lịch, hoặc operator có sẵn trong Threadsmith) tự soạn, kiểm tra, xếp lịch và đăng bài lên **X, Bluesky, Mastodon, Threads, LinkedIn, Telegram, Discord**, đọc số liệu và viết tiếp. Bạn không làm những việc đó. Mỗi bài agent muốn đăng được gửi tới **Telegram hoặc Discord** của bạn kèm bản xem trước chính xác từng kênh. Bạn bấm **Duyệt**, **Yêu cầu sửa** (trả lời bằng một câu, agent tự sửa rồi hỏi lại) hoặc **Bỏ**. Có việc bất thường thì gõ `/pause` để dừng mọi thứ.

Threadsmith không tự làm "bộ não" để cạnh tranh với các agent đó. Nó là **đôi tay và hàng rào** cho bất kỳ agent nào: giữ thông tin đăng nhập, đếm ký tự đúng luật từng nền tảng, đăng thread không trùng và đăng tiếp khi lỗi giữa chừng, hẹn giờ, lấy số liệu, và **chốt duyệt do server ép buộc** mà agent không vượt qua được.

Tự host trong **một tiến trình** với **một file SQLite** (hoặc một container Docker), không cần tài khoản người dùng.

```bash
# 1. chạy server, điền TELEGRAM_APPROVAL_BOT_TOKEN / TELEGRAM_APPROVAL_CHAT_ID trong .env (xem "Chạy nhanh")
# 2. nối agent của bạn
claude mcp add --transport http threadsmith http://127.0.0.1:3000/mcp
# 3. giao việc: "mỗi ngày làm việc đăng một thread về sản phẩm lên Bluesky và X, dựa trên số liệu tuần trước"
#    → bài nháp tới Telegram của bạn, bạn bấm Duyệt hoặc trả lời "ngắn lại"
```

> **Trạng thái.** Bản 0.3. Phần đăng lên cả 7 nền tảng, kênh duyệt Telegram/Discord và operator đã được kiểm tra với máy chủ giả lập mô phỏng theo tài liệu API chính thức. **Chưa** chạy với tài khoản thật trên nền tảng nào, chưa gọi Claude thật. Xem [Giới hạn](#giới-hạn-đã-biết).

---

## Ai làm gì

| | Agent | Bạn |
|---|---|---|
| Soạn bài, chọn kênh, chọn giờ | ✔ | |
| Kiểm tra độ dài, ảnh, lỗi từng kênh | ✔ (Threadsmith chặn bài sai trước khi đăng) | |
| Đọc số liệu, rút kinh nghiệm, viết tiếp thread đang hiệu quả | ✔ | |
| Quyết định bài nào được đăng | | ✔ Duyệt / Yêu cầu sửa / Bỏ, trên Telegram, Discord hoặc web |
| Dừng khẩn cấp | ✔ (agent được phép kéo phanh) | ✔ (chỉ bạn được nhả phanh) |
| Kết nối tài khoản (cần mật khẩu, token) | | ✔ Agent không bao giờ thấy thông tin đăng nhập |
| Đặt luật chơi | | ✔ `threadsmith.config.json`, `operator.md` |

Threadsmith chỉ làm phiền bạn khi cần quyết định hoặc có sự cố: yêu cầu duyệt, bài đăng lỗi, bài cần đăng tay, token hết hạn, khi bị dừng. Mọi thứ khác gom vào **bản tin mỗi sáng** (mặc định 08:30): việc đang chờ bạn, bài sắp lên, kết quả 24 giờ qua kèm số liệu, lỗi, và agent đã làm gì.

## Vì sao agent nên đăng bài qua Threadsmith

Agent có thể tự gọi API từng nền tảng, nhưng sẽ phải tự xử lý những thứ dễ sai và khó sửa khi đã lỡ đăng:

| Việc | Agent tự làm | Qua Threadsmith |
|---|---|---|
| Xin phép người dùng | Hỏi trong khung chat, người dùng phải ngồi chờ, hoặc agent tự đăng luôn | Bài nằm ở trạng thái chờ duyệt cho tới khi bạn bấm duyệt; server từ chối mọi cách đăng khác |
| Giữ token của 7 nền tảng | Token nằm trong prompt, file cấu hình hoặc biến môi trường của agent | Mã hóa trong server, agent không bao giờ thấy |
| Đếm ký tự | Dễ sai: X tính "ệ" là 2, mỗi URL là 23; Bluesky đếm grapheme; Threads tính emoji theo byte | `count_characters` / `preview_post` theo đúng luật từng nền tảng, chặn trước khi đăng |
| Thread lỗi giữa chừng | Đăng lại thì trùng, bỏ qua thì đứt thread | Đăng tiếp từ chỗ dừng, không trùng; bài đã lên bị khóa |
| Gọi lại khi mất kết nối | Có thể tạo bài hai lần | `Idempotency-Key` trên mọi POST |
| Hẹn giờ | Agent phải tự chạy liên tục | Hàng đợi theo khung giờ, server tự đăng |
| Số liệu tương tác | Gọi API riêng từng nơi | `list_metrics` / `get_metrics` gom về một dạng |
| Nối thêm bài (plug, follow-up) | Phải nhớ id và chuỗi reply của từng nền tảng | `append_to_post` |
| Ai đã làm gì | Không có | Nhật ký: agent nào tạo, ai duyệt, lúc nào, qua đâu |

Nguyên tắc thiết kế: **Threadsmith cung cấp dữ liệu, thao tác an toàn và quyền quyết định cho bạn; phán đoán để agent làm.** Không có dashboard thống kê, gợi ý giờ đăng, luật auto-plug hay trợ lý viết bài trong giao diện, vì agent đọc số liệu và viết tốt hơn. Xem [mục riêng](#nguyên-tắc-dữ-liệu-và-thao-tác-cho-agent-quyết-định-để-ai).

**Agent dùng qua đâu:** MCP (24 tool, Streamable HTTP), REST với OpenAPI 3.1 (`/docs`), CLI `--json` không phụ thuộc thư viện ngoài, `/llms.txt`, Agent Skill cho Claude, webhook có chữ ký HMAC, luồng sự kiện SSE.

### So với Typefully và Postiz

Hai công cụ này làm cho **người** soạn và lên lịch bài, rồi thêm API và MCP. Threadsmith làm cho **agent** làm việc đó, còn người chỉ duyệt từ điện thoại.

| | Threadsmith | Typefully | Postiz |
|---|---|---|---|
| Ai làm việc | Agent; người duyệt qua Telegram/Discord/web | Người viết | Người và team social |
| Duyệt bài do agent tạo | Bắt buộc, server ép buộc, có token riêng cho agent | không công bố | không công bố |
| Kênh cho agent | MCP 24 tool, REST/OpenAPI, CLI, llms.txt, webhook, SSE, Skill | API + MCP | REST, MCP (~9 tool), CLI |
| Đếm ký tự từng nền tảng, chặn trước khi đăng | Có | không công bố | không công bố |
| Đăng tiếp không trùng khi thread lỗi | Có, theo từng kênh | không công bố | không công bố |
| Tự host | 1 tiến trình + SQLite / Docker | Không (SaaS) | Postgres + Redis + Temporal |
| Nền tảng | 7 | X, LinkedIn, Threads, Bluesky, Mastodon… | ~30 |
| Thống kê, làm việc nhóm | Số liệu cho agent; không có team | Có | Có |
| Giá | Miễn phí (X API tính phí theo lượt; operator tốn phí Claude API) | Free 10 bài/tháng; $99/năm; $18–20/tháng | Tự host miễn phí; host từ $29/tháng |

Nếu bạn cần Instagram, Facebook, TikTok, YouTube, làm việc nhóm hoặc dashboard cho người xem, Postiz hoặc Typefully phù hợp hơn. Số liệu về hai công cụ này lấy từ các trang so sánh tháng 7–10/2026; hãy kiểm tra lại trên trang chính thức của họ.

## Chạy nhanh

Yêu cầu Node.js **≥ 22.13** (vì dùng `node:sqlite` có sẵn trong Node, không phải biên dịch native) và pnpm.

```bash
cd artifacts/threadsmith
pnpm install
cp .env.example .env                                   # điền bot duyệt Telegram/Discord nếu muốn duyệt trên điện thoại
cp threadsmith.config.example.json threadsmith.config.json
pnpm build                                             # build giao diện web
pnpm start                                             # → http://127.0.0.1:3000
```

Chế độ phát triển (server tự reload, Vite HMR): `pnpm dev`, sau đó mở http://localhost:5173. Proxy của Vite đọc cùng `PORT` trong `.env` với server.

Nếu không có `threadsmith.config.json`, app tự tạo một file mặc định theo múi giờ của máy.

---

## Bạn chỉ quyết định: duyệt bài, dừng khẩn cấp, nhật ký

### Chốt duyệt

Mặc định (`"approval": { "require": "agents" }`), **mọi bài do agent xếp lịch hoặc đăng** (MCP, REST, CLI, operator) đều chờ bạn duyệt. Bài bạn tự tạo trên giao diện web không cần duyệt.

```
agent xếp lịch ──► chờ duyệt ──► Duyệt ──► đăng đúng giờ (đã qua giờ thì đăng ngay)
                       │
                       ├──► Yêu cầu sửa "ngắn lại" ──► agent sửa ──► chờ duyệt (thẻ mới, thẻ cũ được đánh dấu "đã thay")
                       └──► Bỏ ──► về nháp
```

- Bài **chờ duyệt** hoặc **bị yêu cầu sửa** không bao giờ được đăng: vòng lập lịch bỏ qua chúng, còn "đăng ngay" từ agent chỉ tạo yêu cầu duyệt.
- Bài đã duyệt mà agent sửa nội dung hoặc đổi kênh đích thì phải duyệt lại. Agent chỉ đổi giờ thì không cần.
- Agent nối thêm bài vào thread đã đăng (`append_to_post`) cũng phải duyệt.
- `approval.except` liệt kê nền tảng agent được đăng thẳng, ví dụ `["telegram"]` cho kênh log riêng. `"require": "never"` tắt chốt duyệt.

**Agent không tự duyệt được.** Chỉ chủ nhân (giao diện web, chat Telegram/Discord đã cấu hình, hoặc `AUTH_TOKEN`) được duyệt, nhả phanh, kết nối hay xóa tài khoản; agent gọi các thao tác đó nhận 403.
- Không đặt token (chạy trên máy mình): mọi request không đến từ giao diện web đều tính là agent. Như vậy đủ với agent tuân thủ luật, nhưng một agent cố tình có thể giả làm giao diện web.
- Muốn chốt chặt thật: đặt `AUTH_TOKEN` (của bạn) **và** `AGENT_TOKEN` (đưa cho agent). Request bằng `AGENT_TOKEN` luôn là agent, giả header nào cũng vậy.

### Duyệt qua Telegram

1. Tạo bot mới với [@BotFather](https://t.me/BotFather) (dùng bot riêng cho việc duyệt, không dùng chung bot đang đăng bài), nhắn `/start` cho bot.
2. Lấy chat id của bạn (ví dụ nhắn [@userinfobot](https://t.me/userinfobot)).
3. Điền vào `.env` rồi khởi động lại:
   ```
   TELEGRAM_APPROVAL_BOT_TOKEN=123456:ABC...
   TELEGRAM_APPROVAL_CHAT_ID=987654321
   TELEGRAM_APPROVER_IDS=987654321      # tùy chọn: chỉ những người này được quyết định
   ```
4. Trang **Inbox** trên giao diện có nút "Send test message".

Threadsmith dùng long polling nên **không cần URL công khai**, chạy được trên laptop. Mỗi yêu cầu duyệt là một tin nhắn có nút ✅ Duyệt · ✏️ Yêu cầu sửa · ❌ Bỏ. Muốn sửa thì bấm ✏️ hoặc trả lời thẳng vào tin nhắn: câu bạn gõ được chuyển nguyên văn cho agent. Lệnh: `/pending`, `/status` (bản tin ngay), `/pause [lý do]`, `/resume`, `/run [việc]` (chạy operator).

### Duyệt qua Discord

Tạo bot ở discord.com/developers (Bot → Reset Token), mời vào server với quyền View Channel và Send Messages ở một kênh, rồi điền `DISCORD_APPROVAL_BOT_TOKEN`, `DISCORD_APPROVAL_CHANNEL_ID`, tùy chọn `DISCORD_APPROVER_IDS`. Threadsmith nối Gateway bằng WebSocket (không cần URL công khai, không cần intent đặc quyền). Nút Duyệt/Bỏ hoạt động như trên Telegram; "Yêu cầu sửa" mở một hộp nhập. Discord không có lệnh chữ (cần quyền đọc nội dung tin nhắn), nên tạm dừng và chạy operator thực hiện qua Telegram, giao diện web hoặc CLI.

Có thể bật cả hai. Quyết định ở một nơi thì thẻ duyệt ở mọi nơi cùng được cập nhật.

### Dừng khẩn cấp, nhật ký, bản tin

- **Dừng**: `/pause`, nút trên giao diện, `threadsmith pause "lý do"`, `POST /api/control/pause`, hoặc agent tự gọi `pause_publishing` khi thấy bất thường. Khi dừng, không bài nào được đăng: bài hẹn giờ chờ lại, "đăng ngay" bị từ chối. Chỉ bạn nhả phanh. Bài đến giờ trong lúc dừng sẽ được đăng khi tiếp tục, hoặc chuyển sang `due` nếu trễ quá `lateGraceMinutes`.
- **Nhật ký** (`GET /api/audit`, `threadsmith audit`, trang Inbox): mỗi thay đổi ghi lại ai làm (`agent:mcp`, `agent:operator`, `owner:telegram:@ban`, `system:scheduler`…), làm gì, lúc nào.
- **Bản tin** gửi mỗi ngày lúc `digest.time` (`null` để tắt). Trước khi gửi, server làm mới số liệu ở các nền tảng đọc miễn phí; X không được đọc vì tính phí.

## Operator có sẵn (tùy chọn)

Nếu bạn chưa có agent chạy theo lịch, Threadsmith có sẵn một **operator**: Claude chạy không người trông, dùng đúng các tool MCP ở trên, theo bản giao việc của bạn trong `operator.md`. Đây chỉ là phần nối, không phải bộ não riêng. Mọi bài operator tạo vẫn phải qua chốt duyệt.

```bash
cp operator.example.md operator.md      # viết mục tiêu, độc giả, giọng văn, chủ đề, nhịp đăng, điều cấm
# .env: ANTHROPIC_API_KEY=...  (model mặc định claude-opus-5-5, đổi bằng AI_MODEL)
# threadsmith.config.json:
"operator": { "enabled": true, "days": "mon-fri", "runAt": ["08:00"], "maxToolCalls": 40, "maxRunsPerDay": 12 }
```

Operator chạy:
- vào các giờ trong `runAt`;
- khi bạn bảo (`/run viết thread về bản cập nhật hôm nay` trên Telegram, nút Run now, `threadsmith operator run`);
- và **tự động khi bạn yêu cầu sửa một bài của nó**: đọc góp ý, sửa bài, gửi lại cho bạn duyệt.

Mỗi lần chạy kết thúc bằng một bản tóm tắt gửi về chat của bạn. Chi phí là tiền Claude API cho mỗi lần chạy. `maxToolCalls` và `maxRunsPerDay` giới hạn mức tiêu.

Đã có agent riêng (Claude Code routine, Claude Duet, n8n…) thì để operator tắt; agent đó nối qua MCP/REST và cũng đi qua cùng chốt duyệt.

---

## Nối agent của bạn

Điểm khác biệt chính của Threadsmith: agent có nhiều cách điều khiển công cụ, không chỉ MCP.

| Kênh | Địa chỉ | Dùng khi |
|---|---|---|
| **MCP** (Streamable HTTP) | `http://127.0.0.1:3000/mcp` | Claude Code, Claude Desktop, Cursor, mọi MCP client |
| **REST + OpenAPI 3.1** | `/openapi.json`, tài liệu tương tác tại `/docs` | Mọi ngôn ngữ, n8n, Zapier, function calling |
| **CLI** | `node cli/threadsmith.mjs …` (đầu ra `--json`) | Agent dạng shell như Claude Code, cron, script |
| **Agent Skill** | `skill/threadsmith/SKILL.md` | Dạy Claude quy trình soạn → kiểm tra → hẹn giờ |
| **llms.txt** | `/llms.txt`, `/llms-full.txt` | Agent tự đọc hướng dẫn dùng |
| **Webhooks** (ký HMAC) | `POST /api/webhooks` | Nhận sự kiện `post.changes_requested` (để agent sửa bài), `post.approved`, `post.published`, `post.failed`… |
| **SSE** | `GET /api/events` | Theo dõi trạng thái theo thời gian thực |

Agent tự viết nội dung. Threadsmith không có trợ lý viết bài riêng (bản trước có copilot trong giao diện; đã bỏ vì agent làm tốt hơn).

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

### Webhooks

Mỗi lần gửi là một request `POST` JSON `{ id, type, createdAt, data }` kèm header `X-Threadsmith-Signature: sha256=<HMAC-SHA256(raw body, secret)>`. `secret` chỉ hiện **một lần** khi tạo webhook. Cách kiểm tra chữ ký:

```js
import { createHmac, timingSafeEqual } from "node:crypto";
const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
const ok = timingSafeEqual(Buffer.from(expected), Buffer.from(req.headers["x-threadsmith-signature"]));
```

---

## Mọi nền tảng là plugin

7 nền tảng đăng bài (X, Bluesky, Mastodon, Threads, LinkedIn, Telegram, Discord) và 2 kênh duyệt (Telegram, Discord) đều là **plugin cùng một chuẩn**, học theo cách [pi](https://pi.dev) xây extension: bản có sẵn nằm trong `plugins/`, dùng đúng định dạng và API như plugin của bên thứ ba. Lõi Threadsmith không biết tên nền tảng nào.

```
plugins/bluesky/
  package.json   { "threadsmith": { "apiVersion": 1, "entry": "index.ts" }, "keywords": ["threadsmith-plugin"], … }
  index.ts       export default function (ts) { ts.registerPlatform({ id: "bluesky", counting: { method: "graphemes" }, verify, publish, metrics, … }) }
```

- **Một hợp đồng** (`server/plugin-api.ts`, import kiểu qua `threadsmith/plugin`):
  - nền tảng khai báo giới hạn, ảnh, cách tạo thread, thông tin đăng nhập cần nhập, và **cách đếm ký tự dưới dạng dữ liệu** (giao diện, CLI, agent và bước kiểm tra trước khi đăng đều đếm giống nhau mà không chạy code plugin);
  - nền tảng cung cấp `verify`, `publish` (đăng tiếp sau lỗi qua `ctx.posted` / `ctx.record`) và tùy chọn `metrics`.
- **Lõi lo phần chung cho mọi plugin:** kiểm tra trước khi đăng, đăng tiếp không trùng, chốt duyệt, dừng khẩn cấp, nhật ký, mã hóa thông tin đăng nhập, idempotency.
- **Cài từ giao diện:** trang **Plugins** cho phép:
  - tìm plugin trên npm (từ khóa `threadsmith-plugin`);
  - cài theo tên npm, `github:user/repo` hoặc file `.tgz`;
  - bật/tắt (có hiệu lực ngay), cập nhật, gỡ, và khởi động lại khi cần.

  Gói được cài vào `<DATA_DIR>/plugin-packages`, **không chạy install script**, và bị kiểm tra đúng là plugin trước khi nạp. Chỉ chủ nhân được cài; agent nhận lỗi 403. Mọi thao tác ghi vào nhật ký.
- **Cách khác:** thả thư mục vào `<DATA_DIR>/plugins/`, hoặc khai báo trong `threadsmith.config.json` → `"plugins": { "load": [...], "disable": [...], "settings": {...} }`. Plugin lỗi bị bỏ qua và báo trên trang Plugins; server không bị sập.
- Ví dụ plugin bên thứ ba: `examples/plugin-webhook` (khoảng 70 dòng, đăng qua webhook tới n8n, Zapier hoặc dịch vụ riêng). Hướng dẫn đầy đủ ở [docs/PLUGINS.md](docs/PLUGINS.md).
- Plugin chạy với toàn quyền của server: chỉ nạp code bạn tin.

## Nguyên tắc: dữ liệu và thao tác cho agent, quyết định để AI

Threadsmith **không** xây những tính năng mà một agent AI làm được và làm tốt hơn khi có dữ liệu: dashboard thống kê, gợi ý giờ đăng, luật auto-plug, bộ tự đăng lại bài cũ (evergreen). Thay vào đó Threadsmith cung cấp đúng hai thứ AI không tự làm được:

- **Số liệu tương tác** của từng bài trên từng kênh: `GET /api/metrics`, `GET /api/posts/{id}/metrics?refresh=true`, MCP `list_metrics` / `get_metrics`, CLI `threadsmith metrics`. Bluesky, Mastodon và Threads miễn phí. Threads cần thêm quyền `threads_manage_insights`. Riêng X tính phí đọc (khoảng $0,005/bài), nên chỉ đọc khi được cho phép (`paid=true`). Telegram, Discord và LinkedIn không có API số liệu phù hợp.
- **Nối thêm bài vào thread đã đăng**: `POST /api/posts/{id}/append`, MCP `append_to_post`, CLI `threadsmith append`. Bài mới trả lời bài cuối đang có trên mọi kênh dạng thread; LinkedIn (dạng một bài) giữ nguyên. Đây là nền cho auto-plug và bài nối tiếp.

Agent (Claude Code, một routine chạy theo lịch, operator có sẵn, hoặc cron gọi CLI) đọc số liệu, tự rút ra bài nào hiệu quả và giờ nào tốt, quyết định khi nào nối thêm bài hay viết lại bài cũ, rồi xếp bài vào hàng đợi; **chốt duyệt** giữ quyết định cuối cho bạn. Công thức mẫu nằm trong `skill/threadsmith/SKILL.md` và `/llms-full.txt`.

## Tính năng chi tiết

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
- Kết nối tài khoản ở trang **Agents** (Agents & accounts) (hoặc `POST /api/accounts`). Thông tin đăng nhập được kiểm tra với nền tảng ngay khi kết nối, rồi lưu **mã hóa AES-256-GCM** trong SQLite, không bao giờ trả ra qua API. Khóa mã hóa lấy từ `SECRET_KEY` hoặc tự sinh vào `data/secret.key`: **sao lưu file này cùng database**.
- Mỗi bài chọn một hoặc nhiều kênh đích. Không chọn kênh nào thì bài chạy đúng như chế độ chỉ-X cũ (khóa X trong `.env`, hoặc sao chép thủ công).
- Mỗi thẻ hiện bộ đếm theo từng kênh đã chọn. Có thể "Customize" để tạo phiên bản riêng cho một kênh (agent thường tự viết phiên bản này).
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

Token Threads và LinkedIn hết hạn sau khoảng 60 ngày. Server tự kiểm tra lại mọi tài khoản mỗi ngày: token hết hạn hiện lỗi đỏ ở trang Agents, báo vào chat duyệt và gửi thông báo trình duyệt **trước** khi một bài hẹn giờ thất bại vì nó. Dán token mới rồi bấm Check.

**Kết nối AI**: xem [mục riêng bên dưới](#nối-agent-của-bạn).

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
  "voice": ["Dán 3–10 bài hay nhất của bạn; agent và operator sẽ viết theo giọng này."],
  "approval": { "require": "agents", "except": [] },
  "digest": { "time": "08:30" },
  "operator": { "enabled": false, "days": "daily", "runAt": ["08:00"], "briefPath": "operator.md", "maxToolCalls": 40, "maxRunsPerDay": 12 }
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
| `voice` | Vài bài mẫu để agent (qua `get_settings`) và operator bắt chước giọng văn của bạn. |
| `approval.require` | `agents` (mặc định): bài do agent xếp lịch/đăng phải chờ bạn duyệt. `never`: agent đăng thẳng. |
| `approval.except` | Nền tảng agent được đăng thẳng không cần duyệt, ví dụ `["telegram"]`. |
| `digest.time` | Giờ gửi bản tin mỗi ngày tới chat duyệt (`HH:MM`, theo `timezone`); `null` = tắt. |
| `operator.*` | Bật operator, ngày/giờ chạy, file giao việc, giới hạn số lần gọi tool mỗi lần chạy và số lần chạy mỗi ngày. |

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

## Chạy bằng Docker

Image chạy bằng user không phải root; toàn bộ dữ liệu (SQLite, ảnh, `secret.key`, config) nằm trong volume `/data`. Từ thư mục gốc của repo:

```bash
cp artifacts/threadsmith/.env.example artifacts/threadsmith/.env      # tùy chọn
docker compose -f artifacts/threadsmith/docker-compose.yml up -d --build
# → http://127.0.0.1:3000 ; sửa khung giờ: docker compose ... exec threadsmith vi /data/threadsmith.config.json
```

Compose chỉ mở cổng trên `127.0.0.1`. Muốn truy cập từ ngoài, đặt HTTPS (Caddy bên dưới) phía trước và đặt `AUTH_TOKEN`, `PUBLIC_URL` trong `.env`. Sao lưu = sao lưu volume `threadsmith-data`.

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

Ba file nằm **ngoài** `data/` cũng cần sao lưu: `threadsmith.config.json` (khung giờ, giọng văn mẫu, luật duyệt), `operator.md` (bản giao việc) và `.env` (token, khóa X, bot duyệt, khóa Claude).

Để sao lưu:
- Chạy `sqlite3 data/threadsmith.db ".backup backup.db"` trong lúc app đang chạy, rồi chép thư mục `media/`; hoặc
- dừng app rồi chép cả thư mục `data/`.

Thư mục `data/` **di chuyển được**: app chỉ dùng tên file ảnh lưu trong database, không dùng đường dẫn tuyệt đối, nên bạn có thể khôi phục `data/` sang máy khác hoặc thư mục khác rồi trỏ `DATA_DIR` tới đó. Ảnh vẫn hiện và vẫn đăng được. `DATA_DIR` đổi vị trí lưu, `CONFIG_PATH` đổi đường dẫn file cấu hình. Đường dẫn tương đối được tính từ thư mục app, không phải thư mục bạn đứng khi chạy lệnh.

---

## Kiến trúc

```
server/
  index.ts       boot: phục hồi bài đang dở, nhật ký, webhooks, push, chat duyệt, vòng lập lịch, operator, HTTP
  actor.ts       ai đang hành động trong request/job (chủ nhân, agent, hệ thống)
  auth.ts        AUTH_TOKEN (chủ nhân) / AGENT_TOKEN (agent), chống DNS rebinding và CSRF
  control.ts     dừng khẩn cấp
  audit.ts       nhật ký ai làm gì
  control-api.ts REST cho phía người: duyệt, dừng, nhật ký, bản tin, kiểm tra chat
  plugin-api.ts  hợp đồng plugin (import type "threadsmith/plugin")
  plugins.ts     nạp plugin, registry nền tảng và kênh duyệt
  notify/        hub chat duyệt: thẻ duyệt, cảnh báo, bản tin (kênh là plugin)
  operator.ts    operator: Claude chạy theo lịch với các tool MCP, theo operator.md
  app.ts         ghép mọi thứ vào một cổng: /api, /mcp, /openapi.json, /docs, /llms.txt, /media, giao diện web
  repo.ts        lớp nghiệp vụ và chốt duyệt; mọi thay đổi trạng thái đi qua đây và phát sự kiện
  config.ts      khung giờ, "khung trống kế tiếp", hàng đợi theo ngày (tự nạp lại config)
  db.ts          node:sqlite + migration
  api.ts         REST (OpenAPI), SSE, upload media
  webhooks.ts    webhook ký HMAC, thử lại khi lỗi
  scheduler.ts   vòng lặp đăng bài trong tiến trình
  push.ts        Web Push (VAPID)
  ai/            Claude client cho operator, hướng dẫn viết thread
  mcp.ts         MCP server (Streamable HTTP, stateless)
  llms.ts        /llms.txt, /llms-full.txt
plugins/         7 nền tảng + 2 kênh duyệt, mỗi cái là một plugin (package.json + index.ts)
examples/        plugin mẫu của bên thứ ba
docs/PLUGINS.md  cách viết plugin
shared/          kiểu dữ liệu và bộ đếm ký tự (theo luật dạng dữ liệu) dùng chung cho server, web, CLI
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
- **Operator** đã được kiểm tra với một Messages API giả lập (vòng gọi tool, tóm tắt), chưa gọi Claude thật. Chất lượng bài phụ thuộc model và `operator.md`.
- **Kênh duyệt Telegram và Discord** đã được kiểm tra với Bot API và Gateway giả lập, chưa chạy với bot thật. Discord không resume phiên Gateway: bấm nút đúng lúc bot đang nối lại thì cần bấm lại.
- Không đặt `AGENT_TOKEN` thì chốt duyệt dựa vào việc agent không giả làm giao diện web. Muốn chốt chặt thật, dùng hai token.

## Nguồn giá

- Giá X API: docs.x.com/x-api/getting-started/pricing (xem 28/10/2026), kết hợp các bài tổng hợp tháng 10/2026 về thời điểm chuyển sang pay-per-use (06/02/2026) và lần đổi giá 20/04/2026.
- Giá Typefully: các bài tổng hợp tháng 10/2026, vì trang typefully.com/pricing không đọc tự động được. Hãy kiểm tra lại trước khi quyết định.

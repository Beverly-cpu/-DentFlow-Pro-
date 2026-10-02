# DentFlow 多電腦雲端化遷移

## 已確認的使用模式

- 多院所、跨網路使用。
- 中央雲端 API 與中央資料庫。
- 桌面端必須連線才能新增或修改資料，不提供離線編輯。
- 每個帳號仍依 `userClinics` 限制可存取院所。

## 目標架構

```text
Electron 桌面端
  -> HTTPS API
    -> Session 與院所權限驗證
      -> PostgreSQL
      -> 簽名／照片物件儲存
      -> 自動備份與稽核紀錄
```

SQLite 資料庫不可放在 NAS、Dropbox 或網路磁碟供多台電腦直接開啟。所有桌面端只能透過 HTTPS API 存取中央資料，避免鎖定衝突與資料庫損毀。

## 遷移階段

### 1. 連線與部署基礎

- 使用 `DENTFLOW_SERVER_URL` 指定中央服務。
- 正式環境強制 HTTPS。
- 桌面端可檢查 `/health`，逾時為 5 秒。
- 未設定伺服器時維持既有單機模式，方便遷移期間回歸測試。

目前已建立 `apps/api` 作為中央服務，啟動時會以 advisory lock 串行執行 PostgreSQL migrations；`/health` 同時檢查 API 與資料庫，`/ready` 確認 migration 基礎表已存在。開發環境可使用根目錄的 `docker-compose.yml` 啟動。

```bash
docker compose up postgres -d
DATABASE_URL=postgresql://dentflow:local-development-only@127.0.0.1:5432/dentflow pnpm db:migrate
DATABASE_URL=postgresql://dentflow:local-development-only@127.0.0.1:5432/dentflow pnpm dev:api
```

第一階段只建立平台基礎，不代表業務資料已集中化。登入與各業務模組在完成對應 API 前仍使用本機 repository；正式環境不得把 `DENTFLOW_SERVER_URL` 指向此基礎服務後便宣稱遷移完成。

### 2. 伺服器端身分驗證

- 登入成功後由伺服器簽發短效 Session。
- 使用者身分與角色由 Session 取得，不接受桌面端自行傳入的 `actorUserId`。
- 每次請求重新驗證帳號是否啟用及院所授權。
- 管理者復原流程移至伺服器端記憶體或集中式快取。

### 3. 業務模組 API 化

依相依順序搬移：

1. 登入、使用者、院所與醫師。
2. 病患與植體個案。
3. 植體／套件庫存、一般耗材與交易紀錄。
4. 療合器、機台預約、搬運與簽名。
5. 儀表板與報表。

每個模組完成後，桌面端 preload 維持相同方法名稱，僅將 IPC 實作切換為 HTTPS，降低 React 畫面的改動量。

### 4. 圖片與簽名

- 不再把大型 Data URL 直接寫進主要資料表。
- API 接收檔案後寫入私有物件儲存。
- 資料庫只保存物件鍵、雜湊、建立者與時間。
- 讀取時使用短效授權網址，保留院所與角色權限檢查。

### 5. 資料移轉與上線

- 上線前凍結舊 SQLite 寫入。
- 匯出並驗證筆數、外鍵、庫存總量、簽名與照片雜湊。
- 匯入 PostgreSQL 後執行抽樣比對。
- 保留唯讀 SQLite 備份，不讓桌面端繼續直接寫入。

## `/health` 合約

```json
{
  "status": "ok",
  "service": "dentflow-api",
  "database": "ok",
  "time": "2026-09-21T00:00:00.000Z"
}
```

健康檢查只有在 API 與資料庫皆可用時才回傳 HTTP 200。不得回傳帳號、連線字串或病患資料。

## 舊醫師身分對照（0005）

- 先由管理者在中央建立並啟用醫師帳號、配置執業院所；本階段不匯入密碼，也不自動建立帳號或授權。
- 桌面端管理者／助理登入後，先以裝置 ID、舊醫師 ID、院所代碼及帳號每批 500 筆建立中央對照，再匯入病患。
- 帳號以大小寫不敏感方式比對，中央帳號必須為啟用中的 Doctor，且操作者與醫師均有該院所權限。
- 同一裝置的同一醫師於不同院所必須指向同一中央帳號。既有對照不可覆寫；來源裝置必須與 Session 一致。
- 病患的舊醫師姓名必須在本機該院所唯一對應醫師 ID，中央匯入再以 ID 對照確認身分；同名、缺漏或權限不符均回報衝突，修正後重新登入即可重試。
- 已匯入病患只有在中央醫師關聯為空、儲存的醫師姓名與來源相符時才補上關聯；既有醫師關聯不覆寫。
- 對照、病患關聯及匯入稽核均在各批次交易內提交；稽核寫入失敗會回滾該批次。
- 部署時先執行 API migration 0005，再更新桌面端。舊桌面端未提供醫師 ID 的病患匯入會回報衝突。

醫師對照不會切換本機病患／醫師／植體業務 IPC。植體匯入範圍見下節；正式多機上線尚未完成。

## 舊植體個案匯入（0006）

- 中央 `implant_cases` 保存個案核心及中央病患／醫師 ID，資料庫以複合外鍵阻止跨院所病患關聯。
- `legacy_implant_mappings` 以來源裝置＋舊個案 ID 對照中央個案。同來源重試時比對完整快照雜湊，內容或院所改變會回報衝突，不覆寫歷史資料；不同來源的個案不以日期或病患姓名自動合併。
- `legacy_implant_snapshots` 保存牙位、術前需求、使用量、REF／LOT、歷史成本、預留與歸回稽核及舊品項。快照內所有 ID（包含庫存與操作者）均為來源裝置的舊 ID，不可用於中央扣帳或推定中央操作者。
- 歷史成本取自最後一筆對應的手術取出交易，不使用目前庫存成本回推；沒有歷史成本時保留 `null`。
- 照片與簽名本體不進入快照。資產清單包含來源表、舊 ID、欄位、原始 Data URL 的 UTF-8 SHA-256 與位元組長度；原件保留在 SQLite；私有物件搬移流程見 0008。
- 每一個案及明細在同一 SQLite 讀取交易內擷取。中央每批最多 50 個案，桌面端也限制請求小於 1.8 MB；單案超過 1 MB 時保留本機來源並記錄待處理數量，不妨礙其他個案匯入。
- 管理者／助理登入後依醫師、病患、植體順序匯入。未完成病患／醫師對照、明細關聯錯誤或缺少院所授權的個案會列為衝突。
- 中央核心、對照、快照與稽核在同一交易提交；稽核失敗則整批回滾。
- 管理者／助理可透過 `GET /v1/migrations/implants?clinicId=...&afterId=...` 分頁檢查結果，以及 `GET /v1/migrations/implants/:id?clinicId=...` 核對快照與資產清單；兩者均檢查目前院所權限。
- 部署時先執行 API migration 0006，再更新桌面端。

匯入的個案固定標為 `legacy_staged`，即使沒有待搬移資產，也不代表完成業務切換。本階段不修改庫存、不切換本機病患／植體 IPC，也不刪除 SQLite。庫存與操作者對照範圍見下節；正式上線仍須完成私有儲存部署與實際資產核對、中央業務交易 API、來源寫入凍結與完整性比對。

## 舊庫存與操作者對照（0007）

- 此階段新增的匯入、關聯解析與庫存檢查 API 僅允許管理者；來源 ID 必須與登入裝置相同，所有資料均依中央院所權限限制。
- `inventory_batches` 保存院所、品項、規格、REF、LOT 與效期的中央 ID；來源數量、成本、安全庫存、備註與原始時間保存在 `legacy_inventory_mappings` 的不可變快照。
- 每個來源裝置的舊庫存 ID 各自對應暫存批次，不以品名或 LOT 自動合併。不同電腦可能保存同一份實體庫存，故中央批次沒有可供扣帳的 quantity，不加總來源數量；正式庫存仍須盤點與來源核對後啟用。
- 同來源重新匯入時比對快照雜湊。數量、成本、規格、院所或來源時間改變會列為衝突，不覆寫原快照。
- `legacy_user_mappings` 以來源裝置、舊使用者 ID 與院所對照中央帳號；帳號大小寫不敏感，角色須相符，中央帳號須已有該院所關係。同一舊操作者於各院所必須對應同一中央帳號。
- 已停用的中央帳號仍可識別歷史操作者，但不重新啟用帳號、不匯入密碼、不建立帳號、不新增院所關係或登入權限。缺少中央帳號、角色不同或院所關係不符均須人工確認後重試。
- 本機匯出包含目前 userClinics 及植體歷史紀錄曾引用的院所，避免移除本機院所授權後漏掉歷史操作者；已刪除而無法查得帳號的舊使用者仍列為缺漏。
- 管理者登入後先匯入操作者與庫存，再執行既有醫師、病患、植體匯入，最後逐頁解析植體快照的庫存與操作者關聯。助理仍沿用既有病患／植體匯入，不執行新增的管理者操作。
- 每批庫存最多 100 筆、操作者最多 500 筆；桌面端依 UTF-8 大小分批，單筆超過 16 KB 保留本機來源並略過。中央驗證數量、成本、效期及欄位格式。
- `legacy_implant_inventory_links` 與 `legacy_implant_user_links` 以複合外鍵鎖定個案、來源、院所及中央對照，阻止錯用其他電腦或院所的 ID；關聯解析不改動原始個案快照或歷史成本。
- `pendingInventoryRefs`、`pendingUserRefs` 為尚未對照數量；null 表示尚未檢查，0 表示已檢查且目前沒有缺漏。可從植體遷移清單／明細 API 核對，明細另回傳 inventoryLinks、userLinks。關聯全部完成後仍維持 `legacy_staged`。
- `POST /v1/migrations/implants/resolve-references` 每次處理 50 個案，依 nextAfterId 接續；補齊中央對照後可從第一頁重新解析。每批對照、關聯與稽核在同一交易提交，稽核失敗整批回滾。
- 管理者可使用 `GET /v1/migrations/inventory?clinicId=...&afterId=...` 分頁檢查來源庫存快照。部署時先執行 API migration 0007，再更新桌面端。

照片／簽名私有物件搬移流程見下節。庫存盤點／來源核對、中央業務交易 API 與實機端到端驗證尚未完成；此階段不啟用中央扣帳，也不刪除本機資料。

## 安全必要條件

- TLS 1.2 以上，正式環境禁止 HTTP。
- 密碼、資料庫連線字串及物件儲存金鑰只放伺服器端 Secret。
- 所有寫入保存操作者、院所、時間與來源裝置。
- 登入、簽名、庫存異動與取消操作需具備重放防護及交易一致性。
- 每日自動備份，定期實際演練還原。


## 私有照片／簽名搬移（0008）

先執行 API migration 0008，再部署 API 與桌面端。此階段提供程式流程；未建立雲端資源、未搬移真實診所檔案，仍維持 `legacy_staged`，業務 IPC 與 SQLite 原件保留。

伺服器設定 `ASSET_BUCKET`、`ASSET_REGION`、`ASSET_BUCKET_OWNER`（12 位 AWS 帳號 ID）。三者必須一起設定；全部留空時停用資產搬移。可選 `ASSET_KMS_KEY_ID`，預設使用 S3 AES256 伺服器端加密，設定後使用該 KMS key。AWS 憑證使用伺服器 SDK 預設 credential provider／IAM role，不能放入桌面、React 或版本控制。此階段只支援 AWS S3，未提供任意 endpoint。

儲存桶必須啟用全部四項 Block Public Access。每次寫入與讀取都會核對，並指定 ExpectedBucketOwner；核對失敗便拒絕傳輸。伺服器 IAM 至少需要 bucket 上 `s3:GetBucketPublicAccessBlock`，以及 `dentflow/clinics/*` 前綴的 `s3:PutObject`、`s3:GetObject`；KMS 模式另需對指定 key 的 `kms:GenerateDataKey`、`kms:Decrypt`。不需 DeleteObject 或公開 ACL。部署人員應設定 HTTPS、物件版本與備份／保留策略，並讓反向代理允許本路由的 16 MiB JSON body。

管理者登入後，桌面先查 `GET /v1/migrations/assets/status`；未設定或不符合私有設定便保留待搬移清單。準備就緒時，透過 `GET /v1/migrations/assets?sourceId=...&afterId=...` 每頁最多 25 個案取得來源 manifest，逐張讀取同個案的 SQLite 原件，驗證原始 Data URL 雜湊與長度，再 POST `/v1/migrations/assets/upload`。來源 ID 必須等於登入裝置，個案必須位於管理者目前可存取的啟用診所。支援 PNG、JPEG、WebP、GIF，核對格式標頭與標準 Base64，解碼後每張最多 10 MiB；不接受 SVG 或其他主動內容。

上傳先提交帶物件鍵的 `pending` 資產與稽核記錄，才寫入 S3；讀回核對 SHA-256 與大小後，另以交易標記 `uploaded`、重算待搬移數量並記錄稽核。中斷、儲存失敗或完成稽核失敗時，保留已知物件鍵與 pending 狀態；再次登入沿用同一識別碼與原始內容重試。已完成的相同上傳不覆寫物件。內容與來源快照不一致時拒絕搬移，不刪除或修改本機原件。

讀取使用 `GET /v1/assets/:id` 的中央登入授權，而非公開網址或預簽 URL。僅 Admin、Assistant、Doctor 可讀；每次確認目前診所權限，Doctor 另限自己的個案。pending 資產不可讀，讀回仍核對內容完整性並稽核，回應使用 `private, no-store`。沒有把物件鍵、AWS 憑證或原始 Data URL 放入遷移列表。現有桌面臨床畫面仍使用本機照片，中央臨床畫面與交易切換是後續工作。

驗證涵蓋 API 權限、來源 hash、格式與大小限制、私有 bucket 防護、耐久 intent、完成稽核回滾及重試；另使用 PostgreSQL 相容 PGlite 執行全部八份 migration 與真實 SQL，儲存使用測試替身。仍需在正式 PostgreSQL、實際私有 AWS bucket 及兩台桌面執行部署驗收。

AWS 參考：[Block Public Access](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html)。


## 中央病患寫入交易與多機版本檢查（0009）

先執行 migration 0009 再部署 API。每筆中央病患新增整數 `version`，預設 1；所有 UPDATE（包含遷移補醫師關聯）由資料庫 trigger 遞增。病患列表、詳情及寫入回應帶 `version` 與 `doctorUserId`。

中央新增、修改、封存均限 Admin／Assistant，並在同一 PostgreSQL 交易中核對及鎖定目前院所權限、修改資料、寫入稽核，全部成功才提交。任何稽核失敗均回滾資料與版本，不會產生「回應失敗但病患已改」的半完成狀態。病歷號重複回應 HTTP 409 `chart_number_conflict`，保留原有全球唯一病歷號規則。

- `POST /v1/patients`：`clinicId`、`chartNumber`、`name`、可選 `birthDate`、`note`、`doctorUserId`。
- `PUT /v1/patients/:id`：完整欄位及必填整數 `expectedVersion`，使用最近讀取的 `version`。
- `DELETE /v1/patients/:id?clinicId=...&expectedVersion=...`：封存而非實體刪除，同樣須提供最近版本。

兩台電腦讀到 version 1，第一台成功修改為 2 後，第二台以 version 1 修改或封存會收到 HTTP 409 `version_conflict`；不覆寫、不自動重試、不記錄成功稽核。客戶端應保留尚未送出的編輯，重新載入最新病患並由使用者核對，再以新版本送出。缺少版本或格式錯誤回應 400，找不到目前院所的有效病患回應 404，無寫入角色或院所權限回應 403。

醫師以中央 `doctorUserId` 指定，伺服器核對啟用中 Doctor 及院所關係，名稱以中央帳號為準，不信任客戶端姓名。明確解除醫師請傳 `doctorUserId: null` 且 `doctor` 留空。為相容舊呼叫，僅傳 `doctor` 姓名時須唯一匹配中央啟用醫師；同名、停用或缺少院所關係回應 `invalid_doctor`，不再默默存成無醫師關聯。姓名、病歷號及備註有 UTF-8 長度限制，出生日期核對實際曆日。

此階段只強化中央 API；桌面病患／植體業務 IPC 仍使用本機 ID，尚未切換寫入來源。後續需完成中央植體業務模型、庫存盤點與交易 API，再協調病患及植體畫面使用中央 ID 和衝突提示，避免中央病患 ID 被當成本機植體病患 ID。不可據此宣告多機系統已正式完成。

驗證包含 API 交易、醫師指定、角色與院所權限、稽核失敗回滾、舊版本拒絕及欄位格式；PGlite 執行九份 migration 和真實 SQL，模擬兩台先讀同一版本後依序寫入，以及遷移修補導致版本失效。尚未執行正式 PostgreSQL 上的並行負載或兩台桌面驗收。


## 中央植體術前草稿（0010）

先執行 migration 0010 再部署 API。中央新個案標為 `central_draft`，只允許「待醫師叫貨」與「已取消」；原有 `legacy_staged` 個案及來源快照不會自動啟用。0010 新增中央牙位與術前規格表，使用中央病患／醫師／個案 ID；術前規格只含名稱、類別、品牌、型號、規格、預計數量，不含庫存 ID、REF／LOT、取出量、成本或照片。此階段尚未加入庫存預留、叫貨、取出、術後使用及歸回 API。

- `POST /v1/implants`：`clinicId`、`patientId`、可選 `doctorUserId`（中央帳號）、有效 `implantDate`、`note`、`teeth`、UUID v4 `requestId`。
- `PUT /v1/implants/:id`：完整草稿欄位與 `expectedVersion`；同一版本內交易替換牙位／術前規格，子項 ID 隨草稿修訂重新產生，不能當作已領用的歷史 ID。
- `POST /v1/implants/:id/cancel`：`clinicId`、`expectedVersion`、必填 `reason`，取消後保留牙位／規格與原因，不執行庫存歸回。
- `GET /v1/implants?clinicId=...&patientId=...&afterId=...`：僅中央草稿，每頁最多 100 筆，按中央個案 ID 分頁，`patientId` 可省略。
- `GET /v1/implants/:id?clinicId=...`：中央草稿詳情、牙位與規格，讀取並稽核。

新增與修改的 `teeth` 格式為 `[{ toothPosition: "36", items: [{ name: "植體", category: "植體", brand: "", model: "", specification: "4 x 10", quantity: 1 }] }]`。FDI 牙位接受永久齒 11–48 的有效象限／牙序，以及乳齒 51–85 的有效象限／牙序；同案牙位不能重複。每案最多 52 牙位、500 筆規格，每牙位 1–100 筆，每品項預計數量 1–1000。類別僅「植體」、「植體套件」、「器械」，JSON body 上限 64 KiB，姓名／品牌／型號／規格與備註另有 UTF-8 長度限制。拒絕直接傳入 status、doctorId、庫存關聯、照片或其他非允許欄位。

Admin／Assistant 可新增、修改及取消，必須有啟用院所的目前權限；病患必須為同院所有效中央病患，指定醫師必須為該院所啟用 Doctor。Doctor 只讀自己被指定的草稿，不能寫入；Accountant／Procurement 無草稿讀寫權限。詳情的授權、個案及子項讀取使用同一 repeatable-read 交易，避免讀到不同修訂的牙位或醫師歸屬；寫入鎖定院所關係及個案，明細與稽核全部成功才提交。

`requestId` 在同一中央操作者下識別一次新增，客戶端首次送出前產生並保存，網路逾時重送沿用同值。同內容重送回傳既有個案目前版本並標示 `unchanged: true`，不新增第二案、不還原後續修訂；同 key 更換內容或院所回應 HTTP 409 `request_conflict`。不同操作者的新增請求獨立，不根據同名病患或日期自動合併。

每案 `version` 初始 1，任何個案 UPDATE 由資料庫 trigger 遞增。修改／取消須帶最近 version，舊版回應 409 `version_conflict`；已取消的草稿不可修改或再次取消，回應 409 `workflow_conflict`。一般草稿讀寫入口對舊遷移個案回應 404；舊案仍從 migration review 入口核對。取消只適用尚未進入庫存流程的新草稿，不能替代已取出個案的逐項歸回與稽核。

驗證包括重複新增、改變請求內容、來源欄位拒絕、FDI 與數量限制、中央引用、舊版本衝突、取消限制、醫師／院所權限與全部寫入的稽核回滾。PGlite 執行十份 migration 及真實 SQL，另驗證子項失敗回滾、跨個案明細外鍵、草稿狀態限制、舊案隔離與沒有庫存異動。仍需正式 PostgreSQL 並行壓力及實機驗收；桌面業務 IPC 尚未切換到這些 API。


## 中央庫存盤點啟用與期初紀錄（0011）

先執行 migration 0011 再部署 API。來源批次仍以 `legacy_staged` 匯入，每台電腦保留各自不可變的 snapshot；不相加、不自動啟用。管理者選定可代表實體庫存的中央批次，完成來源核對及實際盤點後，才透過 `POST /v1/inventory/:id/activate` 明確輸入期初數量。此階段只提供 API，未執行真實診所盤點或切換桌面庫存 IPC。

請求必填：中央 `clinicId`、批次最近 `expectedVersion`、整數 `countedQuantity`（0–1000000）、非負 `unitCost`（JSON number，最多兩位小數、上限 1000000000）、`reconciliationNote`（盤點與來源核對說明，UTF-8 上限 4000 bytes）及 UUID v4 `requestId`。不允許省略數量／單價，不使用舊 snapshot 的 quantity 或 cost 作預設。單價記錄為 numeric(14,2)，回應用兩位小數字串，避免報表浮點運算。

只有 Admin 且有目前啟用院所權限可啟用。批次鎖定後核對 version 與 staged 狀態，依序設定 active、建立 `inventory_balances`、寫入不可變 `inventory_openings` 與稽核，全部在同一 PostgreSQL 交易提交。任何步驟失敗全部回滾；庫存批次版本由 trigger 遞增。balance 保存 `onHand`、`reserved`、`available`、`balanceVersion` 與期初單價；本階段 reserved 固定初始 0，沒有預留、扣帳、補貨或調整 API。

新增期初請求在同一中央操作者下以 requestId 識別，網路逾時重送須沿用同一值及原內容。相同請求回傳既有餘額並標示 `unchanged: true`，不再次加庫存；改變內容或批次回應 409 `request_conflict`。以新請求再次啟用 active 批次會被版本或 `already_active` 檢查拒絕，不可用重新啟用更正數量；後續更正需另建正式調整交易。

同院所只能啟用一個正規化身份相同的批次：REF 和 LOT 都有值時以其組合識別，忽略別名與效期差異；缺其中一項時以名稱、類別、品牌、型號、規格、REF、LOT 組合識別。字串採 Unicode NFKC、去頭尾空白、合併空白及小寫化。資料庫唯一索引阻止不同來源同時重複啟用，回應 409 `duplicate_batch`。這是保守的重複入帳防護，不是自動合併；不同商品共用 REF／LOT 或來源格式不同，仍需人工核對。不同身份或不同院所不會被自動判為相同實體庫存，管理者必須確認來源範圍與實際盤點。

- `GET /v1/inventory/staged?clinicId=...&afterId=...`：Admin 檢查待核對批次 metadata 與 version，每頁最多 100 筆；來源快照仍從 migrations/inventory 檢查。
- `GET /v1/inventory?clinicId=...&afterId=...`：目前院所已啟用庫存與餘額，每頁最多 100 筆。Admin／Procurement／Accountant 可見單價，Assistant／Doctor 回應不包含成本欄位。
- `GET /v1/inventory/:id/opening?clinicId=...`：Admin／Procurement／Accountant 讀取期初盤點數量、成本、核對說明、操作者與時間，並記錄讀取稽核。

期初紀錄由資料庫 trigger 禁止 UPDATE／DELETE。批次的來源對照、snapshot 與舊植體庫存連結保留，不將其他電腦的重複批次改指向新批次，也不自動把舊 staged 個案啟用。剩餘待核對批次仍不可供中央扣帳。

驗證包括明確盤點值、成本精度、重送、舊版本、已啟用狀態、同 REF／LOT 別名、防重複索引、角色／院所、成本欄位隔離及稽核回滾。PGlite 執行十一份 migration 與真實 SQL：來源數量 5 與 99 不加總，期初只寫盤點值 3；確認期初不可修改／刪除、reserved 不超過 onHand、零數量啟用以及來源 snapshot 完全不變。尚需正式 PostgreSQL 並行驗證、實體盤點、中央叫貨／預留／取出／使用／歸回交易，以及兩台桌面切換驗收。


## 中央叫貨與批次預留（0012）

先執行 migration 0012 再部署 API。中央草稿完成叫貨時進入 `central_workflow`／「醫師已叫貨」，資料庫限制本階段中央流程僅有「醫師已叫貨」及「已取消」。`legacy_staged` 舊案不會自動啟用，一般中央個案查詢仍排除舊案。此前 0010 的草稿 API 及 0011 的餘額 API 現在可讀取已叫貨個案、預留及可用量。

`POST /v1/implants/:id/order` 必填 `clinicId`、最近 `expectedVersion`、UUID v4 `requestId` 及 `allocations: [{ planItemId, inventoryBatchId, quantity }]`。ID 均為中央 ID；分配最多 500 筆，同一術前規格／批次配對不可重複，分配數量須為 1–1000 整數。每一術前規格須完整分配恰好等於預計數量，可分散至多個 LOT。同一批次供不同規格使用時，先加總需求再核對可用量，不能藉由重複行超額預留。

叫貨僅允許目前院所的 Doctor／Assistant，Doctor 限自己被指定的個案，Admin 不代替醫師叫貨。保留本機助理協助叫貨規則：須至少一筆器械規格，植體／套件每筆均須有型號及規格。病患須有效、個案醫師須為具有院所關係的啟用 Doctor；所有批次須為同院所 active 庫存。名稱、類別、品牌、型號及規格經 NFKC、空白及大小寫正規化後必須符合計畫。以台北日期拒絕已過期批次。

交易先鎖定目前院所關係及個案，依中央批次 ID 固定順序鎖定批次與餘額，核對 `onHand - reserved`。成功時只增加 reserved，不扣 onHand，同一交易新增逐規格／批次預留、變更個案狀態／版本、記錄不可變 request 結果、庫存預留事件與稽核。庫存 balance 的 version 由 trigger 遞增。庫存不足或效期錯誤回應 409 `stock_conflict`；規格或中央引用錯誤回應 400；個案舊版本回應 409 `version_conflict`；明細、事件或稽核寫入失敗全部回滾。

`POST /v1/implants/:id/cancel-order` 必填 `clinicId`、`expectedVersion`、`requestId`、`reason`。僅允許尚未取出的「醫師已叫貨」個案，Admin／Assistant／個案 Doctor 可取消。交易按既有 reserved 紀錄釋放全部預留、保留 released 明細與 REF／LOT、記錄原因、個案標為已取消並遞增版本；不增加 onHand，不執行實體歸回，取消後不可再修改。即使批次已過期仍可釋放原預留，避免占用庫存。此入口不能取代已取出個案的逐項歸回確認。

叫貨與取消以中央操作者＋requestId 辨識一次操作；第一次送出前保存 key，網路中斷重送沿用同 key、原版本及原內容。相同請求回傳第一次提交的結果與 `unchanged: true`，不再異動庫存；後續操作需另讀最新個案版本。改變 key 所對應的個案、內容或操作回應 409 `request_conflict`。庫存事件及 request 結果由資料庫 trigger 禁止修改／刪除，事件保存 reserved 正負異動與提交後餘額，無成本欄位。

中央個案列表與詳情現涵蓋 `central_draft` 及 `central_workflow`；詳情包含 `reservations`（中央規格／批次 ID、quantity、reserved/released 狀態、REF、LOT 與時間），Doctor 仍只讀自己的個案。已叫貨個案不能透過術前草稿 PUT 或草稿 cancel 修改，防止刪除已有庫存預留的規格。桌面業務 IPC 仍未切換；尚無實際取出、術後使用、歸回、補貨及盤點調整 API。

驗證：API 授權、完整分配、數量／格式、規格、效期、重送與稽核回滾；PGlite 執行十二份 migration 及真實 SQL，兩個個案依序爭用同一餘額，第二案不足時拒絕，取消後可重新供另一案預留。在手數量保持不變，庫存事件與 request 不可改寫；驗證事件寫入失敗回滾、Doctor 歸屬及助理完整規格／器械規則。尚需正式 PostgreSQL 的同時請求、死鎖／重試測試，以及兩台桌面驗收。


## 中央確認取出與成本快照（0013）

先執行 migration 0013 再部署 API。`central_workflow` 新增「已取出待手術」狀態，預留明細新增 picked 狀態、完整取出數量、取出時間、操作者與當時單價。此階段實作中央庫存扣帳時間為實際取出；術後使用只應分類已取出物品，不能再次扣同份庫存。舊本機流程仍未切換，不可混合兩種扣帳來源。

`POST /v1/implants/:id/withdraw` 必填中央 `clinicId`、最近 `expectedVersion`、UUID v4 `requestId` 與 `confirmations: [{ reservationId, quantity }]`。reservationId 使用中央詳情的 UUID，必須逐項明確確認此個案全部 reserved 紀錄及完整數量；不可省略品項、部分取出、重複 ID、更換批次或指定 unitCost。最多 500 項、每項 1–1000，JSON body 上限 64 KiB。本階段不提供部分取出 API。

僅 Admin／Assistant／Doctor 且具有目前啟用院所權限可確認，Doctor 限自己的個案。個案必須為「醫師已叫貨」且中央病患有效。交易鎖定院所、個案、預留紀錄，再依批次 ID 固定順序鎖定已啟用庫存與 balance；以台北日期重新檢查效期，不能依叫貨時尚未過期就直接取出。任何效期、在手／預留量或確認內容不符均拒絕。

同批次的預留先合計，成功時同時減少 onHand 與 reserved，available 保持原值，不消耗其他個案的預留。預留明細記錄 picked_quantity、picked_at、picked_by_user_id 及伺服器當下單價；依 numeric 精度建立每批次不可變 withdrawal event，包含數量、單價、計算總成本、兩種負異動與提交後餘額。全部扣帳、明細、個案狀態／版本、request 結果、庫存事件及稽核於同一交易提交，任一步失敗完全回滾。

重送沿用同 requestId、原版本及原確認內容，回傳首次提交結果與 `unchanged: true`，不再次扣庫存；更換內容回應 409 `request_conflict`。個案舊版本回應 409 `version_conflict`，非叫貨狀態回應 409 `workflow_conflict`；確認不完整或使用其他個案明細回應 400 `confirmation_mismatch`，批次過期或數量異常回應 409 `stock_conflict`。取出後不能用 cancel-order 釋放預留或草稿取消；需要後續實作逐項歸回，而非重新增加期初數量。

臨床詳情的 reservations 帶 `pickedQuantity`、`pickedAt`、`pickedByUserId`，保留 REF／LOT，但不帶成本。`GET /v1/implants/:id/withdrawal-ledger?clinicId=...` 僅 Admin／Accountant／Procurement 可讀取成本及取出事件，仍核對目前院所權限並稽核讀取。單價與總成本以兩位小數字串回應；後續庫存單價變更不改寫已取出的成本。資料庫 trigger 阻止修改／刪除取出事件及 picked 明細的身分、數量、單價、時間、操作者。

驗證涵蓋逐項確認、舊版本、重送、取出狀態、成本隔離、授權及稽核回滾。PGlite 執行十三份 migration 與真實 SQL：兩個個案合計預留 3，第一案取出 2 後在手 1、仍預留另一案的 1；再取出剩餘案後在手及預留皆為 0。驗證事件失敗回滾、取出前重新檢查效期、病患停用拒絕、不可變成本／明細、重送不再扣庫存，以及當時單價 1200.50 的兩件總成本固定 2401.00，後續單價 9999 不影響歷史記錄。尚需正式 PostgreSQL 同時請求與兩台桌面驗收，術後使用、歸回、照片／簽名業務寫入、報表及桌面 IPC 切換仍待完成。


## 中央術後使用與實體歸回（0014）

先執行 migration 0014 再部署 API。中央流程新增「待術後紀錄」、「待歸回品項」及「已完成」。已完成表示使用分類及必要歸回已完成，尚不代表完成照片、簽名或正式結案。舊來源快照與 staged 個案仍保持隔離，桌面 IPC 尚未切換。

以下 POST 均必填中央 `clinicId`、最新 `expectedVersion` 與 UUID v4 `requestId`，僅目前院所的 Admin／Assistant／Doctor 可操作，Doctor 限自己的個案。JSON body 上限 64 KiB，明細最多 500 筆，同一 reservationId 不可重複。交易鎖定個案及取出明細；歸回依批次 ID 固定順序鎖定餘額。個案、數量、不可變事件、request 結果及稽核全部成功才提交。相同操作者及 requestId 重送原內容回傳首次結果與 `unchanged: true`，不重複分類或回補；換內容／操作回應 409，舊版本或階段不符亦回應 409。

- `POST /v1/implants/:id/surgery-complete`：從「已取出待手術」進入「待術後紀錄」，保存伺服器時間與操作者，無庫存異動。
- `POST /v1/implants/:id/usage`：必填 `usages: [{ reservationId, usedQuantity }]`，須包含全部已取出明細，數量為 0–1000 且不超過取出量。植體／套件待歸回量為取出量減使用量；可重複使用的器械即使使用過，仍須歸回全部取出量，消耗量記為 0。此操作只分類，不能再次扣庫存。無待歸回量時直接標為已完成，否則進入待歸回品項。
- `POST /v1/implants/:id/return-items`：必填 `reason` 及 `confirmations: [{ reservationId, quantity, returnCondition }]`。允許逐項分次歸回，數量 1–1000 且不超過該明細剩餘待歸回量；植體／套件須確認 `sealed`（未拆封），器械須確認 `reusable`（可重複使用）。只增加原批次 onHand，不改 reserved 或目前單價，全部歸回後標為已完成。可歸回已過期的原批次，但後續叫貨／取出仍拒絕過期庫存。
- `POST /v1/implants/:id/cancel-picked`：只允許「已取出待手術」，必填原因及上述歸回確認，須確認全部取出品項的完整數量與適用狀態，完整回補後標為已取消。不能省略實體歸回確認或在手術完成後使用此入口。

臨床詳情新增手術／使用紀錄時間及操作者，reservations 帶 usedQuantity、expectedReturnQuantity、returnedQuantity、usageRecordedAt、lastReturnedAt 與 returnedByUserId，仍不提供成本。`GET /v1/implants/:id/return-ledger?clinicId=...` 僅 Admin／Accountant／Procurement 依目前院所權限讀取歸回原因、狀態、數量、操作者、歸回後餘額及原取出成本，並稽核讀取。單價／總成本以兩位小數字串回應，不因後續庫存單價更動而改寫。資料庫禁止改寫使用分類、減少已歸回量或修改／刪除使用及歸回事件。

驗證：92 項 API 測試、TypeScript、ESLint 及整體路由註冊通過。PGlite 執行全部十四份 migration 與真實 SQL，驗證使用不再次扣帳、器械使用後完整歸回、植體分次歸回、超額／錯誤狀態拒絕、全部品項取消、重送不重複回補及事件／稽核失敗回滾。原單價 1200.50 的兩件歸回成本合計 2401.00，庫存單價改為 9999 後仍保留歷史成本且不覆蓋目前單價。正式 PostgreSQL 同時請求與兩台桌面驗收仍待執行；破損／已拆封且不可回補的品項處置、照片／簽名、正式結案、報表與桌面切換仍待完成。


## 中央臨床照片、指定醫師簽名與正式結案（0015）

先執行 migration 0015 再部署 API。本階段新增中央新個案的臨床資產表與結案快照，不使用舊來源資產表，也不啟用 legacy_staged 個案。私有物件儲存沿用 0008 的 owner、region、加密與全部 Block Public Access 設定；未設定時上傳／讀取回應 503，不會退回本機儲存。未操作生產資料、建立雲端資源或切換桌面 IPC。

`POST /v1/implants/:id/clinical-assets` 必填 `clinicId`、最新 `expectedVersion`、UUID v4 `requestId`、`kind` 與 `dataUrl`。禁止客戶端指定操作者、物件路徑或來源 ID。圖片支援 PNG／JPEG／WebP／GIF，解碼後最多 10 MB，JSON body 最多 16 MiB；醫師簽名只接受 PNG 且 Data URL 最多 2,000,000 bytes。伺服器檢查格式及雜湊，不辨識筆跡身分或判斷照片內容是否正確，指定醫師仍須親自核對實際使用明細後送出簽名。

| kind | 中央引用 | 操作條件 |
| --- | --- | --- |
| instrument_photo | planItemId | 此個案器械規格，可由 Admin／Assistant／指定 Doctor 上傳 |
| ref_lot_photo | reservationId | 此個案實際使用量大於 0 的植體／套件批次，須提供 REF／LOT 照片 |
| doctor_signature | 不接受品項引用 | 僅指定 Doctor 本人，個案已完成使用分類及全部歸回，且必要照片均已上傳 |

寫入與完成階段各自鎖定目前啟用院所、帳號及個案，核對目前角色與 Doctor 歸屬。首次請求檢查 expectedVersion，先交易保存不可變的 pending 身分／雜湊／物件 key 與稽核後才寫物件儲存；讀回內容核對 SHA-256 與大小，再以第二個交易標記 uploaded、遞增個案版本並稽核。失敗保留 pending 紀錄及原 key；重試沿用原 requestId、原版本及相同內容。已完成請求回傳首次結果與 unchanged，不再傳送物件或增加版本。同 key 改變個案、內容、引用或原版本回應 409 request_conflict。

照片完成時允許其他照片或流程操作已使版本前進，但仍重新核對引用、階段、帳號／院所權限與未簽名條件。簽名須在開始及完成時維持相同版本，避免上傳期間另一台電腦新增照片而簽署過期紀錄；版本已變更時 pending 簽名不自動套用，需讀取最新個案、重新確認並使用新 requestId。每份 pending 內容保持原樣，不覆寫舊請求。只有 uploaded 的照片計入完整性檢查；器械規格均須有照片，實際使用的非器械每一取出批次須有 REF／LOT 照片。簽名保存 asset ID、指定醫師、伺服器時間與所確認的個案版本。

指定醫師簽名後，只允許正式結案；不能追加照片、改寫個案／牙位／規格／預留明細，資料庫 trigger 同樣限制修改。已上傳資產及身分不可改寫／刪除。本階段不提供撤銷簽名、重開結案、照片刪除或 pending 資產清理 API。

`POST /v1/implants/:id/close` 必填 clinicId、expectedVersion、requestId，僅目前院所 Admin／Assistant／指定 Doctor 可執行。必須為「已完成」，具有指定醫師對目前紀錄版本的已核對簽名；重新檢查使用分類、歸回及必要照片，然後在同一交易標記「已結案」、保存操作者／時間、建立不可變 snapshot 與首次結果、寫入稽核。snapshot 保存中央病患／醫師 ID、手術日期、備註、牙位／規格、批次 REF／LOT、取出／使用／歸回量、時間、資產 ID／雜湊及簽名版本，不包含庫存成本或私有物件路徑。事件或稽核失敗全部回滾，重送不產生第二份結案紀錄。結案後個案及快照不可修改／刪除。

個案詳情新增已上傳 assets、簽名資訊、closedAt／closedByUserId 及 closure 快照；列表包含已結案狀態。`GET /v1/clinical-assets/:id` 僅目前院所 Admin／Assistant／指定 Doctor 可讀取，核對物件內容後經已登入 API 回傳二進位，附 private/no-store、nosniff 與 sandbox 標頭，並稽核讀取。不提供公開 URL，Accountant／Procurement 不可讀取臨床資產或結案快照。

驗證：98 項 API 測試、TypeScript、ESLint 及整體路由註冊通過。PGlite 執行全部十五份 migration 與從草稿、叫貨、取出、使用、歸回、照片到簽名／結案的真實 SQL；驗證錯誤引用／醫師／角色拒絕、損壞內容拒絕、pending 重試沿用原 key、版本變動拒絕簽名、簽名完成及結案稽核失敗回滾、不可變子項／資產／結案快照、私有讀取與重送不增加版本或改動庫存。仍需正式 PostgreSQL 並行、實際私有儲存與兩台桌面驗收；桌面業務切換、報表、不可回補品項處置及簽名／結案更正流程尚待完成。


## 桌面病患功能切換與中央／本機 ID 隔離

本階段不新增 migration；中央 API 須已執行 0001–0015，並部署新增的 `GET /v1/doctors?clinicId=...` 後再更新桌面程式。設定 DENTFLOW_SERVER_URL 時，病患列表、詳情、醫師所屬／跨院所瀏覽、新增、修改與封存全部經 Electron 主程序呼叫中央 API；未設定時保持原本單機 repository。遠端呼叫失敗不回退 SQLite，不查詢本機醫師或猜測來源 ID。

中央醫師名單只提供院所內啟用 Doctor，Admin／Assistant 可讀名單，Doctor 只讀自己；其他角色及無院所權限者拒絕。ID／userId 均使用中央帳號 ID，附姓名及帳號供同名醫師辨識，不傳密碼或其他院所關係，讀取記錄稽核。桌面選擇主治醫師改以 ID 為選項值，中央請求只傳 doctorUserId，名稱由伺服器決定。舊病患若無明確中央引用，不按姓名自動配對；使用者須明確重新選擇或改為未指定。單機模式仍按本機醫師選項取得姓名寫入。

病患編輯表單保存開啟當時的 version；送出 expectedVersion，不在送出前重新讀取版本、不自動重試覆蓋。封存使用目前列表列的 version。版本缺漏在主程序拒絕，另一台電腦已更新時中央回應 409，保留表單供核對；重新整理後需重新開啟編輯。遠端模式 UI 顯示「封存」，病患從有效名單隱藏，保留既有關聯及歷史紀錄，單機仍使用原刪除行為。新增沒有自動重試，唯一病歷號仍由中央資料庫約束，重複提交會回報衝突。

中央 API client 保留 HTTP 狀態與錯誤碼；只有真正 404 的病患詳情回傳 null，網路、權限、登入及版本錯誤向上回報。IPC 不接受客戶端指定操作者或院所覆寫，主程序依呼叫院所組成請求，授權仍由中央登入 session 驗證。此階段不新增離線寫入或背景同步。

為避免中央病患／帳號／院所 ID 被當成本機同號 ID 使用，遠端模式暫停未切換的植體、耗材、庫存及其交易、設備、醫師本機管理與 SQLite 備份 IPC（包含讀取）；在執行 repository 回呼前阻擋。畫面以未開放提示替代這些業務頁及本機儀表板，已開放病患及帳號／院所設定繼續使用。直接呼叫未開放 IPC 也不能執行本機回呼。此限制只適用遠端模式，單機功能保持原入口；登入時的來源資料遷移讀取仍按既有流程執行，並非遠端業務回退。中央庫存及植體 API 已實作，但其桌面業務畫面尚待後續切換，不能宣稱整套多機功能已完成。

驗證：106 項測試、API／桌面 TypeScript、Electron 主程序型別檢查、API／桌面 ESLint、桌面與 Electron production build、整體 API 路由註冊及 diff 檢查通過。測試實際 IPC 註冊函式，確認全部未切換入口在遠端模式不執行回呼、單機病患仍呼叫原 repository。PGlite 執行全部十五份 migration 與桌面 adapter 經真實 API SQL 的兩個客戶端操作：同名醫師 ID 可區分、A 更新後 B 舊版本編輯／封存被拒絕、Doctor 所屬與角色限制、封存及真正 404 回應。這是依序的兩客戶端驗證，尚非正式 PostgreSQL 並行或兩台實機測試。build 仍有既有前端 bundle 超過 500 kB 提示；不影響本次編譯成功。下一階段需接續中央庫存／植體桌面流程及實機驗收。


## 中央庫存桌面餘額、來源核對與盤點啟用

本階段沒有新增 migration，API 須已執行 0001–0015，並先部署新增 `GET /v1/inventory/:id/sources?clinicId=...` 再更新桌面。遠端模式的庫存選單現在顯示統一中央庫存畫面，涵蓋所有中央類別；既有庫存子選單進入同一畫面，使用名稱／類別／規格／REF／LOT 搜尋已載入批次。單機模式保留原庫存畫面及 repository。需先切到單一院所，跨院所模式只顯示切換提示，不查詢或啟用庫存。

中央畫面透過專用 central-inventory IPC 呼叫既有 API，和本機 inventory／inventory-transactions IPC 分開。後者在遠端模式仍阻擋，避免把中央批次 ID 用於本機增減數量、入庫、出庫或調整；專用中央 IPC 在單機模式亦拒絕。已啟用列表顯示 onHand、reserved、available、REF／LOT、效期，以及財務角色可見的單價。每頁 100 筆，明確使用中央 afterId 載入更多，搜尋範圍為已載入資料，不宣稱跨未載入頁搜尋。Admin／Accountant／Procurement 可讀期初紀錄，成本字串保留兩位小數；角色與院所授權由伺服器驗證。

Admin 額外可讀待核對批次及來源快照。新增 sources API 限 Admin、目前啟用院所及同院所批次，回傳來源電腦／舊 ID、原 snapshot 與匯入時間，並稽核讀取；不改動來源數量或成本，其他角色拒絕。畫面保留完整來源紀錄供核對，盤點量與單價輸入初始留空，不帶入或加總來源量。管理者須明確填寫實際盤點量（0–1000000）、期初單價（非負、最多兩位小數）、來源核對說明，確認已比對其他來源及完成實際盤點，再查看具體啟用內容並送出。中央依既有批次 version、身份唯一索引、角色與交易限制防止重複啟用。

送出之前，桌面在此裝置 localStorage 保存精確 requestId、院所／批次、原 version、數量、成本與說明，以伺服器網址／使用者／院所隔離待確認請求，不保存登入 token 或病患資料。寫入保存失敗時不送出 IPC；未確認請求不能被另一份內容覆寫，也不能被其他請求的成功回呼刪除。網路／不明錯誤、503 或 request_conflict 保留原內容，畫面提供沿用原請求重試；重新載入／重新啟動同一應用後恢復請求，成功確認後才清除。保存紀錄異常時停止新的盤點啟用，供管理者核對。此保存機制只記錄待確認中央請求，沒有離線庫存扣帳或自動背景重試。

明確收到中央 invalid_input、forbidden、not_found、version_conflict、already_active 或 duplicate_batch 的對應拒絕結果時，才提供重新載入核對的操作；不自動更換版本重送或修改原 key。重試成功若 unchanged=true，顯示原請求已完成且沒有重複入帳。期初完成後不可重新設定，後續補貨／盤點調整／停用批次桌面操作尚未實作，畫面不提供本機替代操作。

驗證：113 項測試、API／桌面 TypeScript、Electron 主程序／preload 型別檢查、API／桌面 ESLint、桌面與 Electron production build、API 整體路由註冊與 diff 檢查通過。實際 IPC 註冊測試確認專用中央路由及單機拒絕，既有未切換回呼仍受保護；請求保存測試確認明確零值、空白拒絕、原版本／requestId 重建、內容不可覆寫及不明錯誤不清除。PGlite 執行全部十五份 migration 及桌面 adapter 經真實 SQL：來源量 37 而盤點量 2，提交成功後模擬回應中斷，恢復同一請求只回傳既有結果，期初事件維持一筆且庫存仍為 2；同時驗證舊版本拒絕、角色／院所、1200.50 成本字串、來源不變及 100 筆 cursor 分頁。仍待正式 PostgreSQL 並行、Electron 實機畫面／儲存恢復與兩台電腦驗收；植體桌面流程及庫存後續交易仍待切換。build 仍有既有前端 bundle 超過 500 kB 提示。

## 桌面中央術前草稿（PR #94）

遠端模式的植牙頁面改用中央個案列表與詳情。Admin／Assistant 可在指定院所新增、編輯及取消尚未叫貨的中央草稿，選擇中央病患與醫師，填寫多牙位及品項規格，送出前核對內容。Doctor 只能讀取自己的個案；其他狀態僅顯示詳情。沿用本機模式原有流程，遠端模式不回退本機 SQLite。

新增前先確認伺服器回傳的當前使用者與院所寫入權限，再將完整請求以 Electron safeStorage 加密保存，依伺服器、使用者與院所隔離。Linux 的 basic_text／unknown backend 或未提供安全儲存時禁止新增，不保存明文；既有個案讀取、編輯不依賴此儲存。回覆中斷後保留原 UUID 與內容，使用者可恢復同一請求；不自動重送或建立第二個請求。只有明確的輸入／病患／醫師錯誤或禁止寫入回覆可清除失敗請求，其他不確定結果繼續保留。

編輯、取消保留開啟時的版本，遇到衝突須重新檢視，不自動覆蓋。草稿只保存規格，不接受本機品項 ID、成本或批號，不扣庫存。取消保留原明細。新增 `/v1/implants/draft-access`，無新 migration；部署時先更新 API，再更新桌面。

驗證：API 120 項測試、API／桌面 lint 與 build、Electron 主程序／preload 型別檢查。PGlite 執行全部 15 個 migrations，驗證提交成功後回覆遺失、同請求恢復不重複建案、兩個 client 的舊版本編輯／取消拒絕、醫師個案與寫入權限、院所隔離及取消不動庫存。測試中的加密替身只驗證 journal 介面與順序，尚未完成真實作業系統安全儲存、兩台 Electron 電腦及正式 PostgreSQL 併發驗收。桌面叫貨、取出、術後、簽署及結案操作仍待下一階段接入；前端 build 仍有既有 bundle 大小警告。


## Desktop central implant ordering

The remote desktop implant screen now submits stock reservations to the central API instead of mutating local SQLite. Assistant and doctor ordering uses explicit active central REF/LOT batches, the case version opened by the client, and a UUID request id. Before the request is sent, the exact order intent is encrypted with Electron safeStorage and persisted separately from draft creation intents. If the server commits but the response is lost, the desktop offers to retry the exact same request id; the server returns the recorded result without reserving stock twice.

Before withdrawal, Assistant or Doctor can cancel an order. The central API releases only reservations still in the reserved state and records the cancellation transaction and audit event. Once withdrawal has begun, this pre-pick cancellation path is no longer offered.

Physical acceptance on two real computers and validation of the OS safeStorage backend remain deployment gates.

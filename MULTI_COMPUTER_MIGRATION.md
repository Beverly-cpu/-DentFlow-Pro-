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

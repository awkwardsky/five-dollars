# five dollars

## 核心目標

建立一個「不需要日常人工操作」的長期收入專案，目標是平均每天賺到 5 美元，也就是每月約 150 美元。

重要前提：不能保證任何專案一定賺錢。這份方案的目標是把收入模式設計成可以自動交付、自動收款、自動續訂，並避免靠違規流量、假點擊、垃圾內容或平台漏洞。

## 收款與停止條件

使用者要求的第一個明確停止條件：

**USDT-TRC20 收款地址收到第一筆至少 5 USDT 的入帳。**

目前已提供公開收款地址。專案只保存公開收款地址，不保存也不要求私鑰、助記詞、交易所密碼、2FA code 或任何可動用資產的資料。

設定欄位：

- Network：TRON
- Token：USDT TRC20
- Minimum receipt：5 USDT
- Payout address：`TW4aVr9dQa4eAEyMmqfwYSyjs8Woq4aBgZ`
- Verification：查詢公開鏈上 TRC20 transfer 紀錄，確認 USDT 合約入帳到該地址

可用的驗證來源：

- TronGrid：`/v1/accounts/{address}/transactions/trc20`
- TronScan：TRC20 token transfer API（作為備援；目前未提供 API key 時可能回 401）

實務限制：

- 我不能保證一定賺到 5 美元，也不能為了達標使用違規、自動假流量、詐欺、垃圾訊息或平台規避方式。
- 我不能永久執行背景程序；需要部署到伺服器、GitHub Actions、Vercel Cron 或 VPS 才能長期自動跑。
- 我可以把專案設計成一旦部署後自動抓資料、自動產生產品內容、自動收款、自動檢查是否收到第一筆 5 USDT。

## 結論

優先做一個 B2B 小型訂閱服務：

**Government Opportunity Radar**

每天自動抓取美國政府合約與補助機會，針對特定利基市場整理成「可行動的機會摘要」，提供免費公開頁面與付費 email/Slack alert。

第一個利基市場建議：

**AI / automation / software small-business opportunities**

也就是專門追蹤和軟體開發、自動化、資料處理、AI、IT consulting 相關的政府合約與補助。

## 為什麼選這個

這個方向比廣告站、聯盟行銷站、AI 內容農場更適合「每天 5 美元」的目標。

- 收入單位比較高：B2B 使用者只要覺得一個 alert 可能帶來案源，就比較能接受每月 9 到 19 美元。
- 不需要巨大流量：如果價格是每月 9 美元，只需要約 17 個付費訂閱者就接近每月 150 美元。
- 可以自動交付：資料抓取、去重、分類、摘要、寄信、收款、續訂都能自動化。
- 資料來源相對穩定：SAM.gov、Grants.gov、USAspending 都有官方資料服務或 API。
- 內容有實際價值：不是大量生成泛用文章，而是把難找、難篩選的機會整理成可讀、可行動的資訊。

## 不採用的方向

### 1. 廣告自動點擊或假流量

不做。這會違反廣告平台政策，也會導致帳戶停權與款項被扣留。

Google AdSense 明確禁止人工或自動方式膨脹點擊、曝光，也限制 paid-to-click、autosurf、click-exchange、垃圾郵件等流量來源。

### 2. 純 AI 自動內容站加 AdSense

不作為第一選擇。這種模式需要大量搜尋流量，而且容易被判定為低價值、薄內容或抓取內容。就算技術上能自動產生頁面，商業上也不可靠。

### 3. Amazon affiliate 自動商品站

不作為第一選擇。聯盟佣金會依品類變動，而且每天 5 美元通常需要穩定購買流量。若沒有既有受眾或 SEO 優勢，回本時間不可控。

### 4. Crypto faucet、賭博套利、問卷、任務平台

不做。這些通常不可長期穩定自動執行，且容易踩到平台規則、KYC、資安或法律風險。

## 商業模型

### 免費層

- 公開網站列出每日新增機會。
- 每個機會有標題、來源、截止日期、金額或預估範圍、適合對象、摘要、官方連結。
- 允許使用者免費訂閱低頻 email，例如每週一封。

### 付費層

價格先定低，目標不是高客單價，而是快速達到每天 5 美元。

- Basic：每月 9 美元，單一利基市場每日 alert。
- Pro：每月 19 美元，3 個利基市場、關鍵字自訂、Slack webhook。

### 收入目標

- 每月 9 美元：需要 17 個付費訂閱者，約 153 美元/月。
- 每月 19 美元：需要 8 個付費訂閱者，約 152 美元/月。

扣除金流、email、hosting、AI 摘要成本後，實際可能需要：

- 20 到 25 個 Basic 訂閱者，或
- 10 到 12 個 Pro 訂閱者。

## 自動化流程

每天排程執行：

1. 從 SAM.gov 抓 active contract opportunities。
2. 從 Grants.gov 抓 open opportunity packages。
3. 將資料正規化後存入資料庫。
4. 根據利基市場規則做關鍵字分類與去重。
5. 產生短摘要、截止日提醒、適合對象、官方連結。
6. 更新公開網站頁面。
7. 依訂閱者設定寄出 email 或 Slack alert。
8. 同步 Stripe 訂閱狀態，只寄給有效付費使用者。
9. 寫入執行紀錄，失敗時發送管理者告警。

目前已實作的本地 pipeline：

```bash
npm run run:daily
```

這個指令會依序執行：

1. 抓取 Grants.gov 機會，SAM.gov 在提供 `SAM_API_KEY` 後啟用。
2. 寫入 `data/opportunities.sqlite`。
3. 產生 `digests/latest.md`。
4. 查詢公開 TRON 鏈上紀錄，確認是否收到至少 5 USDT。
5. 產生公開靜態頁、機會詳情頁、主題頁、RSS、sitemap、payment status JSON。
6. 執行 `npm run verify`，確認付款邏輯測試和靜態站驗收通過。
7. 嘗試寄送 digest；沒有 Resend 設定時會安全跳過。

目前最新檢查結果：尚未收到符合條件的 5 USDT 入帳。

## 技術架構

MVP 可以用低成本架構：

- App：Next.js 或 Astro
- Data jobs：Node.js cron script 或 GitHub Actions
- Database：SQLite 起步，之後換 PostgreSQL
- Email：Resend、Postmark 或 Amazon SES
- Payments：Stripe Payment Links + Stripe webhooks
- Hosting：Vercel、Railway、Fly.io 或一台小 VPS
- Queue：MVP 先不用，之後再加

## MVP 範圍

第一版只做能驗證收入的最小系統：

- 一個利基市場：AI / automation / software opportunities
- 每日資料抓取
- 資料去重
- 公開列表頁
- 機會詳情頁
- Email 訂閱名單
- Stripe 付費訂閱
- 付費每日 digest
- 管理者執行報告

暫時不做：

- 多租戶後台
- 複雜推薦系統
- 大量利基市場
- 手動銷售 CRM
- 客製化企業帳號

## 自動獲客方式

完全不人工操作的獲客不等於一定能獲客。可行的自動方式是讓系統每天產生有搜尋價值的公開頁面：

- `/opportunities/software-contracts-this-week`
- `/opportunities/ai-grants`
- `/opportunities/small-business-it-rfps`
- `/opportunities/deadlines`

每個頁面都必須有真實資料、官方來源、截止日期與摘要。不要做無意義的大量頁面。

第二個自動獲客來源是免費 email：

- 使用者先免費訂閱 weekly digest。
- 信內顯示部分機會。
- 付費後改成 daily digest + 完整篩選。

## 需要使用者一次性提供的東西

目標是不需要日常人工操作，但初始設定無法完全省略。

- 網域名稱
- Stripe 帳號
- Email sender 帳號與網域驗證
- SAM.gov API key
- Hosting 帳號
- 專案名稱或品牌名稱是否沿用 `five dollars`

## 風險

- 可能 30 到 90 天沒有收入，因為搜尋流量與信任需要時間。
- 政府資料 API 可能變更格式或限制。
- 摘要如果太粗糙，使用者會退訂。
- 太廣泛的利基市場沒有價值，必須切小。
- Email deliverability 需要注意退訂、bounce、spam complaint。

## 成功判斷

第一階段不是直接看收入，而是看能不能自動產生真正有價值的 alert。

7 天內：

- 每天成功抓資料
- 每天成功產生 digest
- 每筆機會都有官方來源連結
- 摘要不胡說，不誇大

30 天內：

- 至少 100 個免費 email 訂閱
- 至少 3 個付費訂閱
- 沒有人工整理內容

90 天內：

- 10 到 25 個付費訂閱
- 月收入接近或超過 150 美元

## 官方資料與平台參考

- SAM.gov Contract Opportunities: https://sam.gov/content/opportunities
- SAM.gov Opportunities Public API: https://open.gsa.gov/api/get-opportunities-public-api/
- Grants.gov API: https://www.grants.gov/api/applicant/
- Grants.gov search2 API: https://www.grants.gov/api/common/search2
- Grants.gov fetchOpportunity API: https://www.grants.gov/api/common/fetchopportunity
- USAspending API: https://api.usaspending.gov/docs/intro-tutorial
- Stripe Payment Links: https://docs.stripe.com/payments/no-code
- Google AdSense policies: https://support.google.com/adsense/answer/48182
- Amazon Associates policies: https://affiliate-program.amazon.com/help/operating/policies

## 下一步

如果要開始做，第一個工程步驟不是建立漂亮網站，而是建立「資料驗證原型」：

1. 建立 `sources/sam.gov` 與 `sources/grants.gov` 的 fetcher。
2. 建立本地 SQLite schema。
3. 用固定關鍵字抓出 AI / software / automation 相關機會。
4. 產生一份每日 digest markdown。
5. 連續跑 7 天，確認資料品質足夠。

只要資料品質過關，再做網站、付費牆與 email automation。

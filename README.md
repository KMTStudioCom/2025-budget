# 2025 年度中央政府總預算案

這個專案是用來處理和分析 2025 年度中央政府總預算案的資料處理系統。系統會將預算提案資料向量化並存入 Supabase 資料庫中，以便後續查詢和分析。

## 📚 資料來源

本專案資料來自[立法院議事暨公報資訊網](https://ppg.ly.gov.tw/)：

- [內政、經濟、財政、教育及文化、交通、社會福利及衛生環境六委員會](https://ppg.ly.gov.tw/ppg/bills/303110086550000/details)
- [外交及國防委員會](https://ppg.ly.gov.tw/ppg/bills/303110085940000/details)
- [司法及法制委員會](https://ppg.ly.gov.tw/ppg/bills/303110086680000/details)

## 🛠 開始使用

### 系統需求

- Node.js 18 或更新版本
- Python 3.x（用於文件轉換）
- OpenAI API 金鑰
- Supabase 專案

### 環境設定

1. 安裝 Python 相依套件：

```bash
pip install markitdown doc2docx
```

2. 複製專案後，建立 `.env` 檔案：

```env
SUPABASE_URL=你的_SUPABASE_URL
SUPABASE_KEY=你的_SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY=你的_OPENAI_API_KEY
```

3. 安裝 Node.js 相依套件：

```bash
pnpm install
```

## 💡 功能特點

- 自動轉換 Word 文件至 Markdown 格式
- 使用 GPT-4 智慧分析提案內容
- 自動判斷提案分類（共 39 個部會分類）
- 自動計算並驗證金額正確性
- 向量化提案內容，便於後續相似度搜尋

## 📝 使用流程

### 1. 檔案格式轉換

將原始 Word 文件轉換為 Markdown 格式：

```bash
./convert-doc-to-md.sh
```

### 2. Markdown 轉 JSON

使用 `GPT-4o` 將提案轉換為結構化資料：

```bash
node convert-md-to-json.js
```

### 3. 資料處理與向量化

處理並上傳資料至 Supabase：

```bash
node supabase-sync.js
```

## 🚨 資料品質說明

資料是由 LLM（大型語言模型）協助轉換，可能存在以下問題：

- 文字辨識錯誤
- 金額計算誤差（LLM 可能誤認金額欄位）
- 其他資料轉換過程中產生的問題

請在使用本資料時謹慎驗證，並以原始資料為準。

## 📊 資料結構

每筆提案資料包含以下欄位：

| 欄位         | 說明           | 範例                                       |
| ------------ | -------------- | ------------------------------------------ |
| `category`   | 部會分類       | 中選會、內政部等（共 39 個分類）           |
| `content`    | 提案內容       | -                                          |
| `action`     | 提案動作       | `減列`、`凍結`、`照列`、`增列`、`其他建議` |
| `proposer`   | 提案人         | 陣列格式                                   |
| `co_signers` | 連署人         | 陣列格式                                   |
| `cost`       | 預算金額（元） | 可為 `null`                                |
| `frozen`     | 凍結金額（元） | 可為 `null`                                |
| `deleted`    | 刪除金額（元） | 可為 `null`                                |
| `added`      | 增加金額（元） | 可為 `null`                                |
| `remarks`    | 備註說明       | 可為 `null`                                |
| `committee`  | 委員會名稱     | -                                          |
| `vector`     | 文字向量       | 由 OpenAI 生成                             |

資料範例：

```json
{
  "category": "中選會",
  "content": "114年度中央選舉委員會及所屬歲出預算...",
  "action": "凍結",
  "proposer": ["徐欣瑩"],
  "co_signers": ["牛煦庭", "麥玉珍"],
  "cost": 1298000,
  "frozen": 200000,
  "deleted": null,
  "added": null,
  "remarks": null,
  "committee": "內政委員會"
}
```

## 📄 授權條款

本專案採用 [CC0 1.0 通用 (CC0 1.0) 公眾領域貢獻宣告](https://creativecommons.org/publicdomain/zero/1.0/deed.zh_TW) 釋出。

您可以：

- 自由複製、修改、發布或展示此資料
- 自由將資料用於商業或非商業用途
- 無需標注來源或作者
- 無需事先取得許可

我們鼓勵您自由取用這些資料進行分析與應用。若您發現任何資料問題，歡迎提出 issue 或發送 pull request。

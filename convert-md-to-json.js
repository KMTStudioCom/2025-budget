import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import asyncPool from "tiny-async-pool";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { calculator } from "@agentic/calculator";
import { createAISDKTools } from "@agentic/ai-sdk";
import process from "process";

// 常數定義
const CONCURRENCY = 5;
const SAVE_INTERVAL = 20;
const EXCLUDED_FILES = [];
const PROCESS_STATUS_FILE = "processed-files.json";

// 錯誤處理相關常數
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 秒

// 提案 Schema 定義
const proposalSchema = z.object({
  category: z.string().describe("分類"),
  content: z.string().describe("提案內容"),
  action: z.enum([
    "減列",
    "凍結",
    "其他建議",
    "照列",
    "增列",
    "減列與凍結",
    "減列與增列",
  ]),
  proposer: z.array(z.string()).describe("提案人").nullable(),
  co_signers: z.array(z.string()).describe("連署人").nullable(),
  cost: z.number().describe("預算金額").nullable(),
  frozen: z.number().describe("凍結金額").nullable(),
  deleted: z.number().describe("減列金額").nullable(),
  added: z.number().describe("增列金額").nullable(),
  remarks: z.string().describe("其他備註").nullable(),
});

// 分類定義
const categories = [
  "通案刪減",
  "內政部",
  "衛福部",
  "交通部",
  "經濟部",
  "國防部",
  "勞動部",
  "環境部",
  "教育部",
  "行政院",
  "NCC",
  "文化部",
  "原民會",
  "中研院",
  "中選會",
  "僑委會",
  "公平會",
  "前瞻計畫",
  "司法院",
  "國安局",
  "國發會",
  "國科會",
  "外交部",
  "客委會",
  "故宮",
  "數發部",
  "財政部",
  "核安會",
  "法務部",
  "海委會",
  "監察院",
  "立法院",
  "總統府",
  "考試院",
  "農業部",
  "退輔會",
  "金管會",
  "陸委會",
  "黨產會",
];

/**
 * 解析提案文本
 * @param {string} text - 原始文本
 * @returns {string[]} 解析後的提案陣列
 */
function parseProposals(text) {
  return text
    .split(/\n(?=\([一二三四五六七八九十百○]+\)|第[0-9]+項|第[0-9]+款|(\d+)\.)/)
    .filter((x) => x && x.trim().length > 0)
    .filter((x) => x.match(/^(?=\([一二三四五六七八九十百]+\))/))
    .map((x) =>
      x
        .trim()
        .replaceAll("\n", "　")
        .replaceAll("提案人：", "\n\n提案人：")
        .replaceAll("連署人：", "\n\n連署人：")
    );
}

/**
 * 生成提案提示詞
 * @param {string} text - 提案文本
 * @param {Error} [error] - 前次錯誤（如果有的話）
 * @returns {string} 完整的提示詞
 */
function generatePrompt(text, error = null) {
  const errorContext = error
    ? `
前次處理發生錯誤：
錯誤類型：${error.name}
錯誤訊息：${error.message}
錯誤堆疊：${error.stack}

請特別注意以下幾點：
1. 檢查金額計算是否正確
2. 確認分類是否在允許的範圍內
3. 驗證提案內容格式是否正確
4. 確保所有必要欄位都已填寫
`
    : "";

  return `請根據以下分類，將提案轉換為 JSON 格式：

分類：
${categories.join("、")}

${errorContext}請根據提案內容解析：
- **分類 (category)**：判斷該提案應屬於哪個分類，例如內政部或黨產會
- **提案內容 (content)**：
  - 移除提案編號並保留原始文字，不要更動
  - 可以使用換行符號換行
- **行動 (action)**：
  - 若提案要求照列預算，選擇 「照列」
  - 若提案要求刪減預算，選擇 「減列」
  - 若提案要求凍結預算，選擇 「凍結」
  - 若提案要求增列預算，選擇 「增列」
  - 若提案為流程改善、政策建議或是未提及明確金額等，選擇「其他建議」
- **提案人 (proposer)**：提案人姓名
  - 提案人若名字為二字，會以全形空白隔開，例如「游　顥」
  - 若提案人未提及，填寫 null
- **連署人 (co_signers)**：連署人姓名
  - 提案人若名字為二字，會以全形空白隔開，例如「游　顥」
  - 若連署人未提及，填寫 null
- **預算金額 (cost)**：原始編列的預算金額，若提案未提及，填寫 null
- **凍結金額 (frozen)**：若無凍結要求，填寫 null
- **減列金額 (deleted)**：若無刪減要求，填寫 null
- **增列金額 (added)**：若無增列要求，填寫 null
- **其他備註 (remarks)**：若有額外資訊可補充，否則填寫 null


* 母提案會以括號開頭像是 (一)
* 子提案會以數字開頭像是 1.
* 無需保留提案編號

* 所有金額計算必須使用 calculator 工具
* 例如：要計算「1000萬」轉換為元，計算 1000 * 10000
* 要計算凍結十分之一，計算 x * 0.1
* 單位大部分是「萬元」，不是「千元」
  - 萬元後面是 4 個 0
  - 千元後面是 3 個 0

可能會夾雜其他文字，如果看起來不像提案可以跳過

<提案>
${text}
</提案>`;
}

/**
 * 延遲函數
 * @param {number} ms - 延遲毫秒數
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 將提案轉換為結構化物件
 * @param {string} text - 提案文本
 * @returns {Promise<Array>} 轉換後的提案物件陣列
 */
export async function convertProposalToObject(text) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { object: generatedObject } = await generateObject({
        model: openai("o3-mini"),
        output: "array",
        schema: proposalSchema,
        maxRetries: 3,
        prompt: generatePrompt(text, lastError),
        tools: createAISDKTools(calculator),
        toolChoice: "required",
      });

      if (!generatedObject || generatedObject.length === 0) {
        throw new Error("AI 返回空結果");
      }

      // 驗證結果
      for (const item of generatedObject) {
        if (!item.category || !categories.includes(item.category)) {
          throw new Error(`無效的分類：${item.category}`);
        }
        if (!item.content || item.content.trim().length === 0) {
          throw new Error("提案內容為空");
        }
      }

      return generatedObject;
    } catch (error) {
      lastError = error;
      console.error(`[提案轉換] 第 ${attempt} 次嘗試失敗：`, {
        error: error.message,
        stack: error.stack,
        text: text.substring(0, 100) + "...", // 只記錄前 100 個字
      });

      if (attempt < MAX_RETRIES) {
        console.log(`[提案轉換] 等待 ${RETRY_DELAY}ms 後重試...`);
        await delay(RETRY_DELAY);
      }
    }
  }

  console.error(`[提案轉換] 所有嘗試都失敗了，最後的錯誤：`, {
    error: lastError.message,
    stack: lastError.stack,
    text: text.substring(0, 100) + "...",
  });

  return [];
}

/**
 * 儲存檔案
 * @param {string} filePath - 檔案路徑
 * @param {Array} content - 要儲存的內容
 */
function saveFile(filePath, content) {
  const dir = path.dirname(filePath);

  // 重新建立目錄並儲存檔案
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    filePath,
    JSON.stringify(
      content
        .sort((a, b) => a.content.localeCompare(b.content))
        .sort((a, b) => a.category.localeCompare(b.category)),
      null,
      2
    )
  );
}

/**
 * 讀取處理狀態
 * @returns {Object} 處理狀態物件
 */
function loadProcessStatus() {
  const defaultStatus = {
    lastUpdated: new Date().toISOString(),
    processedFiles: [],
  };

  try {
    if (fs.existsSync(PROCESS_STATUS_FILE)) {
      return JSON.parse(fs.readFileSync(PROCESS_STATUS_FILE, "utf8"));
    } else {
      fs.writeFileSync(
        PROCESS_STATUS_FILE,
        JSON.stringify(defaultStatus, null, 2)
      );
      return defaultStatus;
    }
  } catch (error) {
    console.error("讀取處理狀態時發生錯誤：", error);
    return defaultStatus;
  }
}

/**
 * 更新處理狀態
 * @param {string} committee - 委員會名稱
 * @param {string} file - 檔案名稱
 */
function updateProcessStatus(committee, file) {
  try {
    const status = loadProcessStatus();
    const fileKey = `${committee}/${file}`;

    if (!status.processedFiles.includes(fileKey)) {
      status.processedFiles.push(fileKey);
    }
    status.lastUpdated = new Date().toISOString();

    fs.writeFileSync(PROCESS_STATUS_FILE, JSON.stringify(status, null, 2));
  } catch (error) {
    console.error("更新處理狀態時發生錯誤：", error);
  }
}

/**
 * 檢查檔案是否已處理
 * @param {string} committee - 委員會名稱
 * @param {string} file - 檔案名稱
 * @returns {boolean} 是否已處理
 */
function isFileProcessed(committee, file) {
  const status = loadProcessStatus();
  return status.processedFiles.includes(`${committee}/${file}`);
}

/**
 * 處理單一檔案
 * @param {string} committee - 委員會名稱
 * @param {string} file - 檔案名稱
 */
async function processFile(committee, file) {
  if (EXCLUDED_FILES.includes(file)) return;
  if (isFileProcessed(committee, file)) {
    console.log(`[${committee}/${file}] 已處理過，跳過`);
    return;
  }

  const proposals = [];
  const text = fs.readFileSync(
    path.join("./markdown", committee, file),
    "utf8"
  );
  const parsedProposals = parseProposals(text);
  let completedProposals = 0;

  for (const item of parsedProposals) {
    const objects = await convertProposalToObject(item);
    completedProposals++;
    console.log(`[${file}] ${completedProposals}/${parsedProposals.length}`);

    if (objects?.length > 0) {
      proposals.push(
        ...objects.map((x) => ({
          ...x,
          committee,
        }))
      );
    }

    if (completedProposals % SAVE_INTERVAL === 0) {
      saveFile(
        path.join(
          "./result",
          committee,
          file.split(".").slice(0, -1).join(".") + ".json"
        ),
        proposals
      );
    }
  }

  saveFile(
    path.join(
      "./result",
      committee,
      file.split(".").slice(0, -1).join(".") + ".json"
    ),
    proposals
  );

  updateProcessStatus(committee, file);
}

/**
 * 主程式
 */
if (process.argv[1].endsWith("convert-md-to-json.js")) {
  const markdownDirs = fs
    .readdirSync("./markdown")
    .filter((x) => fs.statSync(path.join("./markdown", x)).isDirectory());

  const files = {};
  for (const dir of markdownDirs) {
    const dirPath = path.join("./markdown", dir);
    const dirFiles = fs
      .readdirSync(dirPath)
      .filter((x) => x.endsWith(".md"))
      .filter((x) => fs.statSync(path.join(dirPath, x)).isFile());
    files[dir] = dirFiles;
  }

  // 將所有文件任務展平為一個陣列
  const allTasks = [];
  for (const [committee, dirFiles] of Object.entries(files)) {
    for (const file of dirFiles) {
      allTasks.push({ committee, file });
    }
  }

  // 使用立即執行的異步函數來支援頂層 await
  (async () => {
    try {
      let completedFiles = 0;
      const totalFiles = allTasks.length;

      // 使用 for await...of 並行處理所有文件
      for await (const task of asyncPool(
        CONCURRENCY,
        allTasks,
        async (task) => {
          const { committee, file } = task;
          const startTime = Date.now();
          console.log(
            `[${++completedFiles}/${totalFiles}] 開始處理 ${committee}/${file}`
          );

          await processFile(committee, file);

          const duration = (Date.now() - startTime) / 1000;
          console.log(
            `[${completedFiles}/${totalFiles}] 完成處理 ${committee}/${file} (耗時 ${duration.toFixed(
              1
            )}秒)`
          );

          return task;
        }
      )) {
        // 這裡可以加入額外的處理邏輯
      }

      console.log("所有文件處理完成！");
    } catch (error) {
      console.error("處理過程中發生錯誤：", error);
    }
  })();
}

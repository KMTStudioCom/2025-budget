import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import asyncPool from "tiny-async-pool";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { calculator } from "@agentic/calculator";
import { createAISDKTools } from "@agentic/ai-sdk";

// 常數定義
const CONCURRENCY = 5;
const SAVE_INTERVAL = 20;
const EXCLUDED_FILES = [];

// 提案 Schema 定義
const proposalSchema = z.object({
  category: z.string().describe("分類"),
  content: z.string().describe("提案內容"),
  action: z.enum(["減列", "凍結", "減列與凍結", "其他建議", "照列", "增列"]),
  proposer: z.array(z.string()).describe("提案人"),
  co_signers: z
    .array(z.string())
    .describe("連署人")
    .optional()
    .nullable()
    .default([]),
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
    .split(/\n(?=\([一二三四五六七八九十百○]+\)|第[0-9]+項|第[0-9]+款)/)
    .filter((x) => x.trim().length > 0)
    .filter((x) => x.match(/^(?=\([一二三四五六七八九十百]+\))/))
    .map((x) =>
      x
        .trim()
        .replaceAll("\n", "　")
        .replaceAll("提案人：", "\n\n提案人：")
        .replaceAll("連署人：", "\n\n連署人：")
        .replace(/(\d+)\./g, "\n\n$1.")
    );
}

/**
 * 生成提案提示詞
 * @param {string} text - 提案文本
 * @returns {string} 完整的提示詞
 */
function generatePrompt(text) {
  return `請根據以下分類，將提案轉換為 JSON 格式：

分類：
${categories.join("、")}

請根據提案內容解析：
- **分類 (category)**：判斷該提案應屬於哪個分類，例如內政部或黨產會
- **提案內容 (content)**：
- 完整保留提案敘述
- 你可以讓排版更加流暢，但請不要更改任何文字
- 必填
- 可以使用換行符號換行(\\n)
- **行動 (action)**：
- 若提案要求照列預算，選擇 "照列"
- 若提案要求刪減預算，選擇 "減列"
- 若提案要求凍結預算，選擇 "凍結"
- 若提案要求增列預算，選擇 "增列"
- 若提案為流程改善、政策建議等，選擇 "其他建議"
- **提案人 (proposer)**：提案人姓名
- **連署人 (co_signers)**：連署人姓名
- **預算金額 (cost)**：原始編列的預算金額，若提案未提及，填寫 null
- **凍結金額 (frozen)**：若無凍結要求，填寫 null
- **減列金額 (deleted)**：若無刪減要求，填寫 null
- **增列金額 (added)**：若無增列要求，填寫 null
- **其他備註 (remarks)**：若有額外資訊可補充，否則填寫 null

* 金額單位請轉換為元，例如：1000萬請轉換為 10000000
* 單位大部分是「萬元」，不是「千元」
- 萬元後面是 4 個 0
- 千元後面是 3 個 0

* 母提案會以括號開頭像是 (一)
* 子提案會以數字開頭像是 1.
* 處理時請移除提案開頭編號

* 所有金額計算必須使用 calculator 工具
* 例如：要計算 1000萬 轉換為元，計算 1000 * 10000
* 要計算凍結十分之一，計算 x * 0.1

可能會夾雜其他文字，如果看起來不像提案可以跳過

<提案>
${text}
</提案>`;
}

/**
 * 將提案轉換為結構化物件
 * @param {string} text - 提案文本
 * @returns {Promise<Array>} 轉換後的提案物件陣列
 */
async function convertProposalToObject(text) {
  try {
    const { object: generatedObject } = await generateObject({
      model: openai("o3-mini"),
      output: "array",
      schema: proposalSchema,
      maxRetries: 5,
      prompt: generatePrompt(text),
      tools: createAISDKTools(calculator),
      toolChoice: "required",
    });
    return generatedObject;
  } catch (error) {
    console.error("Generation failed:", error);
    return [];
  }
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
 * 處理單一檔案
 * @param {string} committee - 委員會名稱
 * @param {string} file - 檔案名稱
 */
async function processFile(committee, file) {
  if (EXCLUDED_FILES.includes(file)) return;

  const proposals = [];
  const text = fs.readFileSync(
    path.join("./markdown", committee, file),
    "utf8"
  );
  const parsedProposals = parseProposals(text);
  let completedProposals = 0;

  for await (const objects of asyncPool(
    CONCURRENCY,
    parsedProposals,
    async (item) => {
      return await convertProposalToObject(item);
    }
  )) {
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
}

/**
 * 主程式
 */

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
    for await (const task of asyncPool(5, allTasks, async (task) => {
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
    })) {
      // 這裡可以加入額外的處理邏輯
    }

    console.log("所有文件處理完成！");
  } catch (error) {
    console.error("處理過程中發生錯誤：", error);
  }
})();

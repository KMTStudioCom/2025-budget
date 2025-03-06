import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { openai } from "@ai-sdk/openai";
import { embed } from "ai";
import fs from "fs";
import path from "path";
import asyncPool from "tiny-async-pool";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);

// 設定並行處理的數量
const CONCURRENCY = 5;

/**
 * 生成文本的向量嵌入
 * @param {string} text - 要向量化的文本
 * @returns {Promise<number[]>} 向量嵌入
 */
async function generateEmbedding(text) {
  try {
    const { embedding } = await embed({
      model: openai.embedding("text-embedding-3-small"),
      value: text,
    });
    return embedding;
  } catch (error) {
    console.error("Error generating embedding:", error);
    return null;
  }
}

/**
 * 生成提案的向量嵌入
 * @param {Object} item - 提案物件
 * @returns {Promise<Object>} 加入向量嵌入的提案物件
 */
async function generateProposalEmbedding(item) {
  // 組合要向量化的文本
  const textToEmbed = [
    item.content,
    `提案人：${item.proposer}`,
    item.co_signers ? `連署人：${item.co_signers}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  // 生成向量嵌入
  const embedding = await generateEmbedding(textToEmbed);

  return {
    ...item,
    vector: embedding,
  };
}

/**
 * 處理單一委員會的檔案
 * @param {string} committee - 委員會名稱
 * @param {string} file - 檔案名稱
 */
async function processCommitteeFile(committee, file) {
  const filePath = path.join(process.cwd(), "result", committee, file);
  const jsonContent = JSON.parse(fs.readFileSync(filePath, "utf8"));

  // 使用 asyncPool 並行處理向量轉換
  const itemsWithCommittee = [];
  for await (const processedItem of asyncPool(
    CONCURRENCY,
    jsonContent,
    async (item) => {
      const processed = {
        ...item,
        proposer: Array.isArray(item.proposer)
          ? item.proposer.map((x) => x.replaceAll("　", "")).join("、")
          : item.proposer,
        co_signers: Array.isArray(item.co_signers)
          ? item.co_signers.map((x) => x.replaceAll("　", "")).join("、")
          : item.co_signers,
      };
      return await generateProposalEmbedding(processed);
    }
  )) {
    itemsWithCommittee.push(processedItem);
  }

  // 上傳到 Supabase
  const { data, error } = await supabase
    .from("budget_2025_kmt")
    .insert(itemsWithCommittee);

  if (error) {
    console.error(`Error uploading data from ${file}:`, error);
  } else {
    console.log(`Successfully uploaded data from ${file}`);
  }
}

try {
  // 先清空資料表
  const { error: deleteError } = await supabase
    .from("budget_2025_kmt")
    .delete()
    .neq("id", 0); // 刪除所有資料

  if (deleteError) {
    console.error("Error clearing table:", deleteError);
    process.exit(1);
  }
  console.log("Successfully cleared table");

  const resultPath = path.join(process.cwd(), "result");
  const committees = fs
    .readdirSync(resultPath)
    .filter((file) => fs.statSync(path.join(resultPath, file)).isDirectory());

  // 將所有委員會和檔案任務展平為一個陣列
  const allTasks = [];
  for (const committee of committees) {
    const committeePath = path.join(resultPath, committee);
    const files = fs.readdirSync(committeePath);

    for (const file of files) {
      if (file.endsWith(".json")) {
        allTasks.push({ committee, file });
      }
    }
  }

  // 使用 asyncPool 並行處理所有檔案
  let completedFiles = 0;
  const totalFiles = allTasks.length;

  for await (const task of asyncPool(CONCURRENCY, allTasks, async (task) => {
    const { committee, file } = task;
    const startTime = Date.now();
    console.log(
      `[${++completedFiles}/${totalFiles}] 開始處理 ${committee}/${file}`
    );

    await processCommitteeFile(committee, file);

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
  console.error("Error processing files:", error);
}

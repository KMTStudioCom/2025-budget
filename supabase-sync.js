import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { openai } from "@ai-sdk/openai";
import { embed } from "ai";
import fs from "fs";
import path from "path";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);

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

  for (const committee of committees) {
    const committeePath = path.join(resultPath, committee);
    const files = fs.readdirSync(committeePath);

    for (const file of files) {
      if (file.endsWith(".json")) {
        const filePath = path.join(committeePath, file);
        const jsonContent = JSON.parse(fs.readFileSync(filePath, "utf8"));

        // 為每個項目添加委員會資訊並生成向量嵌入
        const itemsWithCommittee = await Promise.all(
          jsonContent.map(async (item) => {
            const processedItem = {
              ...item,
              proposer: Array.isArray(item.proposer)
                ? item.proposer.join("、")
                : item.proposer,
              co_signers: Array.isArray(item.co_signers)
                ? item.co_signers.join("、")
                : item.co_signers,
            };
            return await generateProposalEmbedding(processedItem);
          })
        );

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
    }
  }
} catch (error) {
  console.error("Error processing files:", error);
}

import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import asyncPool from "tiny-async-pool";
import { z } from "zod";
import fs from "fs";
import path from "path";
const markdownDirs = fs
  .readdirSync("./markdown")
  .filter((x) => fs.statSync(path.join("./markdown", x)).isDirectory());
const files = {};
for (let dir of markdownDirs) {
  const dirPath = path.join("./markdown", dir);
  const dirFiles = fs
    .readdirSync(dirPath)
    .filter((x) => x.endsWith(".md"))
    .filter((x) => fs.statSync(path.join(dirPath, x)).isFile());
  files[dir] = dirFiles;
}

const gpt4o = openai("gpt-4o");

const categories = {
  通案刪減: ["通案刪減"],
  內政部: [
    "黨團協商新提案",
    "內政部",
    "警政署及所屬",
    "消防署及所屬",
    "國土管理署及所屬",
    "移民署",
    "國家公園署及所屬",
    "營建建設基金",
    "國家residential及都市更新中心",
    "空中勤務總隊",
    "中央警察大學",
    "建築研究所",
    "消防署及所屬部分",
    "國土永續發展基金",
    "新住民發展基金",
  ],
  衛福部: [
    "黨團協商新提案",
    "衛生福利部",
    "食品藥物管理署",
    "社會及家庭署",
    "國民健康署",
    "中央健康保險署",
    "疾病管制署",
    "衛生福利特別收入基金",
    "國家中醫藥研究所",
    "全民健康保險基金",
    "醫療藥品基金",
    "國民年金保險基金",
    "管制藥品製藥工廠作業基金",
  ],
  交通部: [
    "黨團協商新提案",
    "公路局",
    "交通部",
    "民用航空局",
    "觀光署",
    "航港局",
    "中央氣象署",
    "臺灣鐵路公司",
    "鐵道局",
    "公共工程委員會",
    "桃園國際機場",
    "國道公路建設管理基金",
    "臺灣港務公司",
    "中華郵政",
    "運輸安全調查委員會",
    "運輸研究所",
    "觀光發展基金",
  ],
  經濟部: [
    "黨團協商新提案",
    "經濟部",
    "台灣電力公司",
    "台灣中油股份有限公司",
    "台灣自來水公司",
    "經濟特別收入基金",
    "台灣糖業股份有限公司",
    "水利署",
    "經濟作業基金",
    "產業發展署",
    "中小及新創企業署",
    "水資源作業基金",
    "商業發展署",
    "能源署",
    "標準檢驗局",
    "地質調查及礦業管理中心",
    "產業園區管理局及所屬",
    "國際貿易署",
    "核能發電後端營運基金",
    "智慧財產局",
  ],
  國防部: [
    "黨團協商新提案",
    "國防部",
    "陸軍司令部",
    "國軍生產及服務作業基金",
    "海軍司令部",
    "空軍司令部",
    "全民防衛動員署",
    "軍醫局",
    "國軍老舊眷村改建基金",
    "政治作戰局",
    "軍備局",
    "國軍營舍及設施改建基金",
    "資通電軍指揮部",
    "參謀本部",
    "憲兵指揮部",
    "國防大學",
    "國防醫學院軍事教育基金",
    "軍事情報局",
    "中正國防幹部預備學校",
    "主計局",
    "主計處",
    "電訊發展室",
  ],
  勞動部: [
    "黨團協商新提案",
    "勞動部",
    "勞動力發展署",
    "職業安全衛生署",
    "勞工保險局",
    "勞動及職業安全衛生研究所",
    "勞動基金運用局",
    "職業災害預防及重建中心",
  ],
  環境部: [
    "黨團協商新提案",
    "環境部",
    "環境管理署",
    "資源循環署",
    "氣候變遷署",
    "基金預算",
    "化學物質管理署",
    "國家環境研究院",
    "環境部轄下基金會",
  ],
  教育部: [
    "黨團協商新提案",
    "教育部",
    "體育署",
    "國民及學前教育署",
    "國立大學校務基金",
    "國家運動訓練中心",
    "教育部所屬機構作業基金",
    "國家運動科學中心",
    "國家教育研究院",
    "教育部轄下醫院",
    "青年發展署",
    "國家圖書館",
  ],
  行政院: [
    "黨團協商新提案",
    "行政院",
    "人事行政總處",
    "主計總處",
    "國家發展基金",
    "審計部",
    "促進轉型正義基金",
    "離島建設基金",
    "花東地區永續發展基金",
  ],
  NCC: [
    "黨團協商新提案",
    "通訊傳播監督管理基金",
    "國家通訊傳播委員會",
    "有線廣播電視事業發展基金預算",
  ],
  文化部: [
    "黨團協商新提案",
    "文化部",
    "文化資產局",
    "影視及流行音樂產業局",
    "文化內容策進院",
    "國家表演藝術中心",
    "文化發展基金",
    "臺灣文學館",
    "國立臺灣工藝研究發展中心",
    "國家人權博物館",
    "國家電影及視聽文化中心",
    "臺灣博物館",
    "臺灣史前文化博物館",
    "傳統藝術中心",
    "國父紀念館",
    "Taiwan Plus",
    "中正紀念堂",
    "歷史博物館",
  ],
  原民會: ["黨團協商新提案", "原住民族委員會", "原住民族發展基金"],
  中研院: ["黨團協商新提案", "中央研究院"],
  中選會: ["黨團協商新提案", "中央選舉委員會"],
  僑委會: ["黨團協商新提案", "僑務委員會"],
  公平會: ["黨團協商新提案", "公平交易委員會", "反托拉斯基金"],
  前瞻計畫: ["前瞻基礎建設計畫"],
  司法院: ["黨團協商新提案", "司法院", "法律扶助基金會", "地方法院"],
  國安局: ["國家安全局"],
  國發會: ["黨團協商新提案", "國家發展委員會"],
  國科會: [
    "國家科學及技術委員會及所屬",
    "國家太空中心",
    "國家災害防救科技中心",
    "國家科學及技術委員會及",
  ],
  外交部: ["黨團協商新提案", "外交部", "僑務委員會", "領事事務局"],
  客委會: ["黨團協商新提案", "客家委員會"],
  故宮: ["黨團協商新提案", "國立故宮博物院"],
  數發部: ["黨團協商新提案", "數位發展部", "數位產業署", "資通安全署"],
  財政部: [
    "黨團協商新提案",
    "財政部",
    "公股銀行",
    "賦稅署",
    "中央銀行",
    "臺灣菸酒公司",
    "國庫署",
    "國有財產署",
    "國營金融事業機構",
    "關務署",
    "地方國稅局",
    "財政資訊中心",
    "印刷廠",
  ],
  核安會: ["黨團協商新提案", "核能安全委員會", "原子能科技研究院"],
  法務部: [
    "黨團協商新提案",
    "法務部",
    "矯正署",
    "調查局",
    "臺灣高等檢察署",
    "廉政署",
    "最高檢察署",
    "法醫研究所",
    "行政執行署及所屬",
    "毒品防制基金",
    "矯正署及所屬",
    "法務部矯正機關作業基金",
    "臺灣宜蘭地方檢察署",
    "臺灣臺北地方檢察署",
  ],
  海委會: [
    "黨團協商新提案",
    "海洋委員會",
    "海巡署及所屬",
    "海洋保育署",
    "國家海洋研究院",
    "海洋污染防治基金",
  ],
  監察院: ["黨團協商新提案", "監察院"],
  立法院: ["立法院"],
  總統府: ["黨團協商新提案", "總統府", "國家安全會議", "國史館"],
  考試院: [
    "黨團協商新提案",
    "考試院",
    "考選部",
    "公務人員保障暨培訓委員會",
    "銓敘部",
    "公務人員退休撫卹基金管理局",
    "國家文官學院",
  ],
  農業部: [
    "農業部",
    "黨團協商新提案",
    "農業特別收入基金",
    "農業作業基金",
    "農田水利事業作業基金",
    "農民退休基金",
  ],
  退輔會: ["國軍退除役官兵輔導委員會"],
  金管會: [
    "黨團協商新提案",
    "金融監督管理委員會",
    "銀行局",
    "證券期貨局",
    "檢查局",
    "保險局",
    "金融監督管理基金",
    "中央存款保險公司",
  ],
  陸委會: ["黨團協商新提案", "大陸委員會"],
  黨產會: ["黨團協商新提案", "不當黨產處理委員會"],
};
function sortByRandom(a, b) {
  return Math.random() - 0.5;
}
/**
 * 將提案文本轉換為結構化物件，並透過多次生成取得最可靠的數值結果
 *
 * @param {string} text - 要解析的提案文本
 * @returns {Promise<Array<{
 *   category: string,          // 提案分類（如：內政部、衛福部等）
 *   content: string,          // 提案內容文字
 *   action: "減列"|"凍結"|"減列與凍結"|"其他建議"|"照列"|"增列",  // 提案行動類型
 *   proposer: string[],       // 提案人陣列
 *   co_signers?: string[],    // 連署人陣列（可選）
 *   cost: number|null,        // 原始預算金額（若未提及則為 null）
 *   frozen: number|null,      // 凍結金額（若無則為 null）
 *   deleted: number|null,     // 減列金額（若無則為 null）
 *   added: number|null,       // 增列金額（若無則為 null）
 *   remarks: string|null      // 其他備註（若無則為 null）
 * }>>
 *
 * @description
 * 此函數會:
 * 1. 對每個提案進行多次（預設 3 次）生成
 * 2. 針對關鍵數值欄位（cost, action, frozen, deleted, added）進行頻率統計
 * 3. 選擇出現最多次的值作為最終結果
 * 4. 其他非數值欄位保留第一次生成的結果
 *
 * @example
 * const text = `(一)為加強國安管理，建議將相關預算凍結50萬元。
 *
 * 提案人：王小明
 * 連署人：李大華、張三`;
 *
 * const result = await convertProrosalToObject(text);
 * // [{
 * //   category: "國安局",
 * //   content: "為加強國安管理，建議將相關預算凍結50萬元。",
 * //   action: "凍結",
 * //   proposer: ["王小明"],
 * //   co_signers: ["李大華", "張三"],
 * //   cost: null,
 * //   frozen: 500000,
 * //   deleted: null,
 * //   added: null,
 * //   remarks: null
 * // }]
 *
 * @throws {Error} 如果過程中發生錯誤
 */
async function convertProrosalToObject(text) {
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
  const prompt = `請根據以下分類，將提案轉換為 JSON 格式：

分類：
${Object.keys(categories).join("、")}

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

可能會夾雜其他文字，如果看起來不像提案可以跳過

<提案>
${text}
</提案>
`;
  const attempts = 3; // 設定生成次數
  const results = [];

  // 使用 asyncPool 進行多次生成
  for await (const result of asyncPool(
    3, // 並發數
    Array(attempts).fill(text),
    async (text) => {
      try {
        const { object: generatedObject } = await generateObject({
          model: gpt4o,
          output: "array",
          schema: proposalSchema,
          maxRetries: 5,
          prompt, // 使用你原有的 prompt
        });
        return generatedObject;
      } catch (error) {
        console.error("Generation attempt failed:", error);
        return null;
      }
    },
  )) {
    if (result) results.push(result);
  }

  if (results.length === 0) return [];

  // 只針對特定欄位進行頻率統計
  const targetFields = ["cost", "action", "frozen", "deleted", "added"];
  const fieldFrequency = {
    cost: {},
    action: {},
    frozen: {},
    deleted: {},
    added: {},
  };

  // 統計每個目標欄位的出現頻率
  results.forEach((result) => {
    result.forEach((item) => {
      targetFields.forEach((field) => {
        const value = JSON.stringify(item[field]);
        fieldFrequency[field][value] = (fieldFrequency[field][value] || 0) + 1;
      });
    });
  });

  // 基於第一個結果創建最終結果
  const finalResult = results[0].map((item) => ({ ...item }));

  // 用最常見的值替換目標欄位
  finalResult.forEach((item, index) => {
    targetFields.forEach((field) => {
      const values = fieldFrequency[field];
      let mostFrequent = Object.keys(values)[0];
      let maxCount = values[mostFrequent];

      for (const value in values) {
        if (values[value] > maxCount) {
          mostFrequent = value;
          maxCount = values[value];
        }
      }

      // 如果存在最常見值，則更新該欄位
      if (mostFrequent) {
        item[field] = JSON.parse(mostFrequent);
      }
    });
  });

  console.log("---");
  console.log(text);
  console.log("Results from multiple attempts:", results);
  console.log("Final result:", finalResult);
  return finalResult;
}

function parseProposals(text) {
  const mainSections = text
    .split(/\n(?=\([一二三四五六七八九十百○]+\)|第[0-9]+項|第[0-9]+款)/)
    .filter((x) => x.trim().length > 0)
    .filter((x) => x.match(/^(?=\([一二三四五六七八九十百]+\))/))
    .map((x) =>
      x
        .trim()
        .replaceAll("\n", "　")
        .replaceAll("提案人：", "\n\n提案人：")
        .replaceAll("連署人：", "\n\n連署人：")
        .replace(/(\d+)\./g, "\n\n$1."),
    );
  return mainSections;
}
function saveFile(path, content) {
  // mkdir
  fs.mkdirSync(path.split("/").slice(0, -1).join("/"), { recursive: true });
  // save
  fs.writeFileSync(
    path,
    JSON.stringify(
      content
        .sort((a, b) => a.content.localeCompare(b.content))
        .sort((a, b) => a.category.localeCompare(b.category)),
      null,
      2,
    ),
  );
}
for (const [committee, dirFiles] of Object.entries(files).sort(sortByRandom)) {
  for (let file of dirFiles.sort(sortByRandom)) {
    if (file === "LCEWA01_1102180206272_016.md") continue;
    if (file === "LCEWA01_1102180206272_006.md") continue;

    const proposals = [];
    const text = fs.readFileSync(
      path.join("./markdown", committee, file),
      "utf8",
    );
    const parsedProposals = parseProposals(text).sort(sortByRandom);
    const concurrency = 3;
    let completedProposals = 0;
    for await (const objects of asyncPool(
      concurrency,
      parsedProposals,
      async (item) => {
        return await convertProrosalToObject(item);
      },
    )) {
      completedProposals++;
      console.log(`[${file}] ${completedProposals}/${parsedProposals.length}`);
      if (objects && objects.length > 0) {
        proposals.push(
          ...objects.map((x) => ({
            ...x,
            committee,
          })),
        );
      }
      if (completedProposals % 20 === 0) {
        saveFile(
          path.join(
            "./result",
            committee,
            file.split(".").slice(0, -1).join(".") + ".json",
          ),
          proposals,
        );
      }
    }
    saveFile(
      path.join(
        "./result",
        committee,
        file.split(".").slice(0, -1).join(".") + ".json",
      ),
      proposals,
    );
  }
}

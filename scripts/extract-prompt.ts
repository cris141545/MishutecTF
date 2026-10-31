import fs from "fs";
import readline from "readline";

async function findPrompt() {
  const transcriptPath = "C:\\Users\\María Belén\\.gemini\\antigravity\\brain\\64874c06-ac7a-4d47-9605-a4e7fa94cea1\\.system_generated\\logs\\transcript_full.jsonl";
  const fileStream = fs.createReadStream(transcriptPath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
  let lastUser = "";
  for await (const line of rl) {
    if (line.includes("FASE 10.2") && (line.includes('"source":"USER_EXPLICIT"') || line.includes('"USER_INPUT"'))) {
      try {
        const obj = JSON.parse(line);
        if (obj.content && obj.content.includes("FASE 10.2")) {
          lastUser = obj.content;
        }
      } catch (e) {}
    }
  }
  console.log("Length:", lastUser.length);
  fs.writeFileSync("scripts/prompt-phase10-2.txt", lastUser, "utf-8");
  console.log("Saved to scripts/prompt-phase10-2.txt");
}

findPrompt();

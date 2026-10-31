import fs from "fs";

function checkMedia() {
  const transcriptPath = "C:\\Users\\María Belén\\.gemini\\antigravity\\brain\\64874c06-ac7a-4d47-9605-a4e7fa94cea1\\.system_generated\\logs\\transcript_full.jsonl";
  const content = fs.readFileSync(transcriptPath, "utf-8");
  for (const line of content.split("\n")) {
    if (line.includes("FASE 10.2") && (line.includes('"source":"USER_EXPLICIT"') || line.includes('"USER_INPUT"'))) {
      try {
        const obj = JSON.parse(line);
        console.log("Step index:", obj.step_index);
        console.log("Media items:", JSON.stringify(obj.media, null, 2));
      } catch (e) {}
    }
  }
}

checkMedia();

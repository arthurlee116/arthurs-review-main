import fs from "node:fs";
import path from "node:path";
import { migrate } from "../src/lib/db/migrate";
import { getDataPaths } from "../src/lib/env";
import { assertSemanticStressDirectory, clonePublishedArticlesForStress } from "../src/lib/semantic/stress";

function main() {
  let target = 500;
  let outputPath = "";
  let confirmed = false;

  for (let index = 2; index < process.argv.length; index += 1) {
    const argument = process.argv[index]!;
    if (argument === "--confirm-isolated") {
      confirmed = true;
      continue;
    }
    if (argument !== "--target" && argument !== "--output") throw new Error(`Unknown argument: ${argument}`);
    const value = process.argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value.`);
    if (argument === "--target") target = Number(value);
    else outputPath = value;
    index += 1;
  }

  const dataDirectory = getDataPaths().root;
  assertSemanticStressDirectory(dataDirectory, confirmed);
  migrate();
  const startedAt = new Date().toISOString();
  const result = clonePublishedArticlesForStress(target);
  const output = { ...result, dataDirectory, startedAt, finishedAt: new Date().toISOString() };
  if (outputPath) {
    const destination = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  }
  console.log(JSON.stringify(output));
}

main();

import Database from "better-sqlite3";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const cacheDir = path.join(root, ".font-cache");
const outputDir = path.join(root, "src/app/fonts");
const sourceFont = path.join(cacheDir, "NotoSerifSC-wght.ttf");
const sourceLicense = path.join(cacheDir, "OFL-NotoSerifSC.txt");
const charsetFile = path.join(cacheDir, "noto-serif-sc-subset-chars.txt");

const sourceFontUrl = "https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifsc/NotoSerifSC%5Bwght%5D.ttf";
const sourceLicenseUrl = "https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifsc/OFL.txt";

const staticText = `
Arthur's Review Home About Search Find Archive Contact Studio
时事评论 社会分析 杂七杂八 首页 搜索 关于 文章 分类 标签 摘要 正文 发布 草稿 预览
一座城市如何把人训练成旁观者 短评的锋利应该留一点余温 夜里写下的几行诗
，。！？；：、“”‘’（）《》〈〉—…·/年月日
的一是在不了有和人这中大为上个国我以要他时来用们生到作地于出就分对成会可主发年动同工也能下过子说产种面而方后多定行学法所民得经十三之进着等部度家电力里如水化高自二理起小物现实加量都两体制机当使点从业本去把性好应开它合还因由其些然前外天政四日那社义事平形相全表间样与关各重新线内数正心反你明看原又么利比或但质气第向道命此变条只没结解问意建月公无系军很情者最立代想已通并提直题党程展五果料象员革位入常文总次品式活设及管特件长求老头基资边流路级少图山统接知较将组见计别她手角期根论运农指几九区强放决西被干做必战先回则任取据处队南给色光门即保治北造百规热领七海口东导器压志世金增争济阶油思术极交受联什认六共权收证改清美再采转更单风切打白教速花带安场身车例真务具万每目至达走积示议声报斗完类八离华名确才科张信马节话米整空元况今集温传土许步群广石记需段研界拉林律叫且究观越织装影算低持音众书布复容儿须际商非验连断深难近矿千周委素技备半办青省列习响约支般史感劳便团往酸历市克何除消构府称太准精值号率族维划选标写存候毛亲快效斯院查江型眼王按格养易置派层片始却专状育厂京识适属圆包火住调满县局照参红细引听该铁价严龙飞`;

const textFiles = [
  "README.md",
  "src/app",
  "src/components",
  "src/lib/content",
];

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`${command} ${args.join(" ")} failed`);
  }
}

function download(url, destination) {
  if (fs.existsSync(destination)) return Promise.resolve();
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        download(new URL(response.headers.location, url).toString(), destination).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Download failed ${response.statusCode}: ${url}`));
        return;
      }
      const file = fs.createWriteStream(destination);
      response.pipe(file);
      file.on("finish", () => file.close(resolve));
      file.on("error", reject);
    });
    request.on("error", reject);
  });
}

function collectFromPath(target, chunks) {
  if (!fs.existsSync(target)) return;
  const stat = fs.statSync(target);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(target)) {
      if (entry === "studio" || entry === "api" || entry.startsWith(".")) continue;
      collectFromPath(path.join(target, entry), chunks);
    }
    return;
  }
  if (!/\.(md|ts|tsx|json|txt)$/.test(target)) return;
  chunks.push(fs.readFileSync(target, "utf8"));
}

function collectMarkdown(chunks) {
  const markdownDir = path.join(root, "data/markdown");
  collectFromPath(markdownDir, chunks);
}

function collectDatabaseText(chunks) {
  const dbPath = path.join(root, "data/arthurs-review.sqlite3");
  if (!fs.existsSync(dbPath)) return;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    for (const table of ["articles", "settings", "tags"]) {
      const rows = db.prepare(`select * from ${table}`).all();
      chunks.push(JSON.stringify(rows));
    }
  } finally {
    db.close();
  }
}

function buildCharset() {
  const chunks = [staticText];
  for (const relative of textFiles) collectFromPath(path.join(root, relative), chunks);
  collectMarkdown(chunks);
  collectDatabaseText(chunks);

  for (let code = 0x20; code <= 0x7e; code += 1) chunks.push(String.fromCharCode(code));
  const chars = [...new Set(chunks.join("").normalize("NFC"))].filter((char) => !/[\u0000-\u001f]/.test(char));
  chars.sort((a, b) => a.codePointAt(0) - b.codePointAt(0));
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(charsetFile, chars.join(""), "utf8");
  return chars.length;
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  await download(sourceFontUrl, sourceFont);
  await download(sourceLicenseUrl, sourceLicense);
  fs.copyFileSync(sourceLicense, path.join(outputDir, "OFL-NotoSerifSC.txt"));

  const glyphCount = buildCharset();
  const weights = [
    ["400", "noto-serif-sc-subset-400.woff2"],
    ["700", "noto-serif-sc-subset-700.woff2"],
  ];

  for (const [weight, fileName] of weights) {
    const instancePath = path.join(cacheDir, `NotoSerifSC-${weight}.ttf`);
    const outputPath = path.join(outputDir, fileName);
    run("fonttools", ["varLib.instancer", sourceFont, "--static", "--update-name-table", `wght=${weight}`, "-o", instancePath]);
    run("pyftsubset", [
      instancePath,
      `--text-file=${charsetFile}`,
      `--output-file=${outputPath}`,
      "--flavor=woff2",
      "--layout-features=*",
      "--glyph-names",
      "--symbol-cmap",
      "--legacy-cmap",
      "--notdef-glyph",
      "--notdef-outline",
      "--recommended-glyphs",
      "--name-IDs=*",
      "--name-legacy",
      "--name-languages=*",
      "--drop-tables+=DSIG",
    ]);
  }

  const sizes = weights.map(([, fileName]) => {
    const size = fs.statSync(path.join(outputDir, fileName)).size;
    return `${fileName}: ${(size / 1024).toFixed(1)} KiB`;
  });
  console.log(`Subset ${glyphCount} characters using ${os.platform()} ${os.arch()}`);
  console.log(sizes.join("\n"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

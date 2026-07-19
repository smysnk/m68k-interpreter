import fs from "node:fs";
import path from "node:path";
import { writePagesBadges } from "./pages-badge-utils.mjs";

const options = parseArguments(process.argv.slice(2));
const report = JSON.parse(fs.readFileSync(path.resolve(options.report), "utf8"));

writePagesBadges({
  report,
  outputDir: options.output,
});

console.log(`Published Pages badges to ${path.resolve(options.output)}`);

function parseArguments(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if ((flag !== "--report" && flag !== "--output") || !value) {
      throw new Error("Usage: generate-pages-badges.mjs --report <path> --output <directory>");
    }
    options[flag.slice(2)] = value;
  }

  if (!options.report || !options.output) {
    throw new Error("Usage: generate-pages-badges.mjs --report <path> --output <directory>");
  }

  return options;
}

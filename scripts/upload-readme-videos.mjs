import { readFile, stat, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { getGitHubCookieFromBrowser } from "./github-cookie-browser.mjs";

const rootDir = resolve(new URL("..", import.meta.url).pathname);
const repositoryId = process.env.GITHUB_REPOSITORY_ID ?? "1184317870";
const repositorySlug = process.env.GITHUB_REPOSITORY ?? "smysnk/m68k-interpreter";
const readmeAssetBranch = process.env.README_ASSET_BRANCH ?? "main";

const readmeFile = resolve(rootDir, "README.md");

const videoEntries = [
  {
    title: "M68K Interpreter Demo",
    file: resolve(rootDir, "docs/assets/m68k-interpreter-nibbles-demo.mp4"),
  },
];

const defaultHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
  origin: "https://github.com",
  referer: "https://github.com/",
};

const filterHeaders = (headers) =>
  Object.fromEntries(Object.entries(headers).filter(([, value]) => value !== undefined && value !== null));

const buildReadmePreviewUrl = (filePath) => {
  const previewFileName = basename(filePath).replace(/\.mp4$/u, ".webp");
  return `https://raw.githubusercontent.com/${repositorySlug}/${readmeAssetBranch}/docs/assets/${previewFileName}`;
};

const buildPreviewLink = (href, previewUrl, title) => `[![${title}](${previewUrl})](${href})`;

const uploadVideo = async (filePath, githubCookie) => {
  const fileName = basename(filePath);
  const fileBuffer = await readFile(filePath);
  const fileInfo = await stat(filePath);
  const file = new File([fileBuffer], fileName, { type: "video/mp4" });

  const policyBody = new FormData();
  policyBody.append("repository_id", String(repositoryId));
  policyBody.append("name", file.name);
  policyBody.append("size", String(fileInfo.size));
  policyBody.append("content_type", file.type);

  const policyResponse = await fetch("https://github.com/upload/policies/assets", {
    method: "POST",
    body: policyBody,
    headers: filterHeaders({
      ...defaultHeaders,
      cookie: githubCookie,
      Accept: "application/json",
      "GitHub-Verified-Fetch": "true",
      "X-Requested-With": "XMLHttpRequest",
    }),
  });

  if (!policyResponse.ok) {
    const text = await policyResponse.text();
    throw new Error(
      `Failed to create upload policy for ${fileName}: ${policyResponse.status} ${policyResponse.statusText}\n${text.slice(
        0,
        400
      )}`
    );
  }

  const policy = await policyResponse.json();

  const uploadBody = new FormData();
  for (const [key, value] of Object.entries(policy.form ?? {})) {
    uploadBody.append(key, String(value));
  }
  uploadBody.append("file", file, file.name);

  const uploadResponse = await fetch(policy.upload_url, {
    method: "POST",
    body: uploadBody,
    headers: filterHeaders({
      ...defaultHeaders,
      cookie: githubCookie,
      authenticity_token: policy.same_origin ? policy.upload_authenticity_token : undefined,
      ...policy.header,
    }),
  });

  if (!uploadResponse.ok) {
    const text = await uploadResponse.text();
    throw new Error(
      `Failed to upload ${fileName}: ${uploadResponse.status} ${uploadResponse.statusText}\n${text.slice(
        0,
        400
      )}`
    );
  }

  const finalizeBody = new FormData();
  finalizeBody.append("authenticity_token", policy.asset_upload_authenticity_token);

  const finalizeResponse = await fetch(new URL(policy.asset_upload_url, "https://github.com/"), {
    method: "PUT",
    body: finalizeBody,
    headers: filterHeaders({
      ...defaultHeaders,
      cookie: githubCookie,
      Accept: "application/json",
      "X-Requested-With": "XMLHttpRequest",
    }),
  });

  if (!finalizeResponse.ok) {
    const text = await finalizeResponse.text();
    throw new Error(
      `Failed to finalize ${fileName}: ${finalizeResponse.status} ${finalizeResponse.statusText}\n${text.slice(
        0,
        400
      )}`
    );
  }

  return policy.asset?.href;
};

const updateReadme = async (uploads) => {
  let readme = await readFile(readmeFile, "utf8");

  for (const { title, href, previewUrl } of uploads) {
    const linkedPreviewPattern = new RegExp(
      String.raw`\[!\[${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\]\([^)]+\)\]\([^)]+\)`,
      "g"
    );
    const replacement = buildPreviewLink(href, previewUrl, title);
    readme = readme.replace(linkedPreviewPattern, replacement);
  }

  await writeFile(readmeFile, readme);
};

const main = async () => {
  const githubCookie = process.env.GITHUB_COOKIE
    ? process.env.GITHUB_COOKIE
    : await getGitHubCookieFromBrowser({ log: console.log });

  const uploads = [];

  for (const entry of videoEntries) {
    const href = await uploadVideo(entry.file, githubCookie);

    if (!href) {
      throw new Error(`GitHub did not return an attachment URL for ${basename(entry.file)}.`);
    }

    uploads.push({
      title: entry.title,
      href,
      previewUrl: buildReadmePreviewUrl(entry.file),
    });

    console.log(`${entry.title}: ${href}`);
  }

  await updateReadme(uploads);
  console.log(`Updated ${readmeFile} with GitHub user-attachments video URLs.`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

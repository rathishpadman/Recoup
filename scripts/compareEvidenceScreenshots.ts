import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { chromium } from "playwright";

interface BaselineCapture {
  liveRoute?: boolean;
  name?: string;
  screenshot?: string;
}

interface BaselineManifest {
  captures?: BaselineCapture[];
}

interface DiffResult {
  baselinePath: string;
  changedPixelRatio?: number;
  error?: string;
  maxChangedPixelRatio: number;
  pass: boolean;
  postPath: string;
  route: string;
}

const auditDate = process.env.RECOUP_REAL_EVIDENCE_AUDIT_DATE ?? "2026-07-01";
const baselineRoot = process.env.RECOUP_VISUAL_BASELINE_ROOT ?? join("docs", "audit", "real-evidence-baseline", auditDate);
const postRoot = process.env.RECOUP_VISUAL_POST_ROOT ?? join("docs", "audit", "real-evidence-post-implementation", auditDate);
const comparisonPath =
  process.env.RECOUP_VISUAL_DIFF_OUTPUT ?? join("docs", "audit", "real-evidence-comparison", `${auditDate}-visual-diff.json`);
const maxChangedPixelRatio = Number(process.env.RECOUP_VISUAL_MAX_CHANGED_PIXEL_RATIO ?? "0.35");

async function main(): Promise<void> {
  const manifest = await readBaselineManifest();
  const pairs = manifest.captures
    ?.filter((capture): capture is Required<Pick<BaselineCapture, "name" | "screenshot">> & BaselineCapture =>
      capture.liveRoute === true && typeof capture.name === "string" && typeof capture.screenshot === "string"
    )
    .map((capture) => ({
      baselinePath: join(baselineRoot, "screenshots", capture.screenshot),
      postPath: join(postRoot, "screenshots", capture.screenshot),
      route: capture.name
    }));

  if (pairs === undefined || pairs.length === 0) {
    throw new Error(`No live baseline captures found in ${join(baselineRoot, "manifest.json")}.`);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const results: DiffResult[] = [];

  try {
    for (const pair of pairs) {
      if (!(await exists(pair.baselinePath))) {
        results.push({ ...pair, error: "Baseline screenshot is missing.", maxChangedPixelRatio, pass: false });
        continue;
      }
      if (!(await exists(pair.postPath))) {
        results.push({ ...pair, error: "Post-implementation screenshot is missing.", maxChangedPixelRatio, pass: false });
        continue;
      }

      const baselineUrl = await asDataUrl(pair.baselinePath);
      const postUrl = await asDataUrl(pair.postPath);
      const result = await page.evaluate(
        async (input: { baselineUrl: string; maxChangedPixelRatio: number; postUrl: string }) => {
          const baseline = new Image();
          baseline.src = input.baselineUrl;
          await baseline.decode();

          const post = new Image();
          post.src = input.postUrl;
          await post.decode();

          const width = Math.min(baseline.naturalWidth, post.naturalWidth);
          const height = Math.min(baseline.naturalHeight, post.naturalHeight);
          if (width === 0 || height === 0) {
            return { changedPixelRatio: 1, pass: false };
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d");
          if (context === null) {
            return { changedPixelRatio: 1, pass: false };
          }

          context.drawImage(baseline, 0, 0, width, height);
          const first = context.getImageData(0, 0, width, height).data;
          context.clearRect(0, 0, width, height);
          context.drawImage(post, 0, 0, width, height);
          const second = context.getImageData(0, 0, width, height).data;

          let changed = 0;
          for (let index = 0; index < first.length; index += 4) {
            const delta =
              Math.abs((first[index] ?? 0) - (second[index] ?? 0)) +
              Math.abs((first[index + 1] ?? 0) - (second[index + 1] ?? 0)) +
              Math.abs((first[index + 2] ?? 0) - (second[index + 2] ?? 0));
            if (delta > 48) {
              changed += 1;
            }
          }

          const changedPixelRatio = changed / (width * height);

          return { changedPixelRatio, pass: changedPixelRatio <= input.maxChangedPixelRatio };
        },
        { baselineUrl, maxChangedPixelRatio, postUrl }
      );
      results.push({ ...pair, ...result, maxChangedPixelRatio });
    }
  } finally {
    await browser.close();
  }

  await mkdir(dirname(comparisonPath), { recursive: true });
  await writeFile(comparisonPath, `${JSON.stringify(results, null, 2)}\n`);

  const failed = results.filter((result) => !result.pass);
  if (failed.length > 0) {
    throw new Error(`Visual diff failed for ${failed.map((result) => result.route).join(", ")}. Report: ${comparisonPath}`);
  }
}

async function readBaselineManifest(): Promise<BaselineManifest> {
  const path = join(baselineRoot, "manifest.json");
  const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
  if (!isRecord(parsed) || !Array.isArray(parsed.captures)) {
    throw new Error(`${path} is missing a captures array.`);
  }

  return { captures: parsed.captures as BaselineCapture[] };
}

async function asDataUrl(path: string): Promise<string> {
  const bytes = await readFile(path);

  return `data:image/png;base64,${bytes.toString("base64")}`;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);

    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

await main();

/**
 * Copies every file from one R2 bucket to another inside Cloudflare (nothing is downloaded), then checks both match.
 * Used for the audio bucket move (docs/06-plan.md). Never deletes anything; files already in the destination at the
 * same size are skipped, so it is safe to run again (runbook step 6).
 *
 * The key is asked for when it runs (typed or pasted, not shown), never taken from arguments, so it stays out of shell
 * history and the screen:
 *   R2_ACCOUNT=<account id> npx tsx scripts/copy-bucket.ts floortest-audio floortest-audio-eu [--dry-run]
 * (R2_KEY / R2_SECRET in the environment are used instead, if set.)
 */
import { CopyObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import readline from "node:readline";

const [from, to] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const dryRun = process.argv.includes("--dry-run");
const { R2_ACCOUNT } = process.env;
if (!from || !to || from === to || !R2_ACCOUNT) {
  console.error("Usage: R2_ACCOUNT=<account id> npx tsx scripts/copy-bucket.ts <from> <to> [--dry-run]");
  process.exit(1);
}

/** Asks for a value without echoing what's typed or pasted. */
function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let muted = false;
    // Show the question, then hide everything typed or pasted after it.
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s) => {
      if (!muted) process.stdout.write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer.trim());
    });
    muted = true;
  });
}

let s3: S3Client;

async function list(bucket: string) {
  const files = new Map<string, number>();
  let token: string | undefined;
  do {
    const r = await s3.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }));
    for (const o of r.Contents ?? []) if (o.Key) files.set(o.Key, Number(o.Size ?? 0));
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return files;
}

async function main() {
  const key = process.env.R2_KEY || (await askHidden("Access Key ID (hidden): "));
  const secret = process.env.R2_SECRET || (await askHidden("Secret Access Key (hidden): "));
  if (!key || !secret) throw new Error("No key entered");
  s3 = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: key, secretAccessKey: secret },
  });
  const source = await list(from);
  const before = await list(to);
  const todo = [...source].filter(([key, size]) => before.get(key) !== size);
  console.log(`${from}: ${source.size} files. ${to}: ${before.size} files. To copy: ${todo.length}.`);
  if (dryRun) {
    for (const [key, size] of todo) console.log(`  would copy ${key} (${size} bytes)`);
    return;
  }
  for (const [key, size] of todo) {
    await s3.send(new CopyObjectCommand({ Bucket: to, Key: key, CopySource: `${from}/${encodeURIComponent(key).replace(/%2F/g, "/")}` }));
    console.log(`  copied ${key} (${size} bytes)`);
  }
  const after = await list(to);
  const wrong = [...source].filter(([key, size]) => after.get(key) !== size);
  console.log(wrong.length ? `Check: ${wrong.length} not matching:\n${wrong.map(([k]) => `  ${k}`).join("\n")}` : `Check: all ${source.size} files in ${to} at the same size.`);
  if (wrong.length) process.exit(1);
}

main().catch((e) => {
  console.error(`Stopped: ${(e as Error).name}: ${(e as Error).message}`);
  process.exit(1);
});

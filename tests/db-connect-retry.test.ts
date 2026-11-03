import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { isConnectError, withConnectRetry } from "../src/lib/db/retry";

// One retry when the database couldn't be reached (owner, 3 Nov; incidents #38 and #39): only for errors that come
// before a query is sent, never for one that may have run.
const connectErr = (code: string) => Object.assign(new Error(`write ${code} db.example:5432`), { code, errno: code });
const noWait = async () => {};

/** A fake query: fails with each error in `errors` in turn, then answers. */
function fake(errors: unknown[]) {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    work: async () => {
      calls++;
      const e = errors.shift();
      if (e) throw e;
      return { rows: [{ n: 1 }] };
    },
  };
}

test("a query that couldn't connect once is tried again and answers, with a log line and no error", async () => {
  const q = fake([connectErr("CONNECT_TIMEOUT")]);
  const warned: string[] = [];
  const warn = console.warn;
  console.warn = (m: string) => void warned.push(m);
  try {
    assert.deepEqual(await withConnectRetry(q.work, undefined, noWait), { rows: [{ n: 1 }] });
  } finally {
    console.warn = warn;
  }
  assert.equal(q.calls, 2);
  assert.equal(warned.length, 1);
  assert.match(warned[0], /CONNECT_TIMEOUT.*recovered/);
  assert.doesNotMatch(warned[0], /db\.example/, "no host in the log line");
});

test("two connect failures in a row are thrown (the incident), after one retry only", async () => {
  const q = fake([connectErr("ECONNREFUSED"), connectErr("CONNECT_TIMEOUT")]);
  await assert.rejects(withConnectRetry(q.work, undefined, noWait), /CONNECT_TIMEOUT/);
  assert.equal(q.calls, 2);
});

test("only connect failures count: Neon's startup refusals yes; anything that may have run, never", async () => {
  for (const code of ["CONNECT_TIMEOUT", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"]) assert.equal(isConnectError(connectErr(code)), true, code);
  assert.equal(isConnectError(Object.assign(new Error("Control plane request failed"), { severity: "FATAL" })), true);
  assert.equal(isConnectError(new Error("Couldn't connect to compute node")), true);
  // After the query may have been sent: a reset, a closed or destroyed connection, a statement timeout, a constraint.
  const after = [
    Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }),
    connectErr("CONNECTION_CLOSED"),
    connectErr("CONNECTION_DESTROYED"),
    Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" }),
    Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" }),
  ];
  for (const e of after) {
    assert.equal(isConnectError(e), false, String((e as Error).message));
    const q = fake([e]);
    await assert.rejects(withConnectRetry(q.work, undefined, noWait));
    assert.equal(q.calls, 1, "not retried");
  }
  assert.equal(isConnectError(null), false);
  assert.equal(isConnectError("CONNECT_TIMEOUT"), false);
});

test("a transaction is tried again only if it couldn't start, never once its body began", async () => {
  // Couldn't start: the body never ran, so the whole transaction runs again.
  let started = false;
  let bodies = 0;
  const failsBeforeBody = fake([connectErr("CONNECT_TIMEOUT")]);
  const tx = () => failsBeforeBody.work().then((r) => ((started = true), bodies++, r));
  const warn = console.warn;
  console.warn = () => {};
  try {
    await withConnectRetry(tx, () => !started, noWait);
  } finally {
    console.warn = warn;
  }
  assert.equal(bodies, 1, "the body ran once");

  // Began, then a connect-looking error: not repeated, so nothing in it can happen twice.
  started = false;
  let runs = 0;
  const midway = async () => {
    started = true;
    runs++;
    throw connectErr("CONNECT_TIMEOUT");
  };
  await assert.rejects(withConnectRetry(midway, () => !started, noWait), /CONNECT_TIMEOUT/);
  assert.equal(runs, 1);
});

test("the Postgres client has a 10 s connect timeout and every query and transaction goes through the retry", () => {
  const src = fs.readFileSync(path.join(__dirname, "../src/lib/db/client.ts"), "utf8");
  assert.match(src, /connect_timeout: 10,/);
  assert.match(src, /query: \(text, params\) => withConnectRetry\(\(\) => slot\(/, "the pause sits outside the connection slot");
  assert.match(src, /started = true;\s*\n\s*return fn\(/, "the transaction marks its body as started");
  assert.match(src, /\(\) => !started,/);
});

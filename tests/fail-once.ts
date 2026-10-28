/**
 * Test helper: the first statement whose SQL matches `pattern` fails as if the database connection dropped, whether it
 * runs on `q` directly or inside a `q.tx`. Returns a function that puts `q` back.
 */
type Q = {
  run: (sql: string, ...args: unknown[]) => Promise<unknown>;
  tx: <T>(fn: (db: never) => Promise<T>) => Promise<T>;
};

export const DROPPED = "Connection terminated unexpectedly";

export function failOnce(q: Q, pattern: RegExp) {
  const { run, tx } = q;
  let armed = true;
  const fire = (sql: string) => {
    if (!armed || !pattern.test(sql)) return;
    armed = false;
    throw new Error(DROPPED);
  };
  q.run = async (sql: string, ...args: unknown[]) => {
    fire(sql);
    return run.call(q, sql, ...args);
  };
  q.tx = <T>(fn: (db: never) => Promise<T>) =>
    tx.call(q, (db: Record<string, unknown>) =>
      fn(
        new Proxy(db, {
          get(target, prop) {
            const v = target[prop as string];
            if (typeof v !== "function") return v;
            if (prop === "run" || prop === "get" || prop === "all")
              return async (sql: string, ...args: unknown[]) => {
                fire(sql);
                return (v as (...a: unknown[]) => unknown).call(target, sql, ...args);
              };
            return (v as (...a: unknown[]) => unknown).bind(target);
          },
        }) as never,
      ),
    ) as Promise<T>;
  return () => {
    q.run = run;
    q.tx = tx;
  };
}

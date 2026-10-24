import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { MIGRATIONS } from "../src/lib/db/migrations";

test("every foreign key has an index that starts with its columns", async () => {
  const pg = await PGlite.create();
  await pg.exec("create table schema_migrations (id text primary key, applied_at bigint not null)");
  for (const m of MIGRATIONS) await pg.exec(m.sql);
  const missing = await pg.query<{ fk: string }>(`
    select c.conrelid::regclass::text || '(' || string_agg(a.attname, ',' order by x.n) || ')' as fk
    from pg_constraint c
    cross join lateral unnest(c.conkey) with ordinality as x(attnum, n)
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = x.attnum
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace
      and not exists (select 1 from pg_index i where i.indrelid = c.conrelid
        and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] @> c.conkey
        and c.conkey @> (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1])
    group by c.conrelid, c.conname`);
  assert.deepEqual(missing.rows.map((r) => r.fk), [], "add an index for these in a new migration");
  await pg.close();
});

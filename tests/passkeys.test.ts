import assert from "node:assert/strict";
import { test } from "node:test";
import { pickRelyingParty } from "../src/lib/passkey-rp";

test("the live address is the relying party, with its exact origin", () => {
  assert.deepEqual(pickRelyingParty("floortest.app", "https://floortest.app"), { rpID: "floortest.app", origin: "https://floortest.app" });
  assert.deepEqual(pickRelyingParty("FloorTest.app", "https://floortest.app/"), { rpID: "floortest.app", origin: "https://floortest.app" });
});

test("local development keeps its port in the origin but not in the rpID", () => {
  assert.deepEqual(pickRelyingParty("localhost:3000", "http://localhost:3000"), { rpID: "localhost", origin: "http://localhost:3000" });
  assert.equal(pickRelyingParty("localhost:3001", "http://localhost:3000"), null);
});

test("any other host is refused, including look-alikes and subdomains", () => {
  for (const host of ["evil.example", "floortest.app.evil.example", "evilfloortest.app", "ops.floortest.app", "", null]) {
    assert.equal(pickRelyingParty(host, "https://floortest.app"), null, String(host));
  }
});

test("a preview accepts only its own Vercel addresses", () => {
  const extra = ["floortest-git-mobile-next-team.vercel.app", "https://floortest-abc123-team.vercel.app"];
  assert.deepEqual(pickRelyingParty("floortest-git-mobile-next-team.vercel.app", "https://floortest-abc123-team.vercel.app", extra), {
    rpID: "floortest-git-mobile-next-team.vercel.app",
    origin: "https://floortest-git-mobile-next-team.vercel.app",
  });
  assert.equal(pickRelyingParty("someone-else.vercel.app", "https://floortest-abc123-team.vercel.app", extra), null);
  // A listed host that isn't on vercel.app never counts as an extra.
  assert.equal(pickRelyingParty("evil.example", "https://floortest.app", ["evil.example"]), null);
  assert.equal(pickRelyingParty("x.vercel.app", "https://floortest.app", [undefined, ""]), null);
});

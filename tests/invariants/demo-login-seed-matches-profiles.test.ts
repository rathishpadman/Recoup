import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { cockpitDemoProfiles } from "../../config/cockpitDemoProfiles.js";

/**
 * The demo login seed and the canonical profile contract must agree exactly.
 *
 * Sign-in reads the stored record, compares its allowed_routes against
 * `cockpitDemoProfiles` and refuses on any difference. So adding a route in
 * code without adding it to the seed does not widen access — it locks the
 * account out entirely, and the only symptom is "Invalid demo credentials",
 * which reads like a wrong password.
 *
 * That happened: /agent-operations was granted in code and Maya and the CFO
 * could no longer sign in at all. Nothing caught it, because every unit test
 * reads the profile contract and never the SQL that has to mirror it.
 */

/**
 * Only the seed rows.
 *
 * The login ids also appear in the table's `check (role in (...))` constraint
 * further up the file, so a search over the whole text finds that first and
 * then reads the next account's routes.
 */
function seedSql(): string {
  const sql = readFileSync("docs/supabase-demo-login-schema.sql", "utf8");
  const valuesAt = sql.indexOf(") values");

  if (valuesAt === -1) {
    throw new Error("No seed VALUES clause found in the demo login schema.");
  }

  return sql.slice(valuesAt);
}

/**
 * The array[...] literal seeded for one login id.
 *
 * Scanned by index rather than matched with one regex across the whole file:
 * the rows sit inside a single multi-line VALUES clause, so a pattern that can
 * cross a row boundary happily returns the wrong account's routes.
 */
function seededRoutes(sql: string, loginId: string): string[] {
  const rowStart = sql.indexOf(`'${loginId}'`);

  if (rowStart === -1) {
    throw new Error(`No seeded row found for ${loginId}.`);
  }

  const arrayStart = sql.indexOf("array[", rowStart);
  const arrayEnd = sql.indexOf("]", arrayStart);

  if (arrayStart === -1 || arrayEnd === -1) {
    throw new Error(`No seeded allowed_routes found for ${loginId}.`);
  }

  return sql
    .slice(arrayStart + "array[".length, arrayEnd)
    .split(",")
    .map((entry) => entry.trim().replace(/^'|'$/gu, ""))
    .filter((entry) => entry.length > 0)
    .sort();
}

describe("demo login seed matches the profile contract", () => {
  const sql = seedSql();

  for (const profile of cockpitDemoProfiles) {
    it(`seeds exactly the routes ${profile.loginId} is granted in code`, () => {
      expect(seededRoutes(sql, profile.loginId)).toEqual([...profile.allowedRoutes].sort());
    });
  }

  it("seeds a default route each profile is actually allowed to reach", () => {
    for (const profile of cockpitDemoProfiles) {
      const seeded = seededRoutes(sql, profile.loginId);
      const reachable = seeded.some(
        (route) => profile.defaultRoute === route || profile.defaultRoute.startsWith(`${route}/`)
      );

      expect(reachable, `${profile.loginId} lands on ${profile.defaultRoute}`).toBe(true);
    }
  });

  it("keeps every profile in the seed", () => {
    for (const profile of cockpitDemoProfiles) {
      expect(sql).toContain(`'${profile.loginId}'`);
    }
  });
});

import { test } from "vitest";
import assert from "node:assert/strict";
import {
  parseApplicationFilters,
  applicationPageHref,
  applicationSearchExpression,
} from "../lib/application-filters";

test("filter input rejects repeated parameters, invalid enum values, and invalid pages", () => {
  for (const page of ["-1", "0", "1.5", "Infinity", "nonsense"])
    assert.equal(parseApplicationFilters({ page }).page, 1);
  const filters = parseApplicationFilters({
    q: ["one", "two"],
    status: "bad",
    priority: "admin",
    overdue: "true",
    sort: "random",
    view: "secret",
  });
  assert.deepEqual(filters, {
    q: "",
    village: "",
    status: "",
    priority: "",
    overdue: "",
    sort: "oldest",
    view: "",
    page: 1,
  });
  assert.equal(parseApplicationFilters({ q: "  ಮಾದರಿ  " }).q, "ಮಾದರಿ");
  assert.equal(parseApplicationFilters({ q: "x".repeat(100) }).q.length, 80);
});

test("pagination preserves combined filters and safely encodes Kannada and reserved characters", () => {
  const filters = parseApplicationFilters({
    q: "ಅ & ?",
    village: "ಮಾದರಿ ಗ್ರಾಮ ೧",
    status: "SUBMITTED",
    priority: "HIGH",
    overdue: "no",
    sort: "target",
    view: "pending",
  });
  const target = new URL(applicationPageHref(filters, 2), "http://localhost");
  assert.equal(target.pathname, "/applications");
  for (const [key, value] of Object.entries(filters))
    assert.equal(
      target.searchParams.get(key),
      key === "page" ? "2" : String(value),
    );
});

test("search supports partial IDs, names, and exact UUIDs while quoting PostgREST grammar", () => {
  assert.match(
    applicationSearchExpression("0001"),
    /reference_number.ilike."%0001%",applicant_name.ilike."%0001%"/,
  );
  assert.match(
    applicationSearchExpression("10000000-0000-4000-8000-000000000001"),
    /,id.eq.10000000-0000-4000-8000-000000000001$/,
  );
  assert.ok(
    applicationSearchExpression('a"),id.gt.0').includes('a\\"),id.gt.0'),
  );
  assert.ok(applicationSearchExpression("%").includes("\\\\%"));
});

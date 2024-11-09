import { parseJsFile } from "../parse";
import { findCompleteFunctions } from "./complete-functions";

it("finds functions with zero calls", () => {
  expect(
    testCompleteFunctions(`
      let x = x => x
    `)
  ).toMatchInlineSnapshot(`"x@1"`);
  expect(
    testCompleteFunctions(`
      let x = function x() { }
    `)
  ).toMatchInlineSnapshot(`"x@2, x@1"`);
});

it("finds functions called once", () => {
  expect(
    testCompleteFunctions(`
      let x = x => x
      x()
    `)
  ).toMatchInlineSnapshot(`"x@1"`);
  expect(
    testCompleteFunctions(`
      let x = function x() { }
      x()
    `)
  ).toMatchInlineSnapshot(`"x@2, x@1"`);
});

it("ignores functions used in unexpected ways", () => {
  expect(
    testCompleteFunctions(`
      let x = x => x
      ;[x]
    `)
  ).toMatchInlineSnapshot(`[]`);
  expect(
    testCompleteFunctions(`
      function x() { }
      ;[x]
    `)
  ).toMatchInlineSnapshot(`[]`);
  expect(
    testCompleteFunctions(`
      let x = function x() { }
      ;[x]
    `)
  ).toMatchInlineSnapshot(`[]`);
});

function testCompleteFunctions(s: string) {
  const funcs = findCompleteFunctions(parseJsFile(s));

  if (funcs.size === 1) {
    return funcs.values().next().value?.join(", ");
  }
  return [...funcs.values()].map((aliases) => aliases.join(", "));
}

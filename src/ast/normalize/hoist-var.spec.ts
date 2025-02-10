import { parseJsFile, stringifyJsFile } from "../../parse";

it("hoists var decls", () => {
  expect(
    testHoist(`
      var x = 1;
      var x = 2;
    `)
  ).toMatchInlineSnapshot(`
    "let x = undefined;
    x = 1;
    x = 2;"
  `);

  expect(
    testHoist(`
      if (x) {
        var x = 5;
      }
    `)
  ).toMatchInlineSnapshot(`
    "let x = undefined;
    if (x) {
      x = 5;
    }"
  `);

  expect(
    testHoist(`
      var x = "declared twice";
      if (x) {
        var x = "declared twice";
      }
    `)
  ).toMatchInlineSnapshot(`
    "let x = undefined;
    x = "declared twice";
    if (x) {
      x = "declared twice";
    }"
  `);

  expect(
    testHoist(`
      foo: var variable = 'bar';
    `)
  ).toMatchInlineSnapshot(`
    "let variable = undefined;
    foo: {
      variable = 'bar';
    }"
  `);

  expect(
    testHoist(`
      for (var variable of []) {}
    `)
  ).toMatchInlineSnapshot(`
    "let variable = undefined;
    autoLabel_1: for (variable of []) {}"
  `);

  expect(
    testHoist(`
      for (var i = 0; i < [].length; i++) {}
    `)
  ).toMatchInlineSnapshot(`
    "let i = undefined;
    autoLabel_1: for (i = 0; i < [].length; i++) {}"
  `);
});

function testHoist(code: string) {
  const program = parseJsFile(code); // calls hoistVar internally
  return stringifyJsFile(program);
}

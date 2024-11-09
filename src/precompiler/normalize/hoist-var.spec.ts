import { parseJsFile, stringifyJsFile } from "../../parse";

it("hoists var decls", () => {
  expect(
    testHoist(`
      var x = 1

      var x = 2
    `)
  ).toMatchInlineSnapshot(`
    "let x = 1;
    x = 2;"
  `);

  expect(
    testHoist(`
      if (x) {
        var x = 5
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
      foo: var variable = 'bar'
    `)
  ).toMatchInlineSnapshot(`
    "let variable = undefined;
    foo: {
      variable = 'bar';
    }"
  `);
});

function testHoist(code: string) {
  const program = parseJsFile(code); // calls hoistVar internally
  return stringifyJsFile(program);
}

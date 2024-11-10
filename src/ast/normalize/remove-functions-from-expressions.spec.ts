import { parseJsFile, stringifyJsFile } from "../../parse";

it("removes functions from expressions", () => {
  const program = parseJsFile(`
    let unmoved = () => {};
    let moved = (function nameHint() {})();
  `);

  // calls removeFunctionsFromExpressions within

  expect(stringifyJsFile(program)).toMatchInlineSnapshot(`
    "let unmoved = () => {};
    const inlineFunc_1_nameHint = function nameHint() {};
    let moved = inlineFunc_1_nameHint();"
  `);
});

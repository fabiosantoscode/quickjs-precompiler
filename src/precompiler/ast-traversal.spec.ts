import { invariant } from "../utils";
import { parseJsFile } from "../parse";
import { astRawTraversal, goIntoAll, goThroughAll } from "./ast-traversal";
import { AnyNode2 } from "./augmented-ast";

const testTraversal: (...a: Parameters<typeof astRawTraversal>) => string = (
  ast: AnyNode2,
  goInto,
  goThrough
) => {
  const visit = new Set([ast]);
  let report = "";

  function* recurse(
    ast: AnyNode2,
    depth = 0
  ): Generator<AnyNode2, undefined, undefined> {
    yield ast;

    invariant(ast, ast + "");
    invariant(typeof ast.type === "string", ast.type);

    const children = astRawTraversal(ast, goInto, goThrough);

    for (const child of children) {
      invariant(!visit.has(child), child.type);

      visit.add(child);

      report += "- ".repeat(depth) + child.type + "\n";

      yield* recurse(child, depth + 1);
    }
  }

  for (const _ of recurse(ast)); //consume

  return report.trimEnd();
};

it("traverses all items in an AST", () => {
  const x = parseJsFile(`
    function x(foo) {
      x()
    }

    foo: {
      let variable = 'bar'
    }
  `);

  expect(testTraversal(x, goIntoAll, goThroughAll)).toMatchInlineSnapshot(`
    "VariableDeclaration
    - Identifier
    - FunctionExpression
    - - Identifier
    - - Identifier
    - - BlockStatement
    - - - ExpressionStatement
    - - - - CallExpression
    - - - - - Identifier
    LabeledStatement
    - BlockStatement
    - - VariableDeclaration
    - - - Identifier
    - - - Literal"
  `);
});

it("traverses all items except patterns", () => {
  const x = parseJsFile(`
    function x(foo) {
      x()
    }

    foo: {
      let variable = 'bar'
    }
  `);

  expect(testTraversal(x, { ...goIntoAll, patterns: false }, goThroughAll))
    .toMatchInlineSnapshot(`
    "VariableDeclaration
    - FunctionExpression
    - - BlockStatement
    - - - ExpressionStatement
    - - - - CallExpression
    - - - - - Identifier
    LabeledStatement
    - BlockStatement
    - - VariableDeclaration
    - - - Literal"
  `);
});

it("can avoid references", () => {
  const x = parseJsFile(`
    function x(foo) {
      x()
    }

    foo: {
      let variable = 'bar'
    }
  `);

  expect(testTraversal(x, { ...goIntoAll, expressions: false }, goThroughAll))
    .toMatchInlineSnapshot(`
    "VariableDeclaration
    - Identifier
    - Identifier
    - Identifier
    - BlockStatement
    - - ExpressionStatement
    LabeledStatement
    - BlockStatement
    - - VariableDeclaration
    - - - Identifier"
  `);
});

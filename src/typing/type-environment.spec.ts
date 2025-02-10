import { inspect } from "util";
import { parseJsFile } from "../parse";
import { TypeEnvironment } from "./type-environment";

it("can follow a certain binding", () => {
  expect(
    testTraceDownstream(
      typeEnv(`
        const NEEDLE = 'string'
        const y = NEEDLE
        const z = NEEDLE
      `),
      "NEEDLE@1"
    )
  ).toMatchInlineSnapshot(`
    "y@1 binding
    z@1 binding"
  `);

  expect(
    testTraceDownstream(
      typeEnv(`
        const NEEDLE = 'string'
        const y = NEEDLE
        const z = y
      `),
      "NEEDLE@1"
    )
  ).toMatchInlineSnapshot(`
    "y@1 binding
    z@1 binding"
  `);

  expect(
    testTraceDownstream(
      typeEnv(`
        const NEEDLE = 1
        const y = NEEDLE + 1
        const z = y
      `),
      "NEEDLE@1"
    )
  ).toMatchInlineSnapshot(`
    "BinaryExpression expression
    y@1 binding
    z@1 binding"
  `);
});

it("can follow a certain binding through function calls", () => {
  expect(
    testTraceDownstream(
      typeEnv(`
        const NEEDLE = 1
        function y() { return NEEDLE }
        const z = () => y()
      `),
      "NEEDLE@1"
    )
  ).toMatchInlineSnapshot(`
    "y@2() return value
    CallExpression expression
    <anonymous>() return value"
  `);

  expect(
    testTraceDownstream(
      typeEnv(`
        const NEEDLE = 1
        function y() { return NEEDLE }
        const z = y()
      `),
      "NEEDLE@1"
    )
  ).toMatchInlineSnapshot(`
    "FunctionExpression expression
    y@1 binding
    CallExpression expression
    z@1 binding"
  `);
});

it("can follow array items", () => {
  expect(
    testTraceDownstream(
      typeEnv(`
        const NEEDLE = new Array()
        NEEDLE[0] = 1
        const z = NEEDLE[0]
      `),
      "NEEDLE@1"
    )
  ).toMatchInlineSnapshot(`
    "MemberExpression expression
    MemberExpression expression
    z@1 binding"
  `);
});

const typeEnv = (source: string) => {
  const js = parseJsFile(source);
  return TypeEnvironment.forProgram(js, false);
};

function testTraceDownstream(t: TypeEnvironment, uniqueName: string) {
  return traceDownstream(t, uniqueName)
    .map((dep) => dep.comment ?? inspect(dep))
    .join("\n");
}

function traceDownstream(t: TypeEnvironment, uniqueName: string) {
  let root = t.getBindingTypeVar(uniqueName);

  const worklist = new Set([root]);

  for (const typeVar of worklist) {
    for (const dependent of t.getTypeDependents(typeVar)) {
      worklist.add(dependent.target);
    }
  }

  worklist.delete(root);
  return [...worklist];
}

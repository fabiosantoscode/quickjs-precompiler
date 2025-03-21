import { inspect } from "util";
import { parseJsFile } from "../parse";
import { TypeEnvironment } from "./type-environment";
import { TypeVariable } from "./type";
import { TypeDependency } from "./type-dependencies";

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
    "- NEEDLE@1 binding
      - copy initializer into vardecl y@1
        - y@1 binding
      - copy initializer into vardecl z@1
        - z@1 binding"
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
    "- NEEDLE@1 binding
      - copy initializer into vardecl y@1
        - y@1 binding
          - copy initializer into vardecl z@1
            - z@1 binding"
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
    "- NEEDLE@1 binding
      - "+" operator
        - BinaryExpression expression
          - copy initializer into vardecl y@1
            - y@1 binding
              - copy initializer into vardecl z@1
                - z@1 binding"
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
    "- NEEDLE@1 binding
      - the function's return value depends on the tVars of return statements
        - FunctionExpression expression
          - copy initializer into vardecl y@1
            - y@1 binding
              - copy returned value to the function
                - CallExpression expression
                  - the function's return value depends on the tVars of return statements
                    - ArrowFunctionExpression expression
                      - copy initializer into vardecl z@1
                        - z@1 binding
          - function's attached name depends on the function
            - y@2 binding"
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
    "- NEEDLE@1 binding
      - the function's return value depends on the tVars of return statements
        - FunctionExpression expression
          - copy initializer into vardecl y@1
            - y@1 binding
              - copy returned value to the function
                - CallExpression expression
                  - copy initializer into vardecl z@1
                    - z@1 binding
          - function's attached name depends on the function
            - y@2 binding"
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
    "- NEEDLE@1 binding
      - read (member expression)
        - MemberExpression expression
      - read (member expression)
        - MemberExpression expression
          - copy initializer into vardecl z@1
            - z@1 binding"
  `);

  expect(
    testTraceDownstream(
      typeEnv(`
        const arr = new Array()
        const NEEDLE = 1
        arr[0] = NEEDLE
        const z = arr[0]
      `),
      "NEEDLE@1"
    )
  ).toMatchInlineSnapshot(`
    "- NEEDLE@1 binding
      - write (member expression)
        - arr@1 binding
          - read (member expression)
            - MemberExpression expression
          - read (member expression)
            - MemberExpression expression
              - copy initializer into vardecl z@1
                - z@1 binding
      - assignment expr returns its assigned value
        - AssignmentExpression expression"
  `);
});

const typeEnv = (source: string) => {
  const js = parseJsFile(source);
  return TypeEnvironment.forProgram(js, false);
};

function testTraceDownstream(t: TypeEnvironment, uniqueName: string) {
  return (function recurse(
    trace = traceDownstream(t, uniqueName),
    prefix = "",
    isLast = true
  ) {
    if (trace.type === "circular") {
      return prefix + "<circular (" + trace.node.comment + ")>" + "\n";
    } else {
      let output = prefix + (isLast ? "- " : "- ") + trace.node.comment + "\n";

      const childPrefix = prefix + "  ";
      const grandChildPrefix = childPrefix + "  ";

      trace.dependencies.forEach((dep, i) => {
        const isChildLast = i === trace.dependencies.length - 1;
        output += `${childPrefix}- ${dep.node.comment}\n`;
        output += recurse(dep.target, grandChildPrefix, isChildLast);
      });

      return output;
    }
  })().trimEnd();
}

function traceDownstream(t: TypeEnvironment, uniqueName: string) {
  type Trace =
    | { type: "circular"; node: TypeVariable }
    | {
        type: "typevar";
        node: TypeVariable;
        dependencies: { type: "dep"; node: TypeDependency; target: Trace }[];
      };

  let root = t.getBindingTypeVar(uniqueName);

  const seen = new Set();

  return (function recurse(typeVar = root): Trace {
    if (seen.has(typeVar)) {
      return { type: "circular", node: typeVar };
    } else {
      seen.add(typeVar);

      return {
        type: "typevar",
        node: typeVar,
        dependencies: t.getTypeDependents(typeVar).map((dep) => ({
          type: "dep",
          node: dep,
          target: recurse(dep.target),
        })),
      };
    }
  })();
}

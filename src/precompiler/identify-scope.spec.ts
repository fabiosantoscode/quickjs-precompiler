import { parseJsFile, stringifyJsFile } from "../parse";
import { testRevealUniqueNames } from "./test-utils";

function testUniqueNames(inp: string) {
  const program = parseJsFile(inp); // calls uniqueifyNames() internally
  testRevealUniqueNames(program);
  return stringifyJsFile(program);
}

it("finds and replaces duplicate identifiers", () => {
  expect(testUniqueNames(`let x = 1`)).toMatchInlineSnapshot(`"let x@1 = 1;"`);

  expect(testUniqueNames(`let x = 1; { let x = 2 }`)).toMatchInlineSnapshot(`
        "let x@1 = 1;
        {
          let x@2 = 2;
        }"
        `);
});

it("unless they are in the same scope", () => {
  expect(testUniqueNames(`let x = 1, y = x + 1`)).toMatchInlineSnapshot(
    `"let x@1 = 1, y@1 = x@1 + 1;"`
  );
});

it("supports var scope", () => {
  expect(testUniqueNames(`var x = 1; var x = 2`)).toMatchInlineSnapshot(`
    "var x@1 = 1;
    var x@1 = 2;"
  `);
  expect(testUniqueNames(`var x = 1; {let x = 2}`)).toMatchInlineSnapshot(`
    "var x@1 = 1;
    {
      let x@2 = 2;
    }"
  `);
});

it("supports weird hoisted functions", () => {
  expect(testUniqueNames(`function x() { inLet; } let inLet;`))
    .toMatchInlineSnapshot(`
        "function x@1() {
          inLet@1;
        }
        let inLet@1;"
    `);
});

it("supports labels scope", () => {
  expect(
    testUniqueNames(`
        foo: "nothing";
        bar: {
            break bar;
        }
    `)
  ).toMatchInlineSnapshot(`
    "foo@1: "nothing";
    bar@1: {
      break bar@1;
    }"
  `);
});

it("breaks with unsupported weird cases", () => {
  expect(() =>
    testUniqueNames(
      `foo(); foo = () => {}; foo(); function foo() { return foo }`
    )
  ).toThrow(/reassign/i);
  expect(() =>
    testUniqueNames(`function x(foo = print) { var print = 3 }; var print = 4`)
  ).toThrow(/shadow/i);
  expect(() => testUniqueNames(`function foo() { foo = 2 }`)).toThrow(
    /reassign/i
  );
  // TODO when destructuring is supported expect(() => testUniqueNames(`const print = 1; function f(printFn = print) {}`)).toThrow(/reassign/i)
});

function testClosures(code: string) {
  const program = parseJsFile(code); // calls uniqueifyNames() internally
  const items: string[] = [];

  program.allClosures.forEach((node) => {
    let ancestry = "";
    let parent = node.parent;
    while (parent) {
      ancestry = `${parent.name || "?"}.${ancestry}`;
      parent = parent.parent;
    }
    items.push(
      `${ancestry}${node.name} (vars: ${[...node.variables.keys()].join(", ")})`
    );
  });

  return items;
}

it("takes note of all closures", () => {
  expect(
    testClosures(`
      function foo() { return foo }
      function bar() {
        function foo() { }
        return foo()
      }
    `)
  ).toMatchInlineSnapshot(`
    [
      "root (vars: foo@1, bar@1)",
      "root.foo (vars: )",
      "root.bar (vars: foo@2)",
      "root.bar.foo (vars: )",
    ]
  `);
});

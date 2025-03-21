import { parseJsFile, stringifyJsFile } from "../parse";
import { testRevealUniqueNames, testToString } from "../testutils";

import { _CExtractor } from "./extract-c";

it("extracts functions that could have been C", () => {
  expect(
    testFindCAble(`
      let x = 1
      let y = function y() {
        return 1
      }
    `)
  ).toMatchInlineSnapshot(`
    [
      "the whole program is C-able",
    ]
  `);
});

it("avoids nasty bits", () => {
  expect(
    testFindCAble(`
      throw 1
      let y = function y() {
        return 1
      }
      let partial = function partial() {
        throw 1
        let z = function z() {
          return 1
        }
        return 1
      }
    `)
  ).toMatchInlineSnapshot(`
    [
      "function z() {
      return 1;
    }",
      "function y() {
      return 1;
    }",
    ]
  `);
});

it("avoids weird types", () => {
  expect(
    testFindCAble(`
      let z = function z() {
        let x = 1
        x = 2
      }
      let z2 = function z2() {
        let x = 1
        x = '2'
      }
    `)
  ).toMatchInlineSnapshot(`
    [
      "function z() {
      let x = 1;
      x = 2;
    }",
    ]
  `);
});

it("can extract declarations", () => {
  expect(
    testExtractDeclarations(`
      let cFunc = function cFunc() {
        return 1
      }
      let notCFunc = function notCFunc() {
        throw 'not c'
        return cFunc()
      }
    `)
  ).toMatchInlineSnapshot(`
    "// C
    {
      type: 'VariableDeclaration',
      kind: 'var',
      _comment: 'intoCDeclarations',
      loc: SourceLocation {
        start: Position { line: 2, column: 18 },
        end: Position { line: 4, column: 7 },
        source: 'unknown'
      },
      declarations: [
        {
          type: 'VariableDeclarator',
          loc: [SourceLocation],
          id: [Object],
          init: [Object]
        }
      ]
    }
    // JS
    let cFunc@1 = function cFunc@2() {
      return c_binding_cFunc@1();
    };
    let notCFunc@1 = function notCFunc@2() {
      throw 'not c';
      return cFunc@1();
    };"
  `);
});

function testFindCAble(source: string) {
  const program = parseJsFile(source);

  const extracted = new _CExtractor(program)
    .findCeeAbleInProgram()
    .map((f) =>
      f.type === "Program" ? "the whole program is C-able" : stringifyJsFile(f)
    );

  return extracted;
}

function testExtractDeclarations(source: string) {
  const program = parseJsFile(source);

  const extracted = new _CExtractor(program).extractDeclarationsInProgram();

  return (
    "// C\n" +
    extracted.map(testToString).join("\n") +
    "\n// JS\n" +
    stringifyJsFile(testRevealUniqueNames(program))
  );
}

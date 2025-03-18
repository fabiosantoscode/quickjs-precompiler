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
      "the program",
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
      "z@2",
      "y@2",
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

function testFindCAble(source: string) {
  const program = parseJsFile(source);

  const extracted = new _CExtractor(program)
    .findCAbleInProgram()
    .map((f) => (f.type === "Program" ? "the program" : stringifyJsFile(f)));

  return extracted;
}

it("can extract declarations", () => {
  expect(
    testExtractDeclarations(`
      let cFunc = function cFunc() {
        return 1
      }
      let notCFunc = function notCFunc() {
        unknownGlobalRef()
        return cFunc()
      }
    `)
  ).toMatchInlineSnapshot(`
    "// C
    {
      type: 'CFunctionDeclaration',
      cBody: Node {
        type: 'BlockStatement',
        start: 36,
        end: 62,
        loc: SourceLocation {
          start: [Position],
          end: [Position],
          source: 'unknown'
        },
        body: [ [Node] ]
      },
      cName: 'c_binding_cFunc@1',
      params: {},
      retType: NumberType { specificValue: 1 }
    }
    // JS
    let cFunc@1 = function cFunc@2() {
      return c_binding_cFunc@1();
    };
    let notCFunc@1 = function notCFunc@2() {
      throw 1;
      return cFunc@1();
    };"
  `);
});

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

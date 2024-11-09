import { parseJsFile, stringifyJsFile } from "../parse";
import { astTraverseBodyHavers } from "../precompiler/ast-traversal";
import {
  CallExpression,
  Expression,
  Identifier,
  Program,
  Statement,
  VariableDeclaration,
} from "../precompiler/augmented-ast";

/*
 * First, we will associate type variables with our program.
 * Every node will have a TypeVariable, whose .type may change
 */
import { TypeEnvironment } from "./type-environment";

/* Then, we propagate types.
 * Documented more within propagateTypes()
 */
import { propagateTypes } from "./propagation";
import { defined } from "../utils";
import { FunctionType } from "./type";

it("propagates types to vars", () => {
  expect(
    testTypes(`
      let variable = 1
      let expression = 1 + 1
      let dependentVar = variable + 1
    `)
  ).toMatchInlineSnapshot(`
    "let variable = /* 1 */ (1);
    let expression = /* Number */ (1 + 1);
    let dependentVar = /* Number */ (variable + 1);"
  `);
});

it("allows variables to have multiple types (by ignoring those)", () => {
  expect(
    testTypes(`
      var number = 1
      number;
      number = ''
      number;
    `)
  ).toMatchInlineSnapshot(`
    "var number = /* 1 */ (1);
    /* undefined */ (number);
    /* undefined */ (number = '');
    /* undefined */ (number);"
  `);
});

it("marks functions as having a unique type", () => {
  expect(
    testTypes(`
      function func1(x) { return x }
      let func2 = x => x
      let func3 = function(x) { return x }
      func1;
    `)
  ).toMatchInlineSnapshot(`
    "const func1 = /* Function(func1@2) */ (function func1(x) {
      return x;
    });
    let func2 = /* Function(?) */ (x => {
      return x;
    });
    let func3 = /* Function(?) */ (function (x) {
      return x;
    });
    /* Function(func1@2) */ (func1);"
  `);
});

it.skip("understands function return types", () => {
  var [{ body }, env] = testTypesEnv(`
      let number = (x => x)(1)
  `);
  const callee = (
    (body[0] as VariableDeclaration).declarations[0].init as CallExpression
  ).callee;
  const tVar = defined(env.typeVars.get(callee)?.type) as FunctionType;
  const xArgTVar = defined(env.bindingVars.get("x@1"));

  expect(tVar.toString()).toMatchInlineSnapshot(`"Function(?)"`);
  expect(xArgTVar).toMatchInlineSnapshot(`
    TypeVariable {
      "type": undefined,
    }
  `);

  expect(false).toBe(true); // TODO take the stuff discovered in complete-functions.ts and start knowing the param types for all functions (most generic taken from all calls)
});

/*
it("can call function expressions", () => {
  expect(
    testTypes(`
      let number = (x => x)(1)
    `)
  ).toMatchInlineSnapshot(`
    "let number = * Number * ((x => {
      return x;
    })(1));"
  `);
});
*/

it("handles polymorphic function arg types (by ignoring them)", () => {
  expect(
    testTypes(`
      let id = x => x
      let number = id(1)
      let string = id('1')
    `)
  ).toMatchInlineSnapshot(`
    "let id = /* Function(?) */ (x => {
      return x;
    });
    let number = /* undefined */ (id(1));
    let string = /* undefined */ (id('1'));"
  `);
});

function testTypes(code: string) {
  const env = new TypeEnvironment();
  let basicProgram = parseJsFile(code);
  propagateTypes(env, basicProgram);
  testShowAllTypes(env, basicProgram);
  return stringifyJsFile(basicProgram);
}

function testTypesEnv(code: string): [Program, TypeEnvironment] {
  const env = new TypeEnvironment();
  let basicProgram = parseJsFile(code);
  propagateTypes(env, basicProgram);
  return [basicProgram, env];
}

function testShowAllTypes(env: TypeEnvironment, program: Program) {
  function mark(node: Statement) {
    const wrap = (wrapped: Expression) => {
      const type = env.typeVars.get(wrapped);
      return {
        type: "CallExpression",
        arguments: [wrapped],
        callee: {
          type: "Identifier",
          name: `/* ${type?.type?.specificValue ?? type?.type?.toString()} */ `,
        } as Identifier,
      } as CallExpression;
    };
    switch (node.type) {
      case "VariableDeclaration": {
        node.declarations[0].init = wrap(node.declarations[0].init);
        break;
      }
      case "ExpressionStatement": {
        node.expression = wrap(node.expression);
        break;
      }
    }
  }

  for (const item of program.body) {
    mark(item as Statement);
  }
  for (const { body } of astTraverseBodyHavers(program)) {
    for (const item of body) {
      mark(item as Statement);
    }
  }

  return stringifyJsFile(program);
}

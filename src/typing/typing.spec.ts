import { parseJsFile, stringifyJsFile } from "../parse";
import { astNaiveTraversal } from "../precompiler/ast-traversal";
import {
  AnyNode2,
  ArrowFunctionExpression,
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
import { defined, invariant } from "../utils";
import { FunctionType } from "./type";

it("propagates types to vars", () => {
  expect(
    testTypes(`
      let variable = 1
      let expression = 1 + 1
      let dependentVar = variable + 1
    `)
  ).toMatchInlineSnapshot(`
    "let variable = /* Number */ (1);
    let expression = /* Number */ (1 + 1);
    let dependentVar = /* Number */ (variable + 1);"
  `);
});

it("allows variables to have multiple types (by ignoring those)", () => {
  expect(
    testTypes(`
      let number = 1
      number;
      number = ''
      number;
    `)
  ).toMatchInlineSnapshot(`
    "let number = /* Number */ (1);
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
    `)
  ).toMatchInlineSnapshot(`
    "const func1 = /* Function(func1@2) */ (function func1(/* undefined */ (x)) {
      return /* undefined */ (x);
    });
    let func2 = /* Function(?) */ ((/* undefined */ (x)) => {
      return /* undefined */ (x);
    });
    let func3 = /* Function(?) */ (function (/* undefined */ (x)) {
      return /* undefined */ (x);
    });"
  `);
});

it("reference types will copy the original", () => {
  expect(
    testTypes(`
      function func1(x) { return x }
      func1;
    `)
  ).toMatchInlineSnapshot(`
    "const func1 = /* Function(func1@2) */ (function func1(/* undefined */ (x)) {
      return /* undefined */ (x);
    });
    /* Function(func1@2) */ (func1);"
  `);
});

it("marks the return type", () => {
  expect(
    testTypes(`
      function func1(x) { return x }
      func1(1)
    `)
  ).toMatchInlineSnapshot(`
    "const func1 = /* Function(func1@2): Number */ (function func1(/* Number */ (x)) {
      return /* Number */ (x);
    });
    /* Number */ (func1(1));"
  `);
});

it("understands function return types", () => {
  // TODO this lower-level test will look deeper
  var [{ body }, env] = testTypesEnv(`
      let number = (x => x)(1)
  `);
  const call = (body[0] as VariableDeclaration).declarations[0]
    .init as CallExpression;
  const callee = call.callee as ArrowFunctionExpression;

  const tVar = defined(env.typeVars.get(callee)?.type) as FunctionType;
  const xArgTVar = defined(env.bindingVars.get("x@1"));
  const xPassedArgTVar = defined(env.typeVars.get(call.arguments[0]));
  // const callTVar = defined(env.typeVars.get(call)?.type);

  expect(env.getTypeDependency(xArgTVar)).toMatchInlineSnapshot(`
    TypeDependencyBindingAssignments {
      "comment": "variable x@1 depends on 1 assignments",
      "possibilities": [
        TypeVariable {
          "comment": "Literal expression",
          "type": NumberType {
            "specificValue": 1,
          },
        },
      ],
      "target": TypeVariable {
        "comment": "x@1 binding",
        "type": NumberType {
          "specificValue": 1,
        },
      },
      "targetPossibilityCount": 1,
    }
  `);

  expect(tVar.toString()).toMatchInlineSnapshot(`"Function(?): Number"`);
  expect(tVar.returns.type).toMatchInlineSnapshot(`
    NumberType {
      "specificValue": 1,
    }
  `);
  expect(xPassedArgTVar.type).toMatchInlineSnapshot(`
    NumberType {
      "specificValue": 1,
    }
  `);
  expect(xArgTVar.type).toMatchInlineSnapshot(`
    NumberType {
      "specificValue": 1,
    }
  `);
  //expect(callTVar).toMatchInlineSnapshot();
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
    "let id = /* Function(?) */ ((/* undefined */ (x)) => {
      return /* undefined */ (x);
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
  function mark(node: AnyNode2) {
    const wrap = (wrapped: Expression, type = env.typeVars.get(wrapped)) => {
      return {
        type: "CallExpression",
        arguments: [wrapped],
        callee: {
          type: "Identifier",
          name: `/* ${type?.type?.toString()} */ `,
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
      case "ReturnStatement": {
        node.argument = wrap(defined(node.argument));
        break;
      }
      case "FunctionExpression":
      case "ArrowFunctionExpression": {
        for (const [p, param] of Object.entries(node.params)) {
          invariant(param.type === "Identifier");
          node.params[p as any] = wrap(
            param,
            env.bindingVars.get(param.uniqueName)
          ) as any;
        }
        break;
      }
    }
  }

  for (const item of astNaiveTraversal(program)) {
    mark(item as Statement);
  }

  return stringifyJsFile(program);
}

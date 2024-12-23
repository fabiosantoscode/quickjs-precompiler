import { parseJsFile, stringifyJsFile } from "../parse";
import { astNaiveTraversal } from "../ast/ast-traversal";
import {
  AnyNode2,
  ArrowFunctionExpression,
  CallExpression,
  Expression,
  Identifier,
  Program,
  Statement,
  VariableDeclaration,
} from "../ast/augmented-ast";

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
    "/* Number 1 */ let variable = /* Number 1 */ (1);
    /* Number */ let expression = /* Number */ (1 + 1);
    /* Number */ let dependentVar = /* Number */ (variable + 1);"
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
    "/* undefined */ let number = /* Number 1 */ (1);
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
    "/* Function(func1@2) */ const func1 = /* Function(func1@2) */ (function func1(/* undefined */ (x)) {
      return /* undefined */ (x);
    });
    /* Function(?) */ let func2 = /* Function(?) */ ((/* undefined */ (x)) => {
      return /* undefined */ (x);
    });
    /* Function(?) */ let func3 = /* Function(?) */ (function (/* undefined */ (x)) {
      return /* undefined */ (x);
    });"
  `);
});

it("understands reassignment", () => {
  expect(
    testTypes(`
      let func2 = x => x
      func2 = x => x
    `)
  ).toMatchInlineSnapshot(`
    "/* undefined */ let func2 = /* Function(?) */ ((/* undefined */ (x)) => {
      return /* undefined */ (x);
    });
    /* Function(?) */ const inlineFunc_1 = /* Function(?) */ ((/* undefined */ (x)) => {
      return /* undefined */ (x);
    });
    /* undefined */ (func2 = inlineFunc_1);"
  `);
});

it("reference types will copy the original", () => {
  expect(
    testTypes(`
      function func1(x) { return x }
      func1;
    `)
  ).toMatchInlineSnapshot(`
    "/* Function(func1@2) */ const func1 = /* Function(func1@2) */ (function func1(/* undefined */ (x)) {
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
    "/* Function(func1@2): Number 1 */ const func1 = /* Function(func1@2): Number 1 */ (function func1(/* Number 1 */ (x)) {
      return /* Number 1 */ (x);
    });
    /* Number 1 */ (func1(1));"
  `);
});

it("understands changing variables", () => {
  expect(
    testTypes(`
      let x = 1;
      x = 2;
      let y = x;
    `)
  ).toMatchInlineSnapshot(`
    "/* Number */ let x = /* Number 1 */ (1);
    /* Number */ (x = 2);
    /* Number */ let y = /* Number */ (x);"
  `);
});

it("understands nullable types", () => {
  expect(
    testTypes(`
      let x = null;
      x = 2;
      let y = x;
    `)
  ).toMatchInlineSnapshot(`
    "/* Nullable Number 2 */ let x = /* Null */ (null);
    /* Nullable Number 2 */ (x = 2);
    /* Nullable Number 2 */ let y = /* Nullable Number 2 */ (x);"
  `);
});

it("understands function return types", () => {
  // TODO this lower-level test will look deeper
  var [{ body }, env] = testTypesEnv(`
    let callee = x => x;
    let number = callee(1);
  `);
  const call = (body[1] as VariableDeclaration).declarations[0]
    .init as CallExpression;
  const callee = call.callee as ArrowFunctionExpression;

  const funcType = env.getNodeType(callee) as FunctionType;
  const xArgType = env.getBindingType("x@1");
  const xPassedArgType = env.getNodeType(call.arguments[0]);
  const callType = env.getNodeType(call);

  expect(env.getTypeDependency(xArgType)).toMatchInlineSnapshot(`
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

  expect(funcType.toString()).toMatchInlineSnapshot(`"Function(?): Number 1"`);
  expect(funcType.returns.type).toMatchInlineSnapshot(`
    NumberType {
      "specificValue": 1,
    }
  `);
  expect(xPassedArgType).toMatchInlineSnapshot(`
    NumberType {
      "specificValue": 1,
    }
  `);
  expect(xArgType.type).toMatchInlineSnapshot(`
    NumberType {
      "specificValue": 1,
    }
  `);
  expect(callType).toMatchInlineSnapshot(`
    NumberType {
      "specificValue": 1,
    }
  `);
});

it("can call function expressions", () => {
  expect(
    testTypes(`
      let number = (x => x)(1)
    `)
  ).toMatchInlineSnapshot(`
    "/* Function(?): Number 1 */ const inlineFunc_1 = /* Function(?): Number 1 */ ((/* Number 1 */ (x)) => {
      return /* Number 1 */ (x);
    });
    /* Number 1 */ let number = /* Number 1 */ (inlineFunc_1(1));"
  `);
});

it("handles polymorphic function arg types (by ignoring them)", () => {
  expect(
    testTypes(`
      let id = x => x
      let number = id(1)
      let string = id('1')
    `)
  ).toMatchInlineSnapshot(`
    "/* Function(?) */ let id = /* Function(?) */ ((/* undefined */ (x)) => {
      return /* undefined */ (x);
    });
    /* undefined */ let number = /* undefined */ (id(1));
    /* undefined */ let string = /* undefined */ (id('1'));"
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
    const wrap = (wrapped: Expression, type = env.getNodeType(wrapped)) => {
      return {
        type: "CallExpression",
        arguments: [wrapped],
        callee: {
          type: "Identifier",
          name: `/* ${type?.toString()} */ `,
        } as Identifier,
      } as CallExpression;
    };
    switch (node.type) {
      case "VariableDeclaration": {
        node.kind = (`/* ${env
          .getBindingType((node.declarations[0].id as any).uniqueName)
          .type?.toString()} */ ` + node.kind) as any;
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
            env.getBindingType(param.uniqueName).type
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

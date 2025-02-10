import { parseJsFile, stringifyJsFile } from "../parse";
import { astNaiveTraversal } from "../ast/ast-traversal";
import {
  AnyNode2,
  ArrowFunctionExpression,
  BlockStatement,
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
import { FunctionType, PtrType, TypeVariable } from "./type";

it("propagates types to vars", () => {
  expect(
    testTypes(`
      let variable = 1
      let expression = 1 + 1
      let dependentVar = variable + 1
    `)
  ).toMatchInlineSnapshot(`
    "/* Number */ let variable = /* Number */ (1);
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
    "/* undefined */ let number = /* Number */ (1);
    /* undefined */ (number);
    /* String */ (number = '');
    /* undefined */ (number);"
  `);
});

it("marks functions", () => {
  expect(
    testTypes(`
      function func1(x) { return x }
    `)
  ).toMatchInlineSnapshot(`
    "/* Function(func1@2) */ const func1 = /* Function(func1@2) */ (function func1(/* Unknown */ (x)) {
      return /* Unknown */ (x);
    });"
  `);
});

it("understands reassignment (to the wrong type)", () => {
  expect(
    testTypes(`
      let val = 1
      val = 'wrong'
      val
    `)
  ).toMatchInlineSnapshot(`
    "/* undefined */ let val = /* Number */ (1);
    /* String */ (val = 'wrong');
    /* undefined */ (val);"
  `);
});

it("understands reassignment of mutable vars is not to be followed", () => {
  // The binding below is not followed because it reassigns a mutable var
  expect(
    testTypes(`
      let func2 = x => x
      func2 = x => x
      func2
    `)
  ).toMatchInlineSnapshot(`
    "/* Ptr Invalid */ let func2 = /* Ptr Invalid */ ((/* Unknown */ (x)) => {
      return /* Unknown */ (x);
    });
    /* Ptr Invalid */ const inlineFunc_1 = /* Ptr Invalid */ ((/* Unknown */ (x)) => {
      return /* Unknown */ (x);
    });
    /* Ptr Invalid */ (func2 = inlineFunc_1);
    /* Ptr Invalid */ (func2);"
  `);
});

it("reference types will copy the original", () => {
  expect(
    testTypes(`
      function func1(x) { return x }
      func1;
    `)
  ).toMatchInlineSnapshot(`
    "/* Function(func1@2) */ const func1 = /* Function(func1@2) */ (function func1(/* Unknown */ (x)) {
      return /* Unknown */ (x);
    });
    /* Function(func1@2) */ (func1);"
  `);
});

it("marks the return type", () => {
  expect(
    testTypes(`
      function func1() { return 1 }
      func1()
    `)
  ).toMatchInlineSnapshot(`
    "/* Function(func1@2): Number */ const func1 = /* Function(func1@2): Number */ (function func1() {
      return /* Number */ (1);
    });
    /* Number */ (func1());"
  `);
});

it("marks the return type (identity function)", () => {
  expect(
    testTypes(`
      function func1(x) { return x }
      func1(1)
    `)
  ).toMatchInlineSnapshot(`
    "/* Function(func1@2): Number */ const func1 = /* Function(func1@2): Number */ (function func1(/* Number */ (x)) {
      return /* Number */ (x);
    });
    /* Number */ (func1(1));"
  `);
});

it("marks the return type even if the function wasn't called anywhere", () => {
  expect(
    testTypes(`
      function helloWorld() {
        return 1;
      }
    `)
  ).toMatchInlineSnapshot(`
    "/* Function(helloWorld@2): Number */ const helloWorld = /* Function(helloWorld@2): Number */ (function helloWorld() {
      return /* Number */ (1);
    });"
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
    "/* Number */ let x = /* Number */ (1);
    /* Number */ (x = 2);
    /* Number */ let y = /* Number */ (x);"
  `);
});

it("understands nullable types", () => {
  expect(
    testTypes(`
      let x = undefined;
      x = 2;
      let y = x;
    `)
  ).toMatchInlineSnapshot(`
    "/* Optional Number */ let x = /* Undefined */ (undefined);
    /* Number */ (x = 2);
    /* Optional Number */ let y = /* Optional Number */ (x);"
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

  const funcType = (env.getNodeType(callee) as PtrType).target as FunctionType;
  const xArgType = env.getBindingTypeVar("x@1");
  const xPassedArgType = env.getNodeType(call.arguments[0]);
  const callType = env.getNodeType(call);

  expect(env.getTypeDependencies(xArgType)).toMatchInlineSnapshot(`
    [
      TypeDependencyTypeBack {
        "comment": "function parameter #0",
        "dependencies": [
          TypeVariable {
            "comment": "ArrowFunctionExpression expression",
            "type": PtrType {
              "target": FunctionType {
                "displayName": "?",
                "params": ArrayType {
                  "arrayItem": NumberType {},
                },
                "returns": NumberType {},
              },
            },
          },
        ],
        "target": TypeVariable {
          "comment": "x@1 binding",
          "type": NumberType {},
        },
        "typeBack": [Function],
      },
    ]
  `);

  expect(funcType.toString()).toMatchInlineSnapshot(`"Function(?): Number"`);
  expect(funcType.returns).toMatchInlineSnapshot(`NumberType {}`);
  expect(xPassedArgType).toMatchInlineSnapshot(`NumberType {}`);
  expect(xArgType.type).toMatchInlineSnapshot(`NumberType {}`);
  expect(callType).toMatchInlineSnapshot(`NumberType {}`);
});

it("follows array item type", () => {
  expect(
    testTypes(`
      const x = new Array()
      x[1] = 2
      x[2]
    `)
  ).toMatchInlineSnapshot(`
    "/* Array Number */ const x = /* Array */ (new Array());
    /* Number */ (x[1] = 2);
    /* Optional Number */ (x[2]);"
  `);
});

it("follows simple assignments (new tech)", () => {
  expect(
    testTypes(`
      let x = 1;
      x++;
      x = 3;
    `)
  ).toMatchInlineSnapshot(`
    "/* Number */ let x = /* Number */ (1);
    /* Numeric */ (x++);
    /* Number */ (x = 3);"
  `);
});

it("follows simple function types (new tech)", () => {
  expect(
    testTypes(`
      const x = () => 1
      x()
    `)
  ).toMatchInlineSnapshot(`
    "/* Function(?): Number */ const x = /* Function(?): Number */ (() => {
      return /* Number */ (1);
    });
    /* Number */ (x());"
  `);
});

it("follows reassignments of function types (new tech)", () => {
  expect(
    testTypes(`
      const x = () => 1
      const y = x
      x()
      y()
    `)
  ).toMatchInlineSnapshot(`
    "/* Function(?): Number */ const x = /* Function(?): Number */ (() => {
      return /* Number */ (1);
    });
    /* Function(?): Number */ const y = /* Function(?): Number */ (x);
    /* Number */ (x());
    /* Number */ (y());"
  `);
});

it("finds invalid usages of functions after a reassignment (new tech)", () => {
  expect(
    testTypes(`
      const x = (y) => y + 1
      x(1)
      const y = x
      y('wrong type')
    `)
  ).toMatchInlineSnapshot(`
    "/* Ptr Invalid */ const x = /* Ptr Invalid */ ((/* Number */ (y)) => {
      return /* Number */ (y + 1);
    });
    /* Unknown */ (x(1));
    /* Ptr Invalid */ const y = /* Ptr Invalid */ (x);
    /* undefined */ (y('wrong type'));"
  `);
});

it("passes simple func args (new tech)", () => {
  expect(
    testTypes(`
      const func = (shouldBeString) => 1
      func('hi')
    `)
  ).toMatchInlineSnapshot(`
    "/* Function(?): Number */ const func = /* Function(?): Number */ ((/* String */ (shouldBeString)) => {
      return /* Number */ (1);
    });
    /* Number */ (func('hi'));"
  `);
});

it.todo("follows arguments passed to reassignments of funcs (new tech)");

it("handles polymorphic function arg types (by ignoring them)", () => {
  expect(
    testTypes(`
      let id = x => 1
      let number = id(1)
      let string = id('1')
    `)
  ).toMatchInlineSnapshot(`
    "/* Ptr Invalid */ let id = /* Ptr Invalid */ ((/* undefined */ (x)) => {
      return /* Number */ (1);
    });
    /* undefined */ let number = /* undefined */ (id(1));
    /* undefined */ let string = /* undefined */ (id('1'));"
  `);
});

it("finds usages of functions after being passed into an arg (new tech)", () => {
  expect(
    testTypes(`
      const callerWithNum = cb => cb(1)
      const callMeWithNum = num => num + 1
      callerWithNum(callMeWithNum)
    `)
  ).toMatchInlineSnapshot(`
    "/* Function(?): Number */ const callerWithNum = /* Function(?): Number */ ((/* Function(?): Number */ (cb)) => {
      return /* Number */ (cb(1));
    });
    /* Function(?): Number */ const callMeWithNum = /* Function(?): Number */ ((/* Number */ (num)) => {
      return /* Number */ (num + 1);
    });
    /* Number */ (callerWithNum(callMeWithNum));"
  `);
});

it("finds usages of functions after being passed into an arg (2)", () => {
  expect(
    testTypes(`
      const callerWithNum = cb => cb(1)
      const callMeWithNum = num => num
      callerWithNum(callMeWithNum)
    `)
  ).toMatchInlineSnapshot(`
    "/* Function(?): Number */ const callerWithNum = /* Function(?): Number */ ((/* Function(?): Number */ (cb)) => {
      return /* Number */ (cb(1));
    });
    /* Function(?): Number */ const callMeWithNum = /* Function(?): Number */ ((/* Number */ (num)) => {
      return /* Number */ (num);
    });
    /* Number */ (callerWithNum(callMeWithNum));"
  `);
});

it("finds usage invalid of functions after being passed into an arg (new tech)", () => {
  expect(
    testTypes(`
      const callerWithNum = cb => cb(1)
      const callMeWithStr = str => str
      callMeWithStr('correct type')
      callerWithNum(callMeWithStr)
    `)
  ).toMatchInlineSnapshot(`
    "/* Function(?) */ const callerWithNum = /* Function(?) */ ((/* Ptr Invalid */ (cb)) => {
      return /* undefined */ (cb(1));
    });
    /* Ptr Invalid */ const callMeWithStr = /* Ptr Invalid */ ((/* String */ (str)) => {
      return /* String */ (str);
    });
    /* Unknown */ (callMeWithStr('correct type'));
    /* Unknown */ (callerWithNum(callMeWithStr));"
  `);
});

it("array contents", () => {
  expect(
    testTypes(`
      const arrayNew = new Array()
      arrayNew[1] = 1
    `)
  ).toMatchInlineSnapshot(`
    "/* Array Number */ const arrayNew = /* Array */ (new Array());
    /* Number */ (arrayNew[1] = 1);"
  `);

  expect(
    testTypes(`
      const arrayNew = new Array()
      arrayNew[1] = 1
      const optionalNumber = arrayNew[0]
    `)
  ).toMatchInlineSnapshot(`
    "/* Array Number */ const arrayNew = /* Array */ (new Array());
    /* Number */ (arrayNew[1] = 1);
    /* Optional Number */ const optionalNumber = /* Optional Number */ (arrayNew[0]);"
  `);
});

it.todo("array contents (when the array is leaked)");

it("functional: Sheetjs crc32 code", () => {
  expect(
    testTypes(`
      // Sheetjs crc32 code (modified)
      // from: https://cdn.sheetjs.com/crc-32-latest/package/crc32.mjs

      function signed_crc_table()/*:CRC32TableType*/ {
        let c = 0, n = 0, table/*:Array<number>*/ = new Array(256);

        for(n = 0; n != 256; ++n){
          c = n;
          c = ((c&1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1));
          c = ((c&1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1));
          c = ((c&1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1));
          c = ((c&1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1));
          c = ((c&1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1));
          c = ((c&1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1));
          c = ((c&1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1));
          c = ((c&1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1));
          table[n] = c;
        }

        return table;
      }
    `)
  ).toMatchInlineSnapshot(`
    "/* Function(signed_crc_table@2): Array Number */ const signed_crc_table = /* Function(signed_crc_table@2): Array Number */ (function signed_crc_table() {
      /* Number */ let c = /* Number */ (0);
      /* Number */ let n = /* Number */ (0);
      /* Array Number */ let table = /* Array */ (new Array(256));
      autoLabel_1: for (n = 0; n != 256; ++n) {
        /* Number */ (c = n);
        /* Number */ (c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1);
        /* Number */ (c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1);
        /* Number */ (c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1);
        /* Number */ (c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1);
        /* Number */ (c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1);
        /* Number */ (c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1);
        /* Number */ (c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1);
        /* Number */ (c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1);
        /* Number */ (table[n] = c);
      }
      return /* Array Number */ (table);
    });"
  `);
});

function testTypes(code: string) {
  const env = new TypeEnvironment();
  let basicProgram = parseJsFile(code);
  propagateTypes(env, basicProgram);
  return testShowAllTypes(env, basicProgram);
}

function testTypesEnv(code: string): [Program, TypeEnvironment] {
  const env = new TypeEnvironment();
  let basicProgram = parseJsFile(code);
  propagateTypes(env, basicProgram);
  return [basicProgram, env];
}

export function testShowAllTypes(env: TypeEnvironment, program: Program) {
  const wrapAll = (node: AnyNode2): AnyNode2 => {
    const wrap = (wrapped: Expression, type = env.getNodeType(wrapped)) => {
      return {
        type: "CallExpression",
        arguments: [wrapAll(wrapped)],
        callee: {
          type: "Identifier",
          name: `/* ${type?.toString()} */ `,
        },
      } as CallExpression;
    };

    if (!node || typeof node !== "object") return node;

    switch (node.type) {
      case "VariableDeclaration": {
        return {
          ...node,
          kind: (`/* ${env
            .getBindingTypeVar((node.declarations[0].id as any).uniqueName)
            .type?.toString()} */ ` + node.kind) as any,
          declarations: [
            {
              ...node.declarations[0],
              init: wrap(node.declarations[0].init),
            },
          ],
        };
      }
      case "ExpressionStatement": {
        return { ...node, expression: wrap(node.expression) };
      }
      case "ReturnStatement": {
        return { ...node, argument: wrap(defined(node.argument)) };
      }
      case "FunctionExpression":
      case "ArrowFunctionExpression": {
        return {
          ...node,
          params: node.params.map((param) => {
            invariant(param.type === "Identifier");
            return wrap(
              param,
              env.getBindingTypeVar(param.uniqueName).type
            ) as any;
          }),
          body: wrapAll(node.body) as BlockStatement,
        };
      }
      default: {
        return Object.fromEntries(
          Object.entries(node).map(([key, value]) => {
            if (Array.isArray(value)) {
              return [key, value.map(wrapAll)];
            } else if (
              value &&
              typeof value === "object" &&
              typeof value.type === "string"
            ) {
              return [key, wrapAll(value as AnyNode2)];
            } else {
              return [key, value];
            }
          })
        ) as AnyNode2;
      }
    }
  };

  return stringifyJsFile(wrapAll(program) as Program);
}

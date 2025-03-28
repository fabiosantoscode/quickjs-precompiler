import { astNaiveTraversal, isFunction } from "../ast/ast-traversal";
import {
  BreakStatement,
  ContinueStatement,
  DoWhileStatement,
  ExpressionOrStatement,
  ForInStatement,
  ForOfStatement,
  ForStatement,
  LabeledStatement,
  Program,
  WhileStatement,
} from "../ast/augmented-ast";
import { parseJsFile, stringifyJsFile } from "../parse";
import {
  ArrayType,
  FunctionType,
  NullType,
  NumberType,
  NumericType,
  OptionalType,
  PtrType,
  StringType,
  TupleType,
  Type,
  UndefinedType,
} from "../typing/type";
import { TypeEnvironment } from "../typing/type-environment";
import {
  asInstance,
  defined,
  invariant,
  ofType,
  todo,
  unreachable,
} from "../utils";
import {
  NASTExpression,
  NASTProgram,
  NASTType,
  SourceLocation,
} from "./native-ast";
import { nastToLisp } from "./native-ast-to-lisp";

let typeEnv: TypeEnvironment = null as any;
let program: Program = null as any;

export function toNAST(program_: Program): NASTProgram {
  const prevProgram = program;
  program = program_;
  const prevTypeEnv = typeEnv;
  typeEnv = TypeEnvironment.forProgram(program, true);

  try {
    return {
      type: "NASTProgram",
      toplevel: bodyToNAST(program.body),
    };
  } finally {
    program = prevProgram;
    typeEnv = prevTypeEnv;
  }
}

function bodyToNAST(nodes: ExpressionOrStatement[]): NASTExpression {
  if (nodes.length === 1) {
    return statToNAST(nodes[0]);
  } else {
    return {
      type: "NASTDo",
      loc: nodes[0]?.loc,
      body: nodes.map((node) => statToNAST(node)),
    };
  }
}

function xs(loc: SourceLocation, items: NASTExpression[]): NASTExpression {
  items = flattenNAST(items);
  if (items.length === 1) {
    return items[0];
  } else {
    return {
      type: "NASTDo",
      body: items,
      loc,
    };
  }
}

function flattenNAST(nodes: NASTExpression[]): NASTExpression[] {
  if (nodes.length === 0) return [];
  const [first, ...rest] = nodes;
  if (first.type === "NASTDo")
    return [...flattenNAST(first.body), ...flattenNAST(rest)];
  return [first, ...flattenNAST(rest)];
}

function statToNAST(node: ExpressionOrStatement): NASTExpression {
  const loc = null as any; // TODO retain loc information

  function bork(node: ExpressionOrStatement) {
    console.log(stringifyJsFile(node as any));
    todo("not implemented: " + node.type, bork);
  }

  switch (node.type) {
    case "Identifier": {
      return {
        type: "NASTIdentifier",
        uniqueName: node.uniqueName,
        loc,
      };
    }
    case "Literal": {
      if (
        Number.isFinite(node.value) ||
        typeof node.value === "string" ||
        typeof node.value === "boolean"
      ) {
        return {
          type: "NASTLiteral",
          value: node.value as number | string | boolean,
          loc,
        };
      }
      todo("not implemented: exprToNast() of " + node.type);
    }
    case "ReturnStatement": {
      return {
        type: "NASTReturn",
        value: statToNAST(node.argument),
        loc,
      };
    }
    case "ThrowStatement": {
      return {
        type: "NASTThrow",
        value: statToNAST(node.argument),
        loc,
      };
    }
    case "VariableDeclaration": {
      const { id, init } = node.declarations[0];

      invariant(id.type === "Identifier");

      if (isFunction(init)) {
        invariant(id.type === "Identifier");
        let t = defined(
          asInstance(defined(typeEnv.getNodeType(id)), PtrType).asFunction()
        );
        let params =
          init.params.length === 0
            ? []
            : t.params instanceof TupleType
            ? t.params.items.map((value, i) => [
                ofType(init.params[i], "Identifier").uniqueName,
                defined(typeToNAST(value)),
              ])
            : unreachable(
                "function argument type must be known, but was " +
                  t.params.toString()
              );
        return {
          type: "NASTFunction",
          body: bodyToNAST(init.body.body),
          uniqueName: id.uniqueName,
          returnType: typeToNAST(t.returns),
          parameters: Object.fromEntries(params),
          loc,
        };
      }

      return {
        type: "NASTVariableDeclaration",
        declaration: {
          type: "NASTDeclaration",
          declarationType: typeToNAST(typeEnv.getBindingType(id.uniqueName)),
          uniqueName: id.uniqueName,
          loc,
        },
        initialValue: statToNAST(init),
        loc,
      };
    }
    case "BinaryExpression": {
      switch (node.operator) {
        case "==":
          todo("not implemented: operator " + node.operator);
        case "!=":
          todo("not implemented: operator " + node.operator);
        case "===":
          todo("not implemented: operator " + node.operator);
        case "!==":
          todo("not implemented: operator " + node.operator);

        // Float comparison
        case "<":
        case "<=":
        case ">":
        case ">=":
          invariant(typeEnv.getNodeType(node.left) instanceof NumberType);
          invariant(typeEnv.getNodeType(node.right) instanceof NumberType);
          return {
            type: "NASTComparison",
            operator: node.operator,
            left: statToNAST(node.left as any),
            right: statToNAST(node.right as any),
            loc,
          };
        case "<<":
          todo("not implemented: operator " + node.operator);
        case ">>":
          todo("not implemented: operator " + node.operator);
        case ">>>":
          todo("not implemented: operator " + node.operator);

        // basic float ops
        case "+":
        case "-":
        case "*":
        case "/": {
          return {
            type: "NASTBinary",
            operator: node.operator,
            left: statToNAST(node.left as any),
            right: statToNAST(node.right),
            loc,
          };
        }

        case "%":
          todo("not implemented: operator " + node.operator);
        case "|":
          todo("not implemented: operator " + node.operator);
        case "^":
          todo("not implemented: operator " + node.operator);
        case "&":
          todo("not implemented: operator " + node.operator);
        case "in":
          todo("not implemented: operator " + node.operator);
        case "instanceof":
          todo("not implemented: operator " + node.operator);
        case "**":
          todo("not implemented: operator " + node.operator);
      }
    }

    case "VariableDeclaration": {
      throw bork(node);
    }
    case "ImportDeclaration": {
      throw bork(node);
    }
    case "ExportNamedDeclaration": {
      throw bork(node);
    }
    case "ExportDefaultDeclaration": {
      throw bork(node);
    }
    case "ExportAllDeclaration": {
      throw bork(node);
    }
    case "ThisExpression": {
      throw bork(node);
    }
    case "ArrayExpression": {
      throw bork(node);
    }
    case "ObjectExpression": {
      throw bork(node);
    }
    case "FunctionExpression": {
      throw bork(node);
    }
    case "UnaryExpression": {
      // throw bork(node);
      switch (node.operator) {
        case "-":
        case "+":
        case "!":
        case "~": {
          invariant(typeEnv.getNodeType(node) instanceof NumberType, () => `node should be NumberType, was ${typeEnv.getNodeType(node)}`)
          return {
            type: 'NASTUnary',
            operator: node.operator,
            operand: statToNAST(node.argument),
            loc
          }
        }
        case "typeof":
          throw bork(node)
        case "void":
          throw bork(node)
        case "delete":
          throw bork(node)
      }
    }
    case "UpdateExpression": {
      throw bork(node);
    }
    case "AssignmentExpression": {
      invariant(node.left.type === "Identifier");
      return {
        type: "NASTAssignment",
        target: {
          type: "NASTIdentifier",
          uniqueName: node.left.uniqueName,
          loc,
        },
        value: statToNAST(node.right),
        loc,
      };
    }
    case "LogicalExpression": {
      throw bork(node);
    }
    case "MemberExpression": {
      throw bork(node);
    }
    case "ConditionalExpression": {
      throw bork(node);
    }
    case "CallExpression": {
      return {
        type: "NASTCall",
        arguments: node.arguments.map((arg) =>
          arg.type === "SpreadElement" ? unreachable() : statToNAST(arg)
        ),
        callee: ofType(statToNAST(node.callee), "NASTIdentifier"),
        loc,
      };
      console.log(node);
      throw bork(node);
    }
    case "NewExpression": {
      throw bork(node);
    }
    case "SequenceExpression": {
      throw bork(node);
    }
    case "ArrowFunctionExpression": {
      throw bork(node);
    }
    case "YieldExpression": {
      throw bork(node);
    }
    case "TemplateLiteral": {
      throw bork(node);
    }
    case "TaggedTemplateExpression": {
      throw bork(node);
    }
    case "ClassExpression": {
      throw bork(node);
    }
    case "MetaProperty": {
      throw bork(node);
    }
    case "AwaitExpression": {
      throw bork(node);
    }
    case "ChainExpression": {
      throw bork(node);
    }
    case "ImportExpression": {
      throw bork(node);
    }
    case "ExpressionStatement": {
      return statToNAST(node.expression);
    }
    case "BlockStatement": {
      return {
        type: "NASTDo",
        body: node.body.map((node) => statToNAST(node)),
        loc,
      };
    }
    case "DebuggerStatement": {
      throw bork(node);
    }
    case "LabeledStatement": {
      const continues: ContinueStatement[] = [];
      const breaks: BreakStatement[] = [];

      const sameLabel = (n: ContinueStatement | BreakStatement) =>
        n.label.uniqueName === node.label.uniqueName;

      for (const n of astNaiveTraversal(node.body)) {
        if (n.type === "ContinueStatement" && sameLabel(n)) continues.push(n);
        if (n.type === "BreakStatement" && sameLabel(n)) breaks.push(n);
      }

      if (
        node.body.type === "ForStatement" ||
        node.body.type === "ForInStatement" ||
        node.body.type === "ForOfStatement" ||
        node.body.type === "WhileStatement" ||
        node.body.type === "DoWhileStatement"
      ) {
        return loopToNAST(node as any);
      } else if (!continues.length && !breaks.length) {
        return xs(
          node.loc,
          node.body.body.map((node) => statToNAST(node))
        );
      } else {
        throw bork(node);
      }
    }
    case "BreakStatement": {
      throw bork(node);
    }
    case "ContinueStatement": {
      throw bork(node);
    }
    case "IfStatement": {
      return {
        type: "NASTIf",
        condition: statToNAST(node.test),
        trueBranch: statToNAST(node.consequent),
        falseBranch: node.alternate
          ? statToNAST(node.alternate)
          : xs(node.loc, []),
        loc,
      };
    }
    case "SwitchStatement": {
      throw bork(node);
    }
    case "TryStatement": {
      throw bork(node);
    }
    case "WhileStatement":
    case "DoWhileStatement":
    case "ForStatement":
    case "ForInStatement":
    case "ForOfStatement":
      unreachable("loops are handled in loopToNAST");
  }
}

function loopToNAST(
  loop:
    | WhileStatement
    | DoWhileStatement
    | ForStatement
    | ForInStatement
    | ForOfStatement,
  labelParent?: LabeledStatement
): NASTExpression {
  const beforeBody: NASTExpression[] = [];
  const body: NASTExpression[] = [];

  // Sometimes we have a parent
  let reParent = (x: NASTExpression) => x;
  let uniqueLabel;

  if (labelParent) {
    uniqueLabel = labelParent.label.uniqueName;
  } else {
    uniqueLabel = hy;
  }

  switch (loop.type) {
    case "WhileStatement":
      invariant(false);
    case "DoWhileStatement":
      invariant(false);
    case "ForStatement": {
      if (loop.init) {
        beforeBody.push(statToNAST(loop.init));
      }
      if (loop.test) {
        body.push({
          type: "NASTIf",
          condition: statToNAST(loop.test),
          trueBranch: {
            type: "NASTJump",
            jumpDirection: "break",
            uniqueLabel: labelParent.label.uniqueName,
            loc: loop.test.loc,
          },
          loc: loop.test.loc,
        });
      }
      body.push(statToNAST(loop.body));
      if (loop.update) {
        body.push({
          type: "NASTIf",
          condition: statToNAST(loop.update),
          trueBranch: {
            type: "NASTJump",
            jumpDirection: "continue",
            uniqueLabel: labelParent.label.uniqueName,
            loc: loop.update.loc,
          },
          falseBranch: {
            type: "NASTJump",
            jumpDirection: "break",
            uniqueLabel: labelParent.label.uniqueName,
            loc: loop.update.loc,
          },
          loc: loop.update.loc,
        });
      }
      break;
    }
    case "ForInStatement":
      invariant(false);
    case "ForOfStatement":
      invariant(false);
    default:
      invariant(false);
  }

  return xs(labelParent.loc, [
    ...beforeBody,
    {
      type: "NASTLoop",
      loc: labelParent.loc,
      uniqueLabel: labelParent.label.uniqueName,
      body: xs(labelParent.loc, body),
    },
  ]);
}

function typeToNAST(type: Type | undefined): NASTType {
  invariant(type, "type must exist");

  if (type instanceof NullType) return { type: "null" };
  if (type instanceof StringType) return { type: "string" };
  if (type instanceof NumberType) return { type: "number" };
  if (type instanceof NumericType) return { type: "numeric" };
  if (type instanceof OptionalType)
    return { type: "optional", contents: typeToNAST(type.innerType) };
  if (type instanceof UndefinedType) return { type: "undefined" };
  if (type instanceof FunctionType) {
    return {
      type: "function",
      params: type.params.map((t) => typeToNAST(t.type)),
      returns: typeToNAST(type.returns.type),
    };
  }
  if (type instanceof ArrayType && (type as ArrayType).arrayItem) {
    return {
      type: "array",
      contents: typeToNAST((type as ArrayType).arrayItem.type),
    };
  }

  todo();
}

// TEST FILE

function testToNAST(source: string) {
  const js = parseJsFile(source);
  const t = TypeEnvironment.forProgram(js, false);

  const nast = toNAST(js);

  return nastToLisp(nast);
}

it("bindings", () => {
  expect(
    testToNAST(`
      let x = 1
      x = 2
    `)
  ).toMatchInlineSnapshot(`
    "(declare number x@1 1)
    (assign x@1 2)"
  `);
});

it("math operations", () => {
  expect(
    testToNAST(`
      function helloWorld() {
        return 2 * 3;
      }
    `)
  ).toMatchInlineSnapshot(`
    "(function numeric helloWorld@1 ()
      (return (* 2 3)))"
  `);

  expect(
    testToNAST(`
      function mul(a, b) {
        return a * b;
      }
      mul(1, 2)
    `)
  ).toMatchInlineSnapshot(`
    "(function numeric mul@1 (number a@1 number b@1)
      (return (* a@1 b@1)))
    (call mul@1 1 2)"
  `);

  expect(
    testToNAST(`
      function add(a, b) {
        return a + b;
      }
      add(1, 1)
    `)
  ).toMatchInlineSnapshot(`
    "(function number add@1 (number a@1 number b@1)
      (return (+ a@1 b@1)))
    (call add@1 1 1)"
  `);

  expect(
    testToNAST(`
      function complexMath(a, b, c) {
        return (a + b) * c;
      }
      complexMath(1, 2, 3)
    `)
  ).toMatchInlineSnapshot(`
    "(function numeric complexMath@1 (number a@1 number b@1 number c@1)
      (return (* (+ a@1 b@1) c@1)))
    (call complexMath@1 1 2 3)"
  `);
});

it.only("conditionals", () => {
  expect(
    testToNAST(`
      function max(a, b) {
        if (a > b) {
          return a;
        } else {
          return b;
        }
      }
      max(1, 2)
    `)
  ).toMatchInlineSnapshot(`
    "(function number max@1 (number a@1 number b@1)
      (if (> a@1 b@1)
      (do
      (return a@1))
      (else
        (do
      (return b@1)))))
    (call max@1 1 2)"
  `);

  expect(
    testToNAST(`
      function abs(x) {
        if (x < 0) {
          return -x;
        }
        return x;
      }
      abs(1)
    `)
  ).toMatchInlineSnapshot(`
    (function number abs (number x)
      (if (< x 0)
        (return (- x)))
      (return x))
  `);
});

it("variable declarations", () => {
  expect(
    testToNAST(`
      function sum(a, b) {
        const result = a + b;
        return result;
      }
    `)
  ).toMatchInlineSnapshot(`
    (function number sum (number a number b)
      (declare number result (+ a b))
      (return result))
  `);

  expect(
    testToNAST(`
      function factorial(n) {
        let result = 1;
        for (let i = 1; i <= n; i++) {
          result = result * i;
        }
        return result;
      }
    `)
  ).toMatchInlineSnapshot(`
    (function number factorial (number n)
      (declare number result 1)
      (for (declare number i 1) (<= i n) (assign i (+ i 1))
        (assign result (* result i)))
      (return result))
  `);
});

it("function calls", () => {
  expect(
    testToNAST(`
      function greet(name) {
        return "Hello, " + name;
      }
      function main() {
        return greet("world");
      }
    `)
  ).toMatchInlineSnapshot(`
    (function string greet (string name)
      (return (+ "Hello, " name)))
    (function string main ()
      (return (call greet "world")))
  `);

  expect(
    testToNAST(`
      function add(a, b) {
        return a + b;
      }
      function main() {
        return add(2, 3);
      }
    `)
  ).toMatchInlineSnapshot(`
    (function number add (number a number b)
      (return (+ a b)))
    (function number main ()
      (return (call add 2 3)))
  `);
});

it("nested expressions", () => {
  expect(
    testToNAST(`
      function complexExpression(a, b, c) {
        return (a + b) * (c - a);
      }
    `)
  ).toMatchInlineSnapshot(`
    (function number complexExpression (number a number b number c)
      (return (* (+ a b) (- c a))))
  `);

  expect(
    testToNAST(`
      function nestedCalls(a, b) {
        return Math.max(a, b) + Math.min(a, b);
      }
    `)
  ).toMatchInlineSnapshot(`
    (function number nestedCalls (number a number b)
      (return (+ (call Math.max a b) (call Math.min a b))))
  `);
});

it("global variables", () => {
  expect(
    testToNAST(`
      const PI = 3.14;
      function area(radius) {
        return PI * radius * radius;
      }
    `)
  ).toMatchInlineSnapshot(`
    (global number PI 3.14)
    (function number area (number radius)
      (return (* (* PI radius) radius)))
  `);
});

it("functional (crc32)", () => {
  expect(
    testToNAST(`
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
    (global number PI 3.14)
    (function number area (number radius)
      (return (* (* PI radius) radius)))
  `);
});

it("functional (crc32) (2)", () => {
  expect(
    testToNAST(`
      // Sheetjs crc32 code (modified)
      // from: https://cdn.sheetjs.com/crc-32-latest/package/crc32.mjs

      /*! crc32.js (C) 2014-present SheetJS -- http://sheetjs.com */
      /* vim: set ts=2: */
      /*::
      type CRC32Type = number;
      type ABuf = Array<number> | Buffer | Uint8Array;
      type CRC32TableType = Array<number> | Int32Array;
      */
      /*global Int32Array */
      function signed_crc_table()/*:CRC32TableType*/ {
          var c = 0, table/*:Array<number>*/ = new Array(256);

          for(var n =0; n != 256; ++n){
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

      var T0 = signed_crc_table();
      function slice_by_16_tables(T) {
          var c = 0, v = 0, n = 0, table/*:Array<number>*/ = new Array(4096) ;

          for(n = 0; n != 256; ++n) table[n] = T[n];
          for(n = 0; n != 256; ++n) {
              v = T[n];
              for(c = 256 + n; c < 4096; c += 256) v = table[c] = (v >>> 8) ^ T[v & 0xFF];
          }
          var out = [];
          for(n = 1; n != 16; ++n) out[n - 1] = table.slice(n * 256, n * 256 + 256);
          return out;
      }
      var TT = slice_by_16_tables(T0);
      var T1 = TT[0],  T2 = TT[1],  T3 = TT[2],  T4 = TT[3],  T5 = TT[4];
      var T6 = TT[5],  T7 = TT[6],  T8 = TT[7],  T9 = TT[8],  Ta = TT[9];
      var Tb = TT[10], Tc = TT[11], Td = TT[12], Te = TT[13], Tf = TT[14];
      function crc32_bstr(bstr/*:string*/, seed/*:?CRC32Type*/)/*:CRC32Type*/ {
          var C = seed/*:: ? 0 : 0 */ ^ -1;
          for(var i = 0, L = bstr.length; i < L;) C = (C>>>8) ^ T0[(C^bstr.charCodeAt(i++))&0xFF];
          return ~C;
      }

      function crc32_buf(B/*:ABuf*/, seed/*:?CRC32Type*/)/*:CRC32Type*/ {
          var C = seed/*:: ? 0 : 0 */ ^ -1, L = B.length - 15, i = 0;
          for(; i < L;) C =
              Tf[B[i++] ^ (C & 255)] ^
              Te[B[i++] ^ ((C >> 8) & 255)] ^
              Td[B[i++] ^ ((C >> 16) & 255)] ^
              Tc[B[i++] ^ (C >>> 24)] ^
              Tb[B[i++]] ^ Ta[B[i++]] ^ T9[B[i++]] ^ T8[B[i++]] ^
              T7[B[i++]] ^ T6[B[i++]] ^ T5[B[i++]] ^ T4[B[i++]] ^
              T3[B[i++]] ^ T2[B[i++]] ^ T1[B[i++]] ^ T0[B[i++]];
          L += 15;
          while(i < L) C = (C>>>8) ^ T0[(C^B[i++])&0xFF];
          return ~C;
      }

      function crc32_str(str/*:string*/, seed/*:?CRC32Type*/)/*:CRC32Type*/ {
          var C = seed/*:: ? 0 : 0 */ ^ -1;
          for(var i = 0, L = str.length, c = 0, d = 0; i < L;) {
              c = str.charCodeAt(i++);
              if(c < 0x80) {
                  C = (C>>>8) ^ T0[(C^c)&0xFF];
              } else if(c < 0x800) {
                  C = (C>>>8) ^ T0[(C ^ (192|((c>>6)&31)))&0xFF];
                  C = (C>>>8) ^ T0[(C ^ (128|(c&63)))&0xFF];
              } else if(c >= 0xD800 && c < 0xE000) {
                  c = (c&1023)+64; d = str.charCodeAt(i++)&1023;
                  C = (C>>>8) ^ T0[(C ^ (240|((c>>8)&7)))&0xFF];
                  C = (C>>>8) ^ T0[(C ^ (128|((c>>2)&63)))&0xFF];
                  C = (C>>>8) ^ T0[(C ^ (128|((d>>6)&15)|((c&3)<<4)))&0xFF];
                  C = (C>>>8) ^ T0[(C ^ (128|(d&63)))&0xFF];
              } else {
                  C = (C>>>8) ^ T0[(C ^ (224|((c>>12)&15)))&0xFF];
                  C = (C>>>8) ^ T0[(C ^ (128|((c>>6)&63)))&0xFF];
                  C = (C>>>8) ^ T0[(C ^ (128|(c&63)))&0xFF];
              }
          }
          return ~C;
      }
      const table = T0;
      const bstr = crc32_bstr;
      const buf = crc32_buf;
      const str = crc32_str;
    `)
  ).toMatchInlineSnapshot(`
    (global number PI 3.14)
    (function number area (number radius)
      (return (* (* PI radius) radius)))
  `);
});

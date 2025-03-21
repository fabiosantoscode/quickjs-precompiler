import { astNaiveTraversal, isFunction } from "../ast/ast-traversal";
import {
  assignmentOperatorToBinaryOperator,
  BinaryOperator,
  BreakStatement,
  ContinueStatement,
  DoWhileStatement,
  Expression,
  ExpressionOrStatement,
  ForInStatement,
  ForOfStatement,
  ForStatement,
  isNumericBinaryOperator,
  LabeledStatement,
  Pattern,
  Program,
  VariableDeclaration,
  WhileStatement,
} from "../ast/augmented-ast";
import { parseJsFile, stringifyJsFile } from "../parse";
import {
  ArrayType,
  BooleanType,
  FunctionType,
  isValidType,
  NullType,
  NumberType,
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
  NASTDo,
  NASTExpression,
  NASTIdentifier,
  NASTNode,
  NASTProgram,
  NASTType,
  SourceLocation,
} from "./native-ast";
import { nastToLisp } from "./native-ast-to-lisp";

let typeEnv: TypeEnvironment = null as any;
let program: Program = null as any;
let registerCounter: number = -1;

export function toNAST(program_: Program): NASTProgram {
  const prevProgram = program;
  program = program_;
  const prevTypeEnv = typeEnv;
  typeEnv = TypeEnvironment.forProgram(program, true);
  const prevRegisterCounter = registerCounter;
  registerCounter = 0;

  try {
    return {
      type: "NASTProgram",
      toplevel: bodyToNAST(program.body),
    };
  } finally {
    program = prevProgram;
    typeEnv = prevTypeEnv;
    registerCounter = prevRegisterCounter;
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
  const loc = node.loc;

  function bork(node: ExpressionOrStatement) {
    console.log("BORKED AT:", stringifyJsFile(node as any));
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
      const { value } = node;
      switch (typeof value) {
        case "string":
          return { type: "NASTLiteralString", value, loc };
        case "number":
          return { type: "NASTLiteralNumber", value, loc };
        case "boolean":
          return { type: "NASTLiteralBoolean", value, loc };
        case "object":
        case "undefined":
          invariant(value == null);
          return { type: "NASTLiteralNullish", value, loc };
      }
      throw bork(node);
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
        const funcType = PtrType.deref(typeEnv.getNodeType(id));
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
      invariant(node.left.type !== "PrivateIdentifier");

      return binaryOpToNAST(
        node.operator,
        statToNAST(node.left),
        statToNAST(node.right),
        typeEnv.getNodeType(node.left),
        typeEnv.getNodeType(node.right)
      );
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
      const arrayPtrType = asInstance(typeEnv.getValidNodeType(node), PtrType);
      const arrayType = asInstance(arrayPtrType.target, ArrayType);

      return {
        type: "NASTArray",
        itemType: typeToNAST(arrayType),
        initialLength: {
          type: "NASTLiteralNumber",
          value: node.elements.length,
          loc,
        },
        initialItems: node.elements.map((elem) => {
          invariant(elem && elem.type !== "SpreadElement");
          return statToNAST(elem);
        }),
        loc,
      };
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
          invariant(
            typeEnv.getNodeType(node) instanceof NumberType,
            () => `node should be NumberType, was ${typeEnv.getNodeType(node)}`
          );
          return {
            type: "NASTUnary",
            operator: node.operator,
            operand: statToNAST(node.argument),
            loc,
          };
        }
        case "typeof":
          throw bork(node);
        case "void":
          throw bork(node);
        case "delete":
          throw bork(node);
      }
    }
    case "UpdateExpression": {
      return {
        type: "NASTIncrementPtrTarget",
        isPostfix: !node.prefix,
        isDecrement: node.operator === "--",
        operand: refToNAST(node.argument),
        loc,
      };
    }
    case "AssignmentExpression": {
      const doStat: NASTDo = {
        type: "NASTDo",
        body: [],
        loc,
      };

      // X += 1
      // (do
      //   (assign {assignmentTargetRef} {assignmentTarget})
      //   (ptr_set {assignmentTargetRef} (+ {assignmentTargetRef} VALUE))
      //   (ptr_get {assignmentTargetRef}))
      //
      // X = VALUE
      // (do
      //   (assign {assignmentTargetRef} {assignmentTarget})
      //   (ptr_set {assignmentTargetRef} VALUE)
      //   (ptr_get {assignmentTargetRef}))

      const assignmentTargetRef: NASTIdentifier = {
        type: "NASTIdentifier",
        uniqueName: createRegister(),
        loc,
      };

      doStat.body.push({
        type: "NASTAssignment",
        target: assignmentTargetRef,
        value: refToNAST(node.left),
        loc,
      });

      const asBinary = assignmentOperatorToBinaryOperator(node.operator);
      if (asBinary) {
        doStat.body.push({
          type: "NASTPtrSet",
          target: assignmentTargetRef,
          value: {
            type: "NASTBinary",
            operator: asBinary,
            left: { type: "NASTPtrGet", target: assignmentTargetRef },
            right: statToNAST(node.right),
            loc,
          },
        });
      } else {
        doStat.body.push({
          type: "NASTPtrSet",
          target: assignmentTargetRef,
          value: statToNAST(node.right),
          loc,
        });
      }

      doStat.body.push({
        type: "NASTPtrGet",
        target: assignmentTargetRef,
        loc,
      });

      return doStat;
    }
    case "LogicalExpression": {
      invariant(node.operator !== '??')
      return logicalOpToNAST(node.operator, node.left, node.right)
    }
    case "MemberExpression": {
      return { type: "NASTPtrGet", target: refToNAST(node), loc };
    }
    case "ConditionalExpression": {
      const testType = typeEnv.getNodeType(node.test);
      const consType = typeEnv.getNodeType(node.consequent);
      const altType = typeEnv.getNodeType(node.alternate);

      let condition = statToNAST(node.test);
      if (testType instanceof NumberType) {
        // https://262.ecma-international.org/#sec-toboolean
        condition = {
          type: "NASTConversion",
          convType: "float-bool",
          input: condition,
          loc: condition.loc,
        };
      } else if (testType instanceof BooleanType) {
        // do nothing
      } else {
        throw bork(node.test);
      }

      return {
        type: "NASTIfExpression",
        condition: condition,
        trueBranch: statToNAST(node.consequent),
        falseBranch: statToNAST(node.alternate),
        loc,
      };
    }
    case "CallExpression": {
      if (node.callee.type === 'Identifier' || node.callee.type === 'MemberExpression') {
        return {
          type: "NASTCall",
          callee: refToNAST(node.callee),
          arguments: node.arguments.map((arg) =>
            arg.type === "SpreadElement" ? unreachable() : statToNAST(arg)
          ),
          loc,
        };
      }
      console.log(node);
      throw bork(node);
    }
    case "NewExpression": {
      const type = PtrType.deref(typeEnv.getNodeType(node));
      if (type instanceof ArrayType) {
        // new Array()
        let initialLength: NASTExpression = {
          type: "NASTLiteralNumber",
          value: 0,
          loc,
        };
        let initialItems: NASTExpression[] = [];

        if (
          node.arguments.length === 1 &&
          typeEnv.getNodeType(node.arguments[0]) instanceof NumberType
        ) {
          // new Array(1234)
          initialLength = statToNAST(node.arguments[0] as Expression);
        } else if (node.arguments.length) {
          // new Array(1, 2, 3, 4)
          initialItems = node.arguments.map((item) =>
            statToNAST(item as Expression)
          );
        }

        return {
          type: "NASTArray",
          itemType: typeToNAST(type.arrayItem),
          initialLength,
          initialItems,
          loc,
        };
      }

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
  labelParent: LabeledStatement & {
    body:
      | WhileStatement
      | DoWhileStatement
      | ForStatement
      | ForInStatement
      | ForOfStatement;
  }
): NASTExpression {
  const beforeLoop: NASTExpression[] = [];
  const body: NASTExpression[] = [];

  invariant(labelParent.type === "LabeledStatement");
  const loop = labelParent.body;

  let uniqueLabel = labelParent.label.uniqueName;

  switch (loop.type) {
    case "WhileStatement":
      body.push({
        type: "NASTIf",
        condition: {
          type: "NASTUnary",
          operator: "!",
          operand: statToNAST(loop.test),
          loc: loop.test.loc,
        },
        trueBranch: {
          type: "NASTJump",
          jumpDirection: "break",
          uniqueLabel: labelParent.label.uniqueName,
          loc: loop.test.loc,
        },
      })

      body.push(statToNAST(loop.body))

      body.push({
        type: "NASTJump",
        jumpDirection: "continue",
        uniqueLabel: labelParent.label.uniqueName,
        loc: loop.loc,
      });
      break
    case "DoWhileStatement":
      invariant(false);
    case "ForStatement": {
      let endOfBody = [] as NASTExpression[];
      if (
        loop.init?.type === "VariableDeclaration" &&
        (loop.init.kind === "let" || loop.init.kind === "const")
      ) {
        /* Preserve `let` bindings in a lexical scope https://262.ecma-international.org/#sec-createperiterationenvironment
        for (let i = 0; ; )
          --> let i_bk = 0; for (;;) { let i = i_bk; ...loopBody; i_bk = i; }
        TODO maybe do this in the normalization step?
        */
        for (const { id, init } of (loop.init as VariableDeclaration)
          .declarations) {
          invariant(id.type === "Identifier");
          const { uniqueName, loc } = id;

          // let i_bk = 0
          beforeLoop.push({
            type: "NASTVariableDeclaration",
            declaration: {
              type: "NASTDeclaration",
              declarationType: typeToNAST(typeEnv.getBindingType(uniqueName)),
              uniqueName: uniqueName + "_bk",
              loc,
            },
            initialValue: init
              ? statToNAST(init)
              : { type: "NASTLiteralUninitialized", loc },
            loc,
          });

          // let i = i_bk (in loop)
          body.push({
            type: "NASTVariableDeclaration",
            declaration: {
              type: "NASTDeclaration",
              declarationType: typeToNAST(typeEnv.getBindingType(uniqueName)),
              uniqueName: uniqueName,
              loc,
            },
            initialValue: {
              type: "NASTIdentifier",
              uniqueName: uniqueName + "_bk",
              loc,
            },
            loc,
          });

          // i_bk = i (end of body)
          endOfBody.push({
            type: "NASTAssignment",
            target: {
              type: "NASTIdentifier",
              uniqueName: uniqueName + "_bk",
              loc,
            },
            value: { type: "NASTIdentifier", uniqueName, loc },
            loc,
          });
        }
      }

      if (loop.test) {
        body.push({
          type: "NASTIf",
          condition: {
            type: "NASTUnary",
            operator: "!",
            operand: statToNAST(loop.test),
            loc: loop.test.loc,
          },
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
      if (loop.update) body.push(statToNAST(loop.update));
      body.push({
        type: "NASTJump",
        jumpDirection: "continue",
        uniqueLabel: labelParent.label.uniqueName,
        loc: loop.loc,
      });

      body.push(...endOfBody);

      break;
    }
    case "ForInStatement":
      invariant(false);
    case "ForOfStatement":
      invariant(false);
    default:
      invariant(false);
  }

  return xs(loop.loc, [
    ...beforeLoop,
    {
      type: "NASTLoop",
      loc: loop.loc,
      uniqueLabel,
      body: { type: "NASTDo", body, loc: loop.loc },
    },
  ]);
}

function createRegister() {
  return `register@r_${++registerCounter}`;
}

function refToNAST(node: Pattern): NASTExpression {
  const loc = node.loc;

  if (node.type === "MemberExpression") {
    invariant(node.property.type !== "PrivateIdentifier");

    if (node.computed) {
      const propertyType = typeEnv.getNodeType(node.property);
      invariant(propertyType instanceof NumberType);

      return {
        type: "NASTArrayAccessToReference",
        object: statToNAST(node.object),
        property: statToNAST(node.property),
      };
    } else {
      invariant(node.property.type === "Identifier");

      return {
        type: "NASTPropertyAccessToReference",
        object: statToNAST(node.object),
        property: {
          type: "NASTIdentifier",
          uniqueName: node.property.uniqueName,
        },
      };
    }
  } else if (node.type === "Identifier") {
    invariant(node.isReference);

    return {
      type: "NASTIdentifierToReference",
      uniqueName: node.uniqueName,
      loc,
    };
  } else {
    todo();
  }
}

function logicalOpToNAST(
  operator: '||' | '&&',
  left: Expression,
  right: Expression,
): NASTExpression {
  // TODO: `x||y` and `if(x)` may have different rules of what is falsy

  const loc = { start: left.loc.start, end: right.loc.end }
  const ret: NASTDo = {
    type: "NASTDo",
    body: [],
    loc
  }
  const r_left: NASTIdentifier = {
    type: "NASTIdentifier",
    uniqueName: createRegister(),
    loc,
  };
  ret.body.push({
    type: 'NASTAssignment',
    target: r_left,
    value: statToNAST(left),
    loc
  })


  const lType = typeEnv.getNodeType(left)
  const rType = typeEnv.getNodeType(right)

  if (lType instanceof NumberType) {
    invariant(lType instanceof NumberType)
    invariant(rType instanceof NumberType)

    if (operator === '||') {
      // (do
      //   (assign {r_left} {left})
      //   (if (not (bool {r_left}))
      //      {r_left}
      //      {right})

      ret.body.push({
        type: "NASTIf",
        condition: {
          type: "NASTUnary",
          operator: '!',
          operand: {
            type: "NASTConversion",
            convType: 'float-bool',
            input: r_left,
            loc,
          },
        },
        trueBranch: r_left,
        falseBranch: statToNAST(right),
        loc,
      })
    } else if (operator === '&&') {
      // (do
      //   (assign {r_left} {left})
      //   (if (bool {r_left})
      //      {r_left}
      //      {right})
      ret.body.push({
        type: "NASTIf",
        condition: {
          type: "NASTConversion",
          convType: 'float-bool',
          input: r_left,
          loc,
        },
        trueBranch: r_left,
        falseBranch: statToNAST(right),
        loc,
      })
    } else {
      todo()
    }
  } else if (lType instanceof BooleanType) {
    invariant(lType instanceof BooleanType)
    invariant(rType instanceof BooleanType)

    if (operator === '||') {
      // (do
      //   (assign {r_left} {left})
      //   (if (not (bool {r_left}))
      //      {r_left}
      //      {right})

      ret.body.push({
        type: "NASTIf",
        condition: {
          type: "NASTUnary",
          operator: '!',
          operand: r_left,
        },
        trueBranch: r_left,
        falseBranch: statToNAST(right),
        loc,
      })
    } else if (operator === '&&') {
      // (do
      //   (assign {r_left} {left})
      //   (if (bool {r_left})
      //      {r_left}
      //      {right})
      ret.body.push({
        type: "NASTIf",
        condition: r_left,
        trueBranch: r_left,
        falseBranch: statToNAST(right),
        loc,
      })
    } else {
      todo()
    }
  }

  return ret
}

function binaryOpToNAST(
  operator: BinaryOperator,
  left: NASTExpression,
  right: NASTExpression,
  lType: Type,
  rType: Type
): NASTExpression {
  const loc = { start: left.loc.start, end: right.loc.end };

  switch (operator) {
    case "==":
    case "!=":
    case "===":
    case "!==":
      invariant(lType instanceof NumberType);
      invariant(rType instanceof NumberType);

      return {
        type: "NASTFloatComparison",
        operator: operator,
        left,
        right,
        loc,
      };

    // Float comparison
    case "<":
    case "<=":
    case ">":
    case ">=":
      invariant(lType instanceof NumberType);
      invariant(rType instanceof NumberType);

      return {
        type: "NASTFloatComparison",
        operator: operator,
        left,
        right,
        loc,
      };

    // basic float ops
    case "+":
    case "-":
    case "*":
    case "%":
    case "/":
    case "<<":
    case ">>":
    case ">>>":
    case "|":
    case "^":
    case "&": {
      if (
        operator === "+" &&
        (lType instanceof StringType || rType instanceof StringType)
      ) {
        return { type: "NASTStringConcatenation", left, right, loc };
      }

      invariant(lType instanceof NumberType, () => String(lType));
      invariant(rType instanceof NumberType, () => String(rType));
      return { type: "NASTBinary", operator: operator, left, right, loc };
    }

    case "in":
      todo("not implemented: operator " + operator);
    case "instanceof":
      todo("not implemented: operator " + operator);
    case "**":
      todo("not implemented: operator " + operator);
  }
}

function arrayToNAST(
  arrayType: ArrayType,
  initialLength = 0,
  initialElements: Type[] = []
) {
  invariant(initialLength >= initialElements.length);

  todo();
}

function typeToNAST(type: Type | undefined): NASTType {
  invariant(type, "type must exist");

  type = PtrType.deref(type);

  if (type instanceof NullType) return { type: "null" };
  if (type instanceof StringType) return { type: "string" };
  if (type instanceof NumberType) return { type: "number" };
  if (type instanceof OptionalType)
    return { type: "optional", contents: typeToNAST(type.innerType) };
  if (type instanceof UndefinedType) return { type: "undefined" };
  if (type instanceof FunctionType) {
    invariant(type.params instanceof TupleType)
    invariant(isValidType(type.returns))
    return {
      type: "function",
      params: type.params.items.map((t) => typeToNAST(t)),
      returns: typeToNAST(type.returns),
    };
  }
  if (type instanceof ArrayType && type.arrayItem) {
    return {
      type: "array",
      contents: typeToNAST(type.arrayItem),
    };
  }

  todo('typeToNAST does not support type: ' + type.toString());
}

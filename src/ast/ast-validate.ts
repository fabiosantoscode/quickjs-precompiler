import { isFunction } from "./ast-traversal";
import {
  CallExpression,
  Expression,
  ForOfStatement,
  Function,
  isExpression,
  isStatement,
  Pattern,
  Program,
  StatementOrDeclaration,
} from "./augmented-ast";
import { LocatedErrors } from "./located-errors";

export function validateAst(program: Program) {
  const v = new AstValidator(program);
  v.validateProgram();
}

class AstValidator extends LocatedErrors {
  labels = new Set<string>();

  constructor(public program: Program) {
    super();
  }

  validateProgram() {
    this.validateStatements(this.program.body);
  }

  validateFunction(func: Function) {
    if (func.id) this.validatePattern(func.id);
    this.validatePattern(func.params);
    this.validateStatement(func.body);

    this.invariantAt(
      func,
      !func.generator,
      "generator functions are unsupported"
    );
    this.invariantAt(func, !func.async, "async functions are unsupported");
  }

  validateStatements(stat: StatementOrDeclaration[]) {
    stat.forEach((stat) => this.validateStatement(stat));
  }

  validateStatement(stat: StatementOrDeclaration) {
    this.invariantAt(stat, isStatement(stat));

    switch (stat.type) {
      case "ExpressionStatement": {
        this.validateExpression(stat.expression);
        break;
      }
      case "BlockStatement": {
        this.validateStatements(stat.body);
        break;
      }
      case "EmptyStatement": {
        break;
      }
      case "DebuggerStatement": {
        break;
      }
      case "WithStatement": {
        this.borkAt(stat, "with statement not supported");
        break;
      }
      case "ReturnStatement": {
        this.validateExpression(stat.argument);
        break;
      }
      case "ThrowStatement": {
        this.validateExpression(stat.argument);
        break;
      }
      case "LabeledStatement": {
        this.invariantAt(
          stat,
          stat.body.type === "BlockStatement",
          "labeled statement can only have BlockStatement inside"
        );
        this.invariantAt(stat, stat.label.uniqueName);
        this.labels.add(stat.label.uniqueName);
        this.validateStatement(stat.body);
        this.labels.delete(stat.label.uniqueName);
        break;
      }
      case "BreakStatement": {
        this.invariantAt(stat, this.labels.has(stat.label.uniqueName));
        break;
      }
      case "ContinueStatement": {
        this.invariantAt(stat, this.labels.has(stat.label.uniqueName));
        break;
      }
      case "VariableDeclaration": {
        this.invariantAt(stat, stat.declarations.length === 1);
        const decl = stat.declarations[0];

        this.invariantAt(stat, decl.id.type === "Identifier");

        this.invariantAt(stat, stat.kind === "let" || stat.kind === "const");

        this.invariantAt(stat, decl.init != null);

        if (isFunction(decl.init)) {
          this.validateFunction(decl.init);
        } else {
          this.validateExpression(decl.init);
        }

        break;
      }
      case "IfStatement": {
        this.validateExpression(stat.test);

        this.invariantAt(stat, stat.consequent.type === "BlockStatement");
        this.validateStatement(stat.consequent);
        if (stat.alternate) {
          this.invariantAt(stat, stat.alternate.type === "BlockStatement");
          this.validateStatement(stat.alternate);
        }
        break;
      }
      case "SwitchStatement": {
        this.invariantAt(stat, false, "TODO");
        break;
      }
      case "TryStatement": {
        this.invariantAt(stat, false, "TODO");
        break;
      }
      case "WhileStatement":
      case "DoWhileStatement": {
        this.invariantAt(stat, stat.body.type === "BlockStatement");
        this.validateStatement(stat.body);
        this.validateExpression(stat.test);
        break;
      }
      case "ForStatement": {
        this.invariantAt(stat, stat.body.type === "BlockStatement");
        this.invariantAt(stat, stat.init == null || isExpression(stat.init));

        stat.init && this.validateExpression(stat.init);
        stat.test && this.validateExpression(stat.test);
        stat.update && this.validateExpression(stat.update);
        this.validateStatement(stat.body);
        break;
      }
      case "ForInStatement":
      case "ForOfStatement": {
        this.invariantAt(
          stat,
          stat.left.type !== "VariableDeclaration",
          "vardecl in loops should be removed"
        );
        this.invariantAt(stat, stat.left.type === "Identifier");
        this.validatePattern(stat.left);
        this.invariantAt(stat, !(stat as ForOfStatement).await);
        this.invariantAt(stat, stat.body.type === "BlockStatement");
        this.validateStatement(stat.body);
        break;
      }
      case "ImportDeclaration": {
        this.invariantAt(stat, false, "TODO");
        break;
      }
      case "ExportNamedDeclaration": {
        this.invariantAt(stat, false, "TODO");
        break;
      }
      case "ExportDefaultDeclaration": {
        this.invariantAt(stat, false, "TODO");
        break;
      }
      case "ExportAllDeclaration": {
        this.invariantAt(stat, false, "TODO");
        break;
      }
      default: {
        this.borkAt(stat, "unknown statement " + (stat as any).type);
      }
    }
  }

  validateExpression(expr: Expression | Expression[]) {
    if (Array.isArray(expr)) {
      expr.forEach((expr) => this.validateExpression(expr));
      return;
    }

    this.invariantAt(expr, isExpression(expr));

    switch (expr.type) {
      case "Identifier": {
        this.invariantAt(expr, this.program.allBindings.has(expr.uniqueName));
        this.invariantAt(
          expr,
          expr.isReference === "reference",
          expr.isReference + ""
        );
        break;
      }
      case "Literal": {
        this.invariantAt(
          expr,
          typeof expr.value === "string" ||
            typeof expr.value === "number" ||
            typeof expr.value === "boolean" ||
            typeof expr.value === "bigint" ||
            expr.value === null ||
            expr.value instanceof RegExp
        );
        break;
      }
      case "ThisExpression": {
        this.borkAt(expr, "TODO");
        break;
      }
      case "ArrayExpression": {
        for (const el of expr.elements) {
          if (el?.type === "SpreadElement") {
            this.validateExpression(el.argument);
          } else if (el) {
            this.validateExpression(el);
          }
        }
        break;
      }
      case "ObjectExpression": {
        for (const prop of expr.properties) {
          if (prop.type === "SpreadElement") {
            this.validateExpression(prop.argument);
          } else {
            if (prop.computed) {
              this.validateExpression(prop.key);
            }
            this.validateExpression(prop.value);
          }
        }
        break;
      }
      case "FunctionExpression":
      case "ArrowFunctionExpression": {
        this.borkAt(expr, "functions can only occur in variable declarations");
        break;
      }
      case "UnaryExpression": {
        this.borkAt(expr, "TODO");
        break;
      }
      case "UpdateExpression": {
        this.invariantAt(
          expr,
          expr.argument.type === "Identifier" ||
            (expr.argument.type === "MemberExpression" &&
              expr.argument.property.type !== "PrivateIdentifier"),
          "UpdateExpression can only update names and property.access"
        );
        this.validatePattern(expr.argument);
        break;
      }
      case "BinaryExpression": {
        this.invariantAt(
          expr,
          expr.left.type !== "PrivateIdentifier",
          "Private identifiers not supported yet"
        );
        this.validateExpression(expr.left);
        this.validateExpression(expr.right);
        break;
      }
      case "AssignmentExpression": {
        this.invariantAt(
          expr,
          !(
            expr.operator === "&&=" ||
            expr.operator === "||=" ||
            expr.operator === "??="
          ),
          "logical assignment not supported yet"
        );
        this.validatePattern(expr.left);
        this.validateExpression(expr.right);
        break;
      }
      case "LogicalExpression": {
        this.borkAt(expr, "TODO");
        break;
      }
      case "MemberExpression": {
        if (expr.object.type !== "Super") {
          this.validateExpression(expr.object);
        }
        this.invariantAt(
          expr,
          expr.property.type !== "PrivateIdentifier",
          "Private identifiers not supported yet"
        );
        if (expr.computed) {
          this.validateExpression(expr.property);
        }
        this.invariantAt(
          expr,
          !expr.optional,
          "Optional expressions not supported yet"
        );
        break;
      }
      case "ConditionalExpression": {
        this.borkAt(expr, "TODO");
        break;
      }
      case "NewExpression":
      case "CallExpression": {
        this.invariantAt(
          expr,
          !(expr as CallExpression).optional,
          "optional expressions not supported yet"
        );

        this.invariantAt(
          expr,
          expr.callee.type !== "Super",
          "super not supported yet"
        );

        this.validateExpression(expr.callee);
        for (const arg of expr.arguments) {
          if (arg.type === "SpreadElement") {
            this.validateExpression(arg.argument);
          } else {
            this.validateExpression(arg);
          }
        }
        break;
      }
      case "SequenceExpression": {
        this.borkAt(expr, "TODO");
        break;
      }
      case "YieldExpression": {
        this.borkAt(expr, "TODO");
        break;
      }
      case "TemplateLiteral": {
        this.borkAt(expr, "TODO");
        break;
      }
      case "TaggedTemplateExpression": {
        this.borkAt(expr, "TODO");
        break;
      }
      case "ClassExpression": {
        this.borkAt(expr, "TODO");
        break;
      }
      case "MetaProperty": {
        this.borkAt(expr, "TODO");
        break;
      }
      case "AwaitExpression": {
        this.borkAt(expr, "TODO");
        break;
      }
      case "ChainExpression": {
        this.borkAt(expr, "TODO");
        break;
      }
      case "ImportExpression": {
        this.borkAt(expr, "TODO");
        break;
      }
      default: {
        this.borkAt(expr, "unknown statement " + (expr as any).type);
      }
    }
  }

  validatePattern(pat: Pattern | Pattern[]) {
    if (Array.isArray(pat)) {
      pat.forEach((pat) => this.validatePattern(pat));
      return;
    }

    switch (pat.type) {
      case "Identifier": {
        this.invariantAt(pat, this.program.allBindings.has(pat.uniqueName));
        this.invariantAt(pat, pat.isReference);
        break;
      }
      case "MemberExpression": {
        this.invariantAt(pat, pat.property.type !== "PrivateIdentifier");
        this.invariantAt(pat, pat.object.type !== "Super");
        this.validateExpression(pat.object);
        if (pat.computed) {
          this.validateExpression(pat.property);
        }
        break;
      }
      case "ObjectPattern": {
        for (const item of pat.properties) {
          if (item.type === "RestElement") {
            this.validatePattern(item.argument);
          } else {
            if (item.computed) {
              this.validateExpression(item.key);
            }
            this.validatePattern(item.value);
          }
        }
        break;
      }
      case "ArrayPattern": {
        for (const item of pat.elements) {
          if (item) this.validatePattern(item);
        }
        break;
      }
      case "RestElement": {
        this.validatePattern(pat.argument);
        break;
      }
      case "AssignmentPattern": {
        this.validatePattern(pat.left);
        this.validateExpression(pat.right);
        break;
      }
    }
  }
}

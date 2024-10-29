import invariant from "tiny-invariant";
import {
  astNaiveChildren,
  astPatternAssignedBindings,
  astPatternGetExpressions,
} from "./ast-traversal";
import {
  AnyNode,
  ExpressionOrStatement,
  FunctionDeclaration,
  Identifier,
  Pattern,
  Program,
} from "./augmented-ast";
import { LocatedErrors } from "./located-errors";

export class BindingTracker extends LocatedErrors {
  constructor(public root: Program) {
    super()
  }

  binding(name: string) {
    invariant(name);

    let binding = this.root.allBindings.get(name);
    invariant(binding)

    return binding;
  }

  countRef(node?: Identifier | null) {
    if (node == null) {
      return;
    } else if (node.type === "Identifier") {
      this.binding(node.uniqueName).references++;
    } else {
      this.borkAt(
        node,
        "countRef received a non-identifier node (" + node.type + ")"
      );
    }
  }

  countPat(node?: Pattern | null) {
    if (node == null) {
      return;
    } else if (node.type === "Identifier") {
      this.binding(node.uniqueName).assignments++;
    } else {
      for (const assignee of astPatternAssignedBindings(node)) {
        this.countPat(assignee);
      }

      for (const expr of astPatternGetExpressions(node)) {
        this.visit(expr);
      }
    }
  }

  visit(node?: AnyNode | null) {
    if (node == null) return;

    switch (node.type) {
      case "Identifier": {
        this.countRef(node);
        return;
      }
      case "AssignmentExpression": {
        this.countPat(node.left);
        this.visit(node.right);
        return;
      }
      // Basic Structures
      case "ObjectExpression": {
        for (const prop of node.properties) {
          switch (prop.type) {
            case "Property": {
              if (prop.computed) {
                this.visit(prop.key);
              }
              this.visit(prop.value);
              break;
            }
            case "SpreadElement": {
              this.visit(prop.argument);
              break;
            }
            default: {
              this.borkAt(prop, "unknown property type " + (prop as any).type);
            }
          }
        }
        return;
      }
      case "ArrayExpression": {
        for (const item of node.elements) {
          if (item?.type === "SpreadElement") {
            this.visit(item.argument);
          } else {
            this.visit(item);
          }
        }
        return;
      }
      case "MemberExpression": {
        if (node.computed && node.property.type !== "PrivateIdentifier") {
          this.visit(node.property);
        }
        if (node.object.type !== "Super") {
          this.visit(node.object);
        }
        return;
      }
      // Strings, nums
      case "TemplateLiteral": {
        for (const expr of node.expressions) {
          this.visit(expr);
        }
        return;
      }
      case "Literal":
        return;
      // Flow control
      case "TryStatement": {
        this.visit(node.block);
        this.countPat(node.handler?.param);
        this.visit(node.handler?.body);
        this.visit(node.finalizer);
        return;
      }
      case "FunctionExpression":
      case "FunctionDeclaration":
      case "ArrowFunctionExpression": {
        this.countPat((node as FunctionDeclaration).id);

        for (const param of node.params) {
          this.countPat(param);
        }

        this.visit(node.body);
        return;
      }
      case "SwitchStatement": {
        this.visit(node.discriminant);
        for (const c of node.cases) {
          this.visit(c.test);
          c.consequent.forEach((stat) => this.visit(stat));
        }
        return;
      }
      case "ClassExpression":
      case "ClassDeclaration": {
        this.countPat(node.id);
        this.visit(node.superClass);
        for (const bodyItem of node.body.body) {
          switch (bodyItem.type) {
            case "PropertyDefinition":
            case "MethodDefinition": {
              if (
                bodyItem.computed &&
                bodyItem.key.type !== "PrivateIdentifier"
              ) {
                this.visit(bodyItem.key);
              }
              this.visit(bodyItem.value);
              break;
            }
            case "StaticBlock": {
              for (const item of bodyItem.body) {
                this.visit(item);
              }
              break;
            }
            default: {
              this.borkAt(bodyItem, "unknown node " + (bodyItem as any).type);
            }
          }
        }
        return;
      }
      case "NewExpression":
      case "CallExpression": {
        if (node.callee.type !== "Super") {
          this.visit(node.callee);
        }
        for (const arg of node.arguments) {
          if (arg.type === "SpreadElement") {
            this.visit(arg.argument);
          } else {
            this.visit(arg);
          }
        }
        return;
      }
      case "VariableDeclaration": {
        for (const decl of node.declarations) {
          this.countPat(decl.id);
        }
        return;
      }
      // for-in-of
      case "ForInStatement":
        invariant(false, "TODO");
      case "ForOfStatement":
        invariant(false, "TODO");
      // Labels
      case "BreakStatement": {
        return;
      }
      case "ContinueStatement": {
        return;
      }
      case "LabeledStatement": {
        this.visit(node.body);
        return;
      }
      case "YieldExpression":
      case "AwaitExpression": {
        this.visit(node.argument);
        return;
      }
      // Pass-through
      case "ChainExpression":
      case "ImportExpression":
      case "ParenthesizedExpression":
      case "ExpressionStatement":
      case "BlockStatement":
      case "WithStatement":
      case "ThrowStatement":
      case "ReturnStatement":
      case "IfStatement":
      case "WhileStatement":
      case "DoWhileStatement":
      case "ForStatement":
      case "BinaryExpression":
      case "LogicalExpression":
      case "ConditionalExpression":
      case "SequenceExpression":
      case "Program":
      case "TaggedTemplateExpression": {
        break;
      }
      // no children
      case "EmptyStatement":
      case "DebuggerStatement":
      case "ThisExpression":
      case "MetaProperty": {
        return;
      }
      // unsupported
      case "ImportDeclaration":
      case "ExportNamedDeclaration":
      case "ExportDefaultDeclaration":
      case "ExportAllDeclaration": {
        invariant(false, "Unsupported node " + node.type);
      }
      default: {
        invariant(false, "Unknown node " + (node as AnyNode).type);
      }
    }

    for (const child of astNaiveChildren(node)) {
      this.visit(child as ExpressionOrStatement);
    }
  }
}

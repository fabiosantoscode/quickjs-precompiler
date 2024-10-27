import {
  astNaiveChildren,
  astPatternAssignedBindings,
  astPatternGetExpressions,
} from "./ast-traversal";
import {
  AnyNode,
  FunctionDeclaration,
  Identifier,
  Pattern,
} from "./augmented-ast";
import { LocatedErrors } from "./located-errors";

export class BindingTracker extends LocatedErrors {
  all = new Set<string>();
  assignmentsCount = new Map<string, number>();
  referencesCount = new Map<string, number>();

  countRef(node?: Identifier | null) {
    if (node == null) {
      return;
    } else if (node.type === "Identifier") {
      let count = this.referencesCount.get(node.uniqueName) || 0;
      this.referencesCount.set(node.uniqueName, count + 1);
      this.all.add(node.uniqueName);
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
      let count = this.assignmentsCount.get(node.uniqueName) || 0;
      this.assignmentsCount.set(node.uniqueName, count + 1);
      this.all.add(node.uniqueName);
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
      case "MemberExpression": {
        if (node.computed) {
          this.visit(node.property);
        }
        this.visit(node.object);
        return;
      }
      case "LabeledStatement": {
        this.visit(node.body);
        return;
      }
      case "CatchClause": {
        this.countPat(node.param);
        this.visit(node.body);
        return;
      }
      case "Property":
      case "PropertyDefinition":
      case "MethodDefinition": {
        if (node.computed) {
          this.visit(node.key);
        }
        this.visit(node.value);
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
      case "ClassExpression":
      case "ClassDeclaration": {
        this.countPat(node.id);
        this.visit(node.superClass);
        this.visit(node.body);
        return;
      }
      case "VariableDeclaration": {
        for (const decl of node.declarations) {
          this.countPat(decl.id);
        }
        return;
      }
    }

    for (const child of astNaiveChildren(node)) {
      this.visit(child);
    }
  }
}

import invariant from "tiny-invariant";
import {
  astNaiveChildren,
  astPatternAssignedBindings,
  astTopLevelChildren,
} from "./ast-traversal";
import {
  AnyNode,
  Function,
  Identifier,
  Pattern,
  Program,
} from "./augmented-ast";
import { LocatedErrors } from "./located-errors";

/** Turn identifiers' names into unique IDs and place them in .uniqueName */
class UniqueifyVisitor extends LocatedErrors {
  allNames = new Map<string, number>();
  scopes = [
    {
      type: "var" as "var" | "let",
      variables: new Map<string, string>(),
      preventReassign: new Set(),
      isGlobal: true,
    },
  ];
  labels = new Map<string, string>();
  globalScope = this.scopes[0];

  uniqueifyProgram(ast: Program) {
    invariant(this.scopes.length === 1);
    this.prepareVarScoped(ast);
    this.prepareLetScoped(ast.body);
    this.visitNodes(astTopLevelChildren(ast));
    invariant(this.scopes.length === 1);
  }

  visitNode(node: AnyNode) {
    switch (node.type) {
      case "Identifier": {
        invariant(
          !node.uniqueName,
          "must be the first time we see this ident/label"
        );

        this.uniqueifyReference(node);
        return;
      }
      case "LabeledStatement": {
        const hadDuplicateName = this.labels.get(node.label.name);
        const uniqueName = this.uniqueifyNameString(node.label.name);
        node.label.uniqueName = uniqueName;
        this.labels.set(node.label.name, uniqueName);
        try {
          this.visitNode(node.body);
        } finally {
          if (hadDuplicateName) {
            this.labels.set(node.label.name, hadDuplicateName);
          } else {
            this.labels.delete(node.label.name);
          }
        }

        return;
      }
      case "ContinueStatement":
      case "BreakStatement": {
        if (node.label) {
          const label = this.labels.get(node.label.name);
          this.invariantAt(
            node.label,
            label,
            () => "unknown label " + node.label?.name
          );
          node.label.uniqueName = label;
          return;
        } else {
          return;
        }
      }
      case "BlockStatement": {
        // Enter a scope
        this.scopes.push({
          type: "let",
          variables: new Map(),
          preventReassign: new Set(),
          isGlobal: false,
        });
        this.prepareLetScoped(node.body);
        try {
          return this.visitNodes(node.body);
        } finally {
          invariant(this.scopes.pop());
        }
      }
      case "VariableDeclaration": {
        for (const decl of node.declarations) {
          if (decl.init) {
            this.visitNode(decl.init);
          }
          this.uniqueifyDeclaration(
            decl.id,
            node.kind === "var" ? "var" : "let"
          );
        }
        return;
      }
      // Functions
      case "FunctionDeclaration":
      case "MethodDefinition":
      case "ArrowFunctionExpression":
      case "FunctionExpression": {
        // let-scoped id for the outside
        let functionName;

        if (node.type === "FunctionDeclaration" && node.id) {
          const uniqueName = this.scopes[this.scopes.length - 1].variables.get(
            node.id.name
          );
          invariant(uniqueName, "uniqueName must be precomputed in prepareLet");
          invariant(!node.id.uniqueName);
          node.id.uniqueName = uniqueName;
          functionName = uniqueName;
        }

        const variables = new Map();
        const preventReassign = new Set();

        if (
          (node.type === "FunctionExpression" ||
            node.type === "FunctionDeclaration") &&
          node.id
        ) {
          // Name for this function, used inside
          if (!functionName) {
            functionName = this.uniqueifyNameString(node.id.name);
            node.id.uniqueName = functionName;
          }
        }

        if (functionName) {
          preventReassign.add(functionName);
        }

        if (node.type === "FunctionDeclaration") {
          for (const param of node.params) {
            invariant("untested: function params");
          }
        } else {
          invariant("untested: function exprs");
        }

        try {
          this.scopes.push({
            type: "var",
            variables,
            preventReassign,
            isGlobal: false,
          });

          this.prepareVarScoped(node as Function);

          this.visitNodes((node as Function).body);
        } finally {
          invariant(this.scopes.pop());
        }
        return;
      }
      case "AssignmentExpression": {
        if (
          node.operator === "??=" ||
          node.operator === "&&=" ||
          node.operator === "||="
        ) {
          invariant(false, "not supported: logical assignment");
        }
        for (const assignee of astPatternAssignedBindings(node.left)) {
          let scope = this.scopes.findLast((scop) =>
            scop.variables.has(assignee.name)
          );
          if (scope?.preventReassign.has(assignee.name)) {
            this.borkAt(
              assignee,
              "Cannot reassign (is this the name of a FunctionDeclaration?)"
            );
          }
        }
        this.visitNodes(astNaiveChildren(node));
        return;
      }
      // Pass-through nodes
      case "ArrayPattern":
      case "ObjectPattern":
      case "AssignmentPattern":
      case "RestElement":
      case "Property":
      case "ObjectExpression":
      case "ExpressionStatement":
      case "ReturnStatement":
      case "ThrowStatement":
      case "YieldExpression":
      case "AwaitExpression":
      case "CallExpression":
      case "BinaryExpression": {
        this.visitNodes(astNaiveChildren(node));
        return;
      }
      // terminal nodes
      case "DebuggerStatement":
      case "Literal": {
        return;
      }
      default: {
        invariant(false, "unknown node type " + node.type);
      }
    }
  }

  prepareVarScoped(node: Program | Function) {
    const scope = this.scopes[this.scopes.length - 1];
    const found = new Map<string, Identifier[]>();

    invariant(scope.type === "var");

    function push(ident: Identifier) {
      if (!found.has(ident.name)) {
        found.set(ident.name, [ident]);
      } else {
        found.get(ident.name)?.push(ident);
      }
    }

    if ("params" in (node as Function)) {
      for (const param of (node as Function).params) {
        invariant(param.type === "Identifier", "destructuring not supported");

        push(param);
      }
    }

    function exploreScope(node: AnyNode) {
      if (node.type === "VariableDeclaration" && node.kind === "var") {
        for (const declarator of node.declarations) {
          invariant(
            declarator.id.type === "Identifier",
            "destructuring not supported"
          );

          push(declarator.id);
        }
      }

      if (
        node.type === "FunctionDeclaration" ||
        node.type === "FunctionExpression" ||
        node.type === "ArrowFunctionExpression" ||
        node.type === "MethodDefinition"
      ) {
        return; // don't go into nested children
      }

      for (const child of astNaiveChildren(node)) {
        exploreScope(child);
      }
    }

    for (const child of astNaiveChildren(node)) {
      exploreScope(child);
    }

    for (const [name, users] of found.entries()) {
      const uniqueName = this.uniqueifyNameString(name);
      scope.variables.set(name, uniqueName);
    }
  }

  prepareLetScoped(body: Iterable<AnyNode>) {
    const scope = this.scopes[this.scopes.length - 1];

    for (const node of body) {
      if (
        node.type === "VariableDeclaration" &&
        (node.kind === "let" || node.kind === "const")
      ) {
        for (const decl of node.declarations) {
          invariant(decl.id.type === "Identifier");

          const uniqueName = this.uniqueifyNameString(decl.id.name);
          scope.variables.set(decl.id.name, uniqueName);
        }
      }

      if (node.type === "FunctionDeclaration") {
        invariant(node.id);

        const uniqueName = this.uniqueifyNameString(node.id.name);
        scope.variables.set(node.id.name, uniqueName);
        scope.preventReassign.add(node.id.name);
      }
    }
  }

  uniqueifyNameString(s: string) {
    invariant(!s.includes("@"));

    let count = (this.allNames.get(s) || 0) + 1;
    let uniqueName = `${s}@${count}`;
    this.allNames.set(s, count);

    return uniqueName;
  }

  uniqueifyReference(id: Pattern) {
    invariant(id.type === "Identifier", "only idents are tested");

    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const scope = this.scopes[i];
      const varname = scope.variables.get(id.name);

      if (varname) {
        invariant(!id.uniqueName);
        id.uniqueName = varname;
        return;
      } else {
        continue;
      }
    }

    this.borkAt(id, "variable not found " + id.name);
  }

  uniqueifyDeclaration(id: Pattern, declKind: "var" | "let") {
    invariant(id.type === "Identifier", "destructuring untested");

    let targetScope;

    switch (declKind) {
      case "let": {
        targetScope = this.scopes[this.scopes.length - 1];
        break;
      }
      case "var": {
        targetScope = this.scopes.findLast((scop) => scop.type === "var");
        invariant(targetScope);
      }
    }

    const uniqueName = targetScope.variables.get(id.name);
    this.invariantAt(
      id,
      uniqueName,
      () =>
        `missing variable ${uniqueName}. Variables must be predeclared using ${this.prepareLetScoped.name} and ${this.prepareVarScoped.name}`
    );

    id.uniqueName = uniqueName;
  }

  visitNodes(body: Iterable<AnyNode> | AnyNode) {
    if (typeof (body as any).type === "string") {
      // Be nice and visit a single node if it is one
      this.visitNode(body as AnyNode);
    } else {
      for (const b of body as Iterable<AnyNode>) {
        this.visitNode(b);
      }
    }
  }
}

export function uniqueifyNames(program: Program) {
  new UniqueifyVisitor().uniqueifyProgram(program);
}

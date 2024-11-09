import { defined, invariant } from "../utils";
import {
  astNaiveChildren,
  astNaiveTraversal,
  astPatternAssignedBindings,
  astPatternGetExpressions,
  astTopLevelChildren,
  isFunction,
} from "./ast-traversal";
import {
  AnyNode,
  Identifier,
  Pattern,
  Program,
  Function,
  TrackedClosure,
  TrackedBinding,
} from "./augmented-ast";
import { LocatedErrors } from "./located-errors";
import { Ctx } from "../context";
import { maparrayPush } from "../utils";

/** Turn identifiers' names into unique IDs and place them in .uniqueName
 * Also record closures and collect TrackedBindings */
class UniqueifyVisitor extends LocatedErrors {
  allNames = new Map<string, number>();
  scopes = [
    {
      type: "var" as "var" | "let",
      variables: new Map<string, TrackedBinding>(),
      isGlobal: true,
    },
  ];
  preventReassign = new Set(['undefined@global', 'globalThis@global']);
  currentClosureId = 1;
  currentClosure: TrackedClosure;
  labels = new Map<string, string>();
  globalScope = this.scopes[0];

  constructor(public ctx: Ctx, public root: Program) {
    super();

    Object.defineProperty(root, "allBindings", {
      value: new Map(),
      writable: true,
    });
    Object.defineProperty(root, "allClosures", {
      value: [],
      writable: true,
    });

    this.currentClosure = undefined as any; // assigned below
    this.startScope(root, {
      id: this.currentClosureId++,
      name: "root",
      node: root,
      kind: "var",
      children: [],
      parent: undefined,
      variables: new Map(),
    });
  }

  uniqueifyProgram() {
    const root = this.root;
    invariant(this.scopes.length === 1);
    this.prepareVarScoped(root);
    this.prepareLetScoped(root.body);
    this.visitNodes(astTopLevelChildren(root));
    invariant(this.scopes.length === 1);
    this.finishScope();
  }

  startScope(node: Program | Function, closure: TrackedClosure) {
    Object.defineProperty(node, "closureInfo", {
      value: this.currentClosure,
      writable: true,
    });
    this.currentClosure = closure;
    this.root.allClosures.push(closure);
  }

  finishScope(func?: Function) {
    // absorb variables
    const variables = this.scopes[this.scopes.length - 1].variables;
    for (const binding of variables.values()) {
      this.currentClosure.variables.set(binding.uniqueName, binding);
    }

    if (func) {
      this.borkIfDefaultParametersUseShadowedNames(func);
    }
  }

  borkIfDefaultParametersUseShadowedNames(func: Function) {
    const scope = this.scopes[this.scopes.length - 1];
    const parentScope = this.scopes[this.scopes.length - 2];

    invariant(parentScope);
    // Forbid shadowing varnames in default parameters

    for (const param of func.params || []) {
      for (const expr of astPatternGetExpressions(param)) {
        for (const ident of astNaiveTraversal(expr)) {
          if (ident.type === "Identifier") {
            const existsOutside = parentScope.variables.has(ident.name);
            const existsInside = scope.variables.has(ident.name);

            if (existsOutside && existsInside) {
              this.borkAt(
                ident,
                `Variable ${ident.name} is shadowed and ambiguously referred to in a default parameter`
              );
            }
          }
        }
      }
    }
  }

  addVariable(name: string, uniqueName: string, kind: TrackedBinding["kind"], atScope = this.scopes[this.scopes.length - 1]) {
    const binding: TrackedBinding = {
      name,
      uniqueName,
      kind,
      assignments: 0,
      references: 0,
      possibleMutations: 0,
      closure: this.currentClosure,
    };
    atScope.variables.set(name, binding);
    this.currentClosure.variables.set(uniqueName, binding);
    this.root.allBindings.set(uniqueName, binding);
  }

  visitNode(node: AnyNode) {
    switch (node.type) {
      case "Identifier": {
        this.invariantAt(
          node,
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
      case "ArrowFunctionExpression":
      case "FunctionExpression": {
        try {
          this.scopes.push({
            type: "var",
            variables: new Map(),
            isGlobal: false,
          });
          this.startScope(node, {
            id: this.currentClosureId++,
            name: node.id?.name,
            node: node as Function,
            kind: "var",
            children: [],
            parent: this.currentClosure,
            variables: new Map(),
          });

          Object.defineProperty(node, "closureInfo", {
            value: this.currentClosure,
            writable: true,
          });

          this.prepareVarScoped(node as Function);

          if (node.type === 'FunctionExpression' && node.id) {
            this.uniqueifyDeclaration(node.id, 'const')
          }
          for (const param of node.params) {
            this.uniqueifyDeclaration(param, "var");
          }

          this.visitNodes((node as Function).body);
        } finally {
          this.finishScope(node);
          invariant(this.currentClosure.parent);
          this.currentClosure = this.currentClosure.parent;
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
        this.visitNodes(astNaiveChildren(node));
        
        // Prevent reassign!
        for (const assignee of astPatternAssignedBindings(node.left)) {
          if (this.preventReassign.has(assignee.uniqueName)) {
            this.borkAt(
              assignee,
              "Cannot reassign (is this the name of a FunctionDeclaration or const?)"
            );
          }
        }
        return;
      }
      case "MemberExpression": {
        this.visitNode(node.object);
        if (node.computed) {
          this.visitNode(node.property);
        }
        return;
      }
      // Pass-through nodes
      case "ArrayExpression":
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
      case "EmptyStatement":
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

    if (node.type === 'FunctionExpression' && node.id) {
      const uniqueName = this.uniqueifyNameString(node.id.name);
      this.preventReassign.add(uniqueName)
      this.addVariable(node.id.name, uniqueName, 'const');
    }

    if ("params" in (node as Function)) {
      for (const param of (node as Function).params) {
        for (const paramIdent of astPatternAssignedBindings(param)) {
          maparrayPush(found, paramIdent.name, paramIdent);
        }
      }
    }

    function exploreScope(node: AnyNode) {
      if (node.type === "VariableDeclaration" && node.kind === "var") {
        for (const declarator of node.declarations) {
          invariant(
            declarator.id.type === "Identifier",
            "destructuring not supported"
          );

          maparrayPush(found, declarator.id.name, declarator.id);
        }
      }

      if (isFunction(node)) {
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
      this.addVariable(name, uniqueName, "var");
    }
  }

  prepareLetScoped(body: Iterable<AnyNode>) {
    for (const node of body) {
      if (
        node.type === "VariableDeclaration" &&
        (node.kind === "let" || node.kind === "const")
      ) {
        const decl = node.declarations[0];
        invariant(decl.id.type === "Identifier");

        const uniqueName = this.uniqueifyNameString(decl.id.name);
        this.addVariable(decl.id.name, uniqueName, node.kind);

        if (node.kind === "const") {
          this.preventReassign.add(defined(uniqueName));
        }
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
        id.uniqueName = varname.uniqueName;
        return;
      } else {
        continue;
      }
    }

    if (this.ctx.hasGlobal(id.name)) {
      id.uniqueName = id.name + "@global";

      if (!this.globalScope.variables.has(id.uniqueName)) {
        this.addVariable(id.name, id.uniqueName, 'var', this.globalScope)
      }

      return;
    }

    this.borkAt(id, "variable not found " + id.name);
  }

  uniqueifyDeclaration(id: Pattern, declKind: "var" | "let" | "const") {
    invariant(id.type === "Identifier", "destructuring untested");

    let targetScope;

    switch (declKind) {
      case "const":
      case "let": {
        targetScope = this.scopes[this.scopes.length - 1];
        break;
      }
      case "var": {
        targetScope = this.scopes.findLast((scop) => scop.type === "var");
        invariant(targetScope);
      }
    }

    const binding = targetScope.variables.get(id.name);
    this.invariantAt(
      id,
      binding,
      () =>
        `missing variable ${id.name}. Variables must be predeclared using ${this.prepareLetScoped.name} and ${this.prepareVarScoped.name}`
    );

    id.uniqueName = binding.uniqueName;
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
  new UniqueifyVisitor(new Ctx(), program).uniqueifyProgram();
}

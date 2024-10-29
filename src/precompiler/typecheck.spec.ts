import { parseJsFile } from "parse";

/** Typechecking is done through finding all the potential stacks.
 * Stacks will be described as arrays of function names, which must be constant and never-reassigned.
 *
 * Let's discover which *things* are ever reassigned:
 */
import { BindingTracker } from "./typecheck";

const testCounts = (code: string, get?: string) => {
  const program = parseJsFile(code);

  const finder = new BindingTracker(program);
  finder.visit(program);

  if (get) {
    return {
      assignments: program.allBindings.get(get)?.assignments,
      references: program.allBindings.get(get)?.references,
    };
  } else {
    return program.allBindings;
  }
};

it("counts assignments", () => {
  expect(testCounts("let foo", "foo@1")).toMatchInlineSnapshot(`
    {
      "assignments": 1,
      "references": 0,
    }
  `);

  expect(testCounts("let foo = 1", "foo@1")).toMatchInlineSnapshot(`
    {
      "assignments": 1,
      "references": 0,
    }
  `);

  expect(testCounts("let foo = 1; foo = 2", "foo@1")).toMatchInlineSnapshot(`
    {
      "assignments": 2,
      "references": 0,
    }
  `);

  expect(
    testCounts(
      `
        let foo = 1; ({ foo } = { foo })
      `,
      "foo@1"
    )
  ).toMatchInlineSnapshot(`
    {
      "assignments": 2,
      "references": 1,
    }
  `);
});

it("tricky stuff for later, should crash with TODO for now", () => {
  expect(() => testCounts("function foo() {}; foo = () => {}")).toThrow();
  expect(() => testCounts("for (foo of []);")).toThrow();
  expect(() => testCounts("for (arguments[0] of []);")).toThrow();
  expect(() => testCounts("arguments[0]")).toThrow();
});

import invariant from "tiny-invariant";
import { AnyNode, Program, Function } from "./augmented-ast";
import { astNaiveChildren } from "./ast-traversal";

/** We will also bind closures. What is defined in each closure? */
export interface TrackedClosure {
  name?: string;
  node: Program | Function;
  children: TrackedClosure[];
  parent?: TrackedClosure;
}

export class ClosureTracker {
  currentClosure: TrackedClosure | undefined;

  visitRoot(root: Program) {
    this.currentClosure = {
      name: "root",
      node: root,
      children: [],
      parent: undefined,
    };

    this.visit(root);
    invariant(this.currentClosure.parent === undefined);

    return this.currentClosure;
  }

  private visit(node: AnyNode | Program) {
    switch (node.type) {
      case "ArrowFunctionExpression":
      case "FunctionExpression":
      case "FunctionDeclaration": {
        this.currentClosure = {
          name: node.id?.name,
          node: node,
          children: [],
          parent: this.currentClosure,
        };
        this.currentClosure.parent?.children.push(this.currentClosure);

        this.visit(node.body);

        this.currentClosure = this.currentClosure.parent;

        return;
      }
    }

    for (const child of astNaiveChildren(node)) {
      this.visit(child);
    }
  }
}

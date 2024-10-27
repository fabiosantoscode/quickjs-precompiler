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
import { parseJsFile } from "parse";
import { LocatedErrors } from "./located-errors";

/** Typechecking is done through finding all the potential stacks.
 * Stacks will be described as arrays of function names, which must be constant and never-reassigned.
 *
 * Let's discover which *things* are ever reassigned:
 */
import { BindingTracker } from "./typecheck";

const countAssignments = (code: string) => {
  const program = parseJsFile(code);

  const finder = new BindingTracker();
  finder.visit(program);

  return finder.assignmentsCount;
};

const countReferences = (code: string) => {
  const program = parseJsFile(code);

  const finder = new BindingTracker();
  finder.visit(program);

  return finder.referencesCount;
};

it("counts assignments", () => {
  expect(countAssignments("let foo")).toMatchInlineSnapshot(`
    Map {
      "foo@1" => 1,
    }
  `);

  expect(countAssignments("let foo = 1")).toMatchInlineSnapshot(`
    Map {
      "foo@1" => 1,
    }
  `);

  expect(countAssignments("let foo = 1; foo = 2")).toMatchInlineSnapshot(`
    Map {
      "foo@1" => 2,
    }
  `);

  expect(countAssignments("let foo = 1; ({ foo } = { foo })"))
    .toMatchInlineSnapshot(`
      Map {
        "foo@1" => 2,
      }
    `);
});

it("counts references", () => {
  expect(countReferences("let foo")).toMatchInlineSnapshot(`Map {}`);

  expect(countReferences("let foo = 1")).toMatchInlineSnapshot(`Map {}`);

  expect(countReferences("let foo = 1; foo = 2")).toMatchInlineSnapshot(
    `Map {}`
  );

  expect(countReferences("let foo = 1; ({ foo } = { foo })"))
    .toMatchInlineSnapshot(`
      Map {
        "foo@1" => 1,
      }
    `);
});

it("tricky stuff for later, should crash with TODO for now", () => {
  expect(() => countReferences("function foo() {}; foo = () => {}")).toThrow();
  expect(() => countReferences("for (foo of []);")).toThrow();
  expect(() => countReferences("for (arguments[0] of []);")).toThrow();
  expect(() => countReferences("arguments[0]")).toThrow();
});

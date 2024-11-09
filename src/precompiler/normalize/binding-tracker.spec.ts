import { parseJsFile } from "../../parse";

/** Typechecking is done through finding all the potential stacks.
 * Stacks will be described as arrays of function names, which must be constant and never-reassigned.
 *
 * Let's discover which *things* are ever reassigned:
 */
import { BindingTracker } from "./binding-tracker";

const testCounts = (code: string, get?: string) => {
  const program = parseJsFile(code);

  if (get) {
    return {
      assignments: program.allBindings.get(get)?.assignments,
      references: program.allBindings.get(get)?.references,
    };
  } else {
    return program.allBindings;
  }
};

const testCountsAndCalls = (code: string, get?: string) => {
  const program = parseJsFile(code); // calls new BindingTracker().visit

  if (get) {
    return {
      assignments: program.allBindings.get(get)?.assignments,
      references: program.allBindings.get(get)?.references,
      callReferences: program.allBindings.get(get)?.callReferences,
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

it("finds trivially found closure calls", () => {
  expect(testCountsAndCalls(`let foo = () => 1; foo()`, "foo@1"))
    .toMatchInlineSnapshot(`
    {
      "assignments": 1,
      "callReferences": 1,
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

/** Now we have some book-keeping, we should find all possible codepaths. What calls will be done through functions we know exactly all the calls for? <PS: if a function is not strictly known, it becomes a root> */
import {
  AnyNode2,
  ArrowFunctionExpression,
  CallExpression,
  FunctionExpression,
  Program,
  TrackedClosure,
} from "../augmented-ast";
import { LocatedErrors } from "../located-errors";
import { Ctx } from "../../context";

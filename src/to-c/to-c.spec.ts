import { HygienicNames } from "../ast/hygienic-names";
import { parseJsFile } from "../parse";
import { TypeEnvironment } from "../typing/type-environment";
import { invariant } from "../utils";
import { CEmitter } from "./c-emitter";
import { extractCFromProgram } from "../extract-c/extract-c";
import { nodeToC } from "./node-type-to-c";
import { isFunction } from "../ast/ast-traversal";

function toC([program, cDecls]: ReturnType<
  typeof extractCFromProgram
>): string {
  const env = TypeEnvironment.forProgram(program, true);
  const names = HygienicNames.forProgram(program, "r_");

  const emitter = new CEmitter(names);

  for (const decl of cDecls) {
    //const asNast =
  }

  emitter.finish();

  return emitter.getFullCCode();
}

it("can turn CDeclaration into C", () => {
  const text = testToC(`
    let z = function z() {
      let x = 1
      x = 2
    }

    z()
  `);
  expect(text).toMatchInlineSnapshot(`
    "int c_binding_z_1();
    int c_binding_z_1() {
      double r_1 = 1.0;
      double x_1 = r_1;
      double r_2 = 2.0;
      x_1 = r_2;
    }"
  `);
});

it("can turn some statements into C", () => {
  const text = testToC(`
    let z = function z() {
      let x = 1
      if (x === 1) {
        x = 2
      }
    }

    z()
  `);
  expect(text).toMatchInlineSnapshot(`
    "int c_binding_z_1();
    int c_binding_z_1() {
      double r_1 = 1.0;
      double x_1 = r_1;
      double r_2 = 1.0;
      int r_3 = x_1 == r_2;
      if (r_3) {
        double r_4 = 2.0;
        x_1 = r_4;
      }
    }"
  `);
});

function testToC(source: string) {
  const [program, extracted] = extractCFromProgram(parseJsFile(source));

  return toC([program, extracted]);
}

import { HygienicNames } from "../ast/hygienic-names";
import { NumberType } from "../typing/type";
import { CEmitter } from "./c-emitter";

it("emits C", () => {
  const cEmitter = new CEmitter(HygienicNames.forTestingPurposes("r_"));

  cEmitter.emitFunction(
    {
      uniqueName: "func@1",
      params: {
        "x@1": new NumberType(),
      },
      retType: new NumberType(),
    },
    () => {
      const num1 = cEmitter.emitNumber(undefined, 1);
      const register = cEmitter.emitBinOp(
        new NumberType(),
        "y@1",
        "+",
        "x@1",
        num1
      );
      cEmitter.emitReturn(register);
    }
  );

  cEmitter.emitFunction(
    {
      uniqueName: "func@2",
      params: {
        "x@1": new NumberType(),
      },
      retType: new NumberType(),
    },
    () => {
      cEmitter.emitReturn("x@1");
    }
  );

  cEmitter.finish();

  expect(cEmitter.getFullCCode()).toMatchInlineSnapshot(`
    "double func_1(double x_1);
    double func_2(double x_1);
    double func_1(double x_1) {
      double r_1 = 1.0;
      double y_1 = x_1 + r_1;
      return y_1;
    }

    double func_2(double x_1) {
      return x_1;
    }"
  `);
});

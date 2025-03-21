import { library } from "./all";
import { defined } from "../utils";
import { NumberType, StringType } from "../typing/type";

const string = defined(library.byName.get("String"));

it("contains string object and methods", () => {
  expect(
    string.methods["charCodeAt"].functor.match([new NumberType()])
  ).toMatchInlineSnapshot(`StringType {}`);

  expect(
    string.methods["charCodeAt"].functor.match([new StringType()])
  ).toMatchInlineSnapshot(`null`);
});

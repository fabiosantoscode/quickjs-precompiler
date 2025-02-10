import { parseJsFile, stringifyJsFile } from "../../parse";
import { explicitLabels } from "./explicit-labels";

it("makes labels explicit", () => {
  const program = parseJsFile(`
    foo: {
      break foo;
    }

    bar: {
      let x
      for (x of [1, 2, 3]) {
        break
      }
    }

    while (0) {
      continue
    }
  `);

  explicitLabels(program);

  expect(stringifyJsFile(program)).toMatchInlineSnapshot(`
    "foo: {
      break foo;
    }
    bar: {
      let x = undefined;
      autoLabel_1: for (x of [1, 2, 3]) {
        break autoLabel_1;
      }
    }
    autoLabel_2: while (0) {
      continue autoLabel_2;
    }"
  `);
});

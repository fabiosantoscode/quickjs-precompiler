import {
  BooleanType,
  OptionalType,
  NullType,
  NumberType,
  NumericType,
  StringType,
  Type,
  typeUnion,
  UndefinedType,
} from "./type";

it("knows how to union types", () => {
  expect(
    [
      [new BooleanType(), new BooleanType()],
      [new BooleanType(), new BooleanType()],
      [new BooleanType(), new BooleanType()],
      [new BooleanType(), new BooleanType()],

      [new NumberType(), new NumberType()],
      [new NumberType(), new NumberType()],
      [new NumberType(), new NumberType()],
      [new NumberType(), new NumberType()],

      [new NumberType(), new NumericType()],
      [new NumberType(), new NumericType()],
      [new NumericType(), new NumericType()],

      [new StringType(), new StringType()],
      [new StringType(), new StringType()],
      [new StringType(), new StringType()],
      [new StringType(), new StringType()],

      [new NullType(), new NullType()],

      [new UndefinedType(), new UndefinedType()],
    ].map(testUnion)
  ).toMatchInlineSnapshot(`
    [
      "Boolean           |  Boolean        =  Boolean",
      "Boolean           |  Boolean        =  Boolean",
      "Boolean           |  Boolean        =  Boolean",
      "Boolean           |  Boolean        =  Boolean",
      "Number            |  Number         =  Number",
      "Number            |  Number         =  Number",
      "Number            |  Number         =  Number",
      "Number            |  Number         =  Number",
      "Number            |  Numeric        =  Numeric",
      "Number            |  Numeric        =  Numeric",
      "Numeric           |  Numeric        =  Numeric",
      "String            |  String         =  String",
      "String            |  String         =  String",
      "String            |  String         =  String",
      "String            |  String         =  String",
      "Null              |  Null           =  Null",
      "Undefined         |  Undefined      =  Undefined",
    ]
  `);
});

it("knows how to union composed types", () => {
  expect(
    [
      [new OptionalType(new NumberType()), new NumberType()],
      [new OptionalType(new NumberType()), new NumberType()],
      [new OptionalType(new NumberType()), new NumberType()],
      [new OptionalType(new NumberType()), new NumberType()],
      [new OptionalType(new StringType()), new NumberType()],
    ].map(testUnion)
  ).toMatchInlineSnapshot(`
    [
      "Optional Number   |  Number         =  Optional Number",
      "Optional Number   |  Number         =  Optional Number",
      "Optional Number   |  Number         =  Optional Number",
      "Optional Number   |  Number         =  Optional Number",
      "Optional String   |  Number         =  undefined",
    ]
  `);
});

function testUnion([t1, t2]: Type[]) {
  const union = typeUnion(t1, t2);
  const reciprocalUnion = typeUnion(t2, t1);

  expect(union).toEqual(reciprocalUnion);

  let l = t1.toString().padEnd(17);
  let r = t2.toString().padEnd(13);
  return `${l} |  ${r}  =  ${union?.toString()}`;
}

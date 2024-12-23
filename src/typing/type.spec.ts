import {
  BooleanType,
  NullableType,
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
      [new BooleanType(true), new BooleanType()],
      [new BooleanType(true), new BooleanType(true)],
      [new BooleanType(true), new BooleanType(false)],

      [new NumberType(), new NumberType()],
      [new NumberType(1), new NumberType()],
      [new NumberType(1), new NumberType(2)],
      [new NumberType(1), new NumberType(1)],

      [new NumberType(), new NumericType()],
      [new NumberType(1), new NumericType()],
      [new NumericType(), new NumericType()],

      [new StringType(), new StringType()],
      [new StringType("x"), new StringType()],
      [new StringType("x"), new StringType("x")],
      [new StringType("x"), new StringType("y")],

      [new NullType(), new NullType()],

      [new UndefinedType(), new UndefinedType()],
    ].map(testUnion)
  ).toMatchInlineSnapshot(`
    [
      "Boolean           |  Boolean        =  Boolean",
      "Boolean true      |  Boolean        =  Boolean",
      "Boolean true      |  Boolean true   =  Boolean true",
      "Boolean true      |  Boolean false  =  Boolean",
      "Number            |  Number         =  Number",
      "Number 1          |  Number         =  Number",
      "Number 1          |  Number 2       =  Number",
      "Number 1          |  Number 1       =  Number 1",
      "Number            |  Numeric        =  Numeric",
      "Number 1          |  Numeric        =  Numeric",
      "Numeric           |  Numeric        =  Numeric",
      "String            |  String         =  String",
      "String "x"        |  String         =  String",
      "String "x"        |  String "x"     =  String "x"",
      "String "x"        |  String "y"     =  String",
      "Null              |  Null           =  Null",
      "Undefined         |  Undefined      =  Undefined",
    ]
  `);
});

it("knows how to union composed types", () => {
  expect(
    [
      [new NullableType(new NumberType()), new NumberType()],
      [new NullableType(new NumberType()), new NumberType(1)],
      [new NullableType(new NumberType(1)), new NumberType()],
      [new NullableType(new NumberType(1)), new NumberType(2)],
      [new NullableType(new StringType()), new NumberType()],
    ].map(testUnion)
  ).toMatchInlineSnapshot(`
    [
      "Nullable Number   |  Number         =  Nullable Number",
      "Nullable Number   |  Number 1       =  Nullable Number",
      "Nullable Number 1 |  Number         =  Nullable Number",
      "Nullable Number 1 |  Number 2       =  Nullable Number",
      "Nullable String   |  Number         =  undefined",
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

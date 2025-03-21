import {
  BooleanType,
  OptionalType,
  NullType,
  NumberType,
  StringType,
  Type,
  typeUnion,
  UndefinedType,
  InvalidType,
  UnknownType,
  ArrayType,
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
      "Optional String   |  Number         =  Invalid",
    ]
  `);
});

it("knows how to propagate the invalid type", () => {
  expect(
    [
      [new InvalidType(), new NumberType()],
      [new NumberType(), new InvalidType()],
      [new InvalidType(), new InvalidType()],
    ].map(testUnion)
  ).toMatchInlineSnapshot(`
    [
      "Invalid           |  Number         =  Invalid",
      "Number            |  Invalid        =  Invalid",
      "Invalid           |  Invalid        =  Invalid",
    ]
  `);
});

it("knows how to un-propagate the unknown type", () => {
  expect(
    [
      [new UnknownType(), new NumberType()],
      [new NumberType(), new UnknownType()],
      [new UnknownType(), new UnknownType()],
    ].map(testUnion)
  ).toMatchInlineSnapshot(`
    [
      "Unknown           |  Number         =  Number",
      "Number            |  Unknown        =  Number",
      "Unknown           |  Unknown        =  Unknown",
    ]
  `);
});

it("knows how to call basic string/array methods", () => {
  expect(
    [
      testMethod(new StringType(), "slice"),
      testMethod(new StringType(), "slice", new UnknownType()),
    ].map(String)
  ).toMatchInlineSnapshot(`
    [
      "(String).slice() -> String",
      "(String).slice(Unknown) -> Unknown",
    ]
  `);

  expect(
    [
      testMethod(new ArrayType(new NumberType()), "slice", new NumberType()),
      testMethod(new ArrayType(new NumberType()), "slice", new UnknownType()),
      testMethod(new ArrayType(new UnknownType()), "slice", new UnknownType()),
      testMethod(new ArrayType(new UnknownType()), "slice", new NumberType()),
    ].map(String)
  ).toMatchInlineSnapshot(`
    [
      "(Array Number).slice(Number) -> Array Number",
      "(Array Number).slice(Unknown) -> Unknown",
      "(Array Unknown).slice(Unknown) -> Unknown",
      "(Array Unknown).slice(Number) -> Unknown",
    ]
  `);
});

it("knows how to call array methods that change array contents", () => {
  expect(
    [
      testMethod(new ArrayType(new UnknownType()), "push", new NumberType()),
    ].map(String)
  ).toMatchInlineSnapshot(`
    [
      "(Array Unknown).push(Number) -> Unknown and becomes Array Number",
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

function testMethod(type: Type, method: string, ...args: Type[]) {
  let typeStr = String(type);

  const ret = String(type.getMethodRet?.(method, args));
  const becomes = String(type._withMethodArgs?.(method, args));

  const becomesStr = becomes !== typeStr ? ` and becomes ${becomes}` : "";

  return `(${typeStr}).${method}(${args.join(", ")}) -> ${ret}${becomesStr}`;
}

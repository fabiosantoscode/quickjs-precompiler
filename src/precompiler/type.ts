
export type KnownType =
    ['string', string | undefined]
    | ['number', number | undefined]
    | ['boolean', boolean | undefined]
    | ['one-of', KnownType[]]

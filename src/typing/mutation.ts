import { invariant } from "../utils";
import { InvalidType, MutableCell, Type, typeEqual, typeUnion } from "./type";

/** Encapsulates a mutation. This is conceptually a secondary return from Type['_union'], but not a literal return from it because it would be cumbersome to propagate mutations in all of those functions. */
export class TypeMutation {
  private constructor(
    private mutableType: MutableCell,
    private mutateTo: Type
  ) {}

  mutate(): boolean {
    const newType = typeUnion(this.mutableType.target, this.mutateTo);
    const didMutate = !typeEqual(this.mutableType.target, newType);
    this.mutableType.target = newType ?? new InvalidType();
    return didMutate;
  }

  /** Appended during Type['_union'] */
  static mutations?: TypeMutation[];

  static recordMutation(mutableType: MutableCell, mutateTo: Type) {
    invariant(this.mutations);
    this.mutations.push(new TypeMutation(mutableType, mutateTo));
  }

  /** While `cb` is running, track calls to `recordMutations` and return them */
  static withMutationsCollected(cb: () => void): TypeMutation[] {
    invariant(this.mutations == null);
    this.mutations = [];

    try {
      cb();
      return this.mutations;
    } finally {
      this.mutations = undefined;
    }
  }
}

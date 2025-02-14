import { invariant } from "../utils";
import { InvalidType, MutableCell, Type, typeEqual, typeUnion } from "./type";

/** Encapsulates a mutation. This is conceptually a secondary return from Type['_union'], but not a literal return from it because it would be cumbersome to propagate mutations in all of those functions. */
export class TypeMutation {
  private constructor(
    private mutableType: MutableCell,
    private mutateTo: Type
  ) {}

  mutate(): boolean {
    const newType = typeUnion(this.mutableType.type, this.mutateTo);
    const didMutate = !typeEqual(this.mutableType.type, newType);
    this.mutableType.type = newType;
    return didMutate;
  }

  /** Appended during Type['_union'] */
  static mutations?: TypeMutation[];

  static recordMutation(mutableType: MutableCell, mutateTo: Type) {
    invariant(this.mutations);
    this.mutations.push(new TypeMutation(mutableType, mutateTo));
  }

  /** While `cb` is running, track calls to `recordMutations` and return them */
  static withMutationsCollected(cb: () => Type): [Type, TypeMutation[]] {
    invariant(this.mutations == null);
    this.mutations = [];

    try {
      const type = cb();
      const mutations = this.mutations;
      return [type, mutations];
    } finally {
      this.mutations = undefined;
    }
  }
}

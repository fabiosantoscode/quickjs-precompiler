export class Ctx {
  hasGlobal(name: string) {
    if (name === "undefined") return true;
    if (name === "globalThis") return true;

    return false;
  }
}

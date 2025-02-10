export class Ctx {
  hasGlobal(name: string) {
    if (name === "undefined") return true;
    if (name === "globalThis") return true;
    if (name === "Array") return true;

    return false;
  }
}

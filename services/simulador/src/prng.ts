export class PRNG {
  private s: number;

  constructor(seed: number = 42) {
    this.s = seed;
  }

  public setSeed(seed: number): void {
    this.s = seed;
  }

  public next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  public choice<T>(arr: readonly T[] | T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  public randomBetween(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  public chance(probability: number): boolean {
    return this.next() < probability;
  }
}

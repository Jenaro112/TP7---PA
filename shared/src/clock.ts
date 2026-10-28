/**
 * Clock utilities for RutaSur simulation.
 * Default: 1 simulated hour = 30 real seconds (acceleration factor = 120x).
 */
export class SimulatedClock {
  private baseRealTime: number;
  private baseSimulatedTime: number;
  private accelerationFactor: number; // e.g. 120x

  constructor(
    initialSimulatedTime: Date = new Date(),
    accelerationFactor: number = 120
  ) {
    this.baseRealTime = Date.now();
    this.baseSimulatedTime = initialSimulatedTime.getTime();
    this.accelerationFactor = accelerationFactor;
  }

  public now(): Date {
    const elapsedRealMs = Date.now() - this.baseRealTime;
    const elapsedSimulatedMs = elapsedRealMs * this.accelerationFactor;
    return new Date(this.baseSimulatedTime + elapsedSimulatedMs);
  }

  public setSimulatedTime(time: Date): void {
    this.baseRealTime = Date.now();
    this.baseSimulatedTime = time.getTime();
  }

  public setAcceleration(factor: number): void {
    // Re-anchor to prevent time jumps
    const currentSim = this.now().getTime();
    this.baseRealTime = Date.now();
    this.baseSimulatedTime = currentSim;
    this.accelerationFactor = factor;
  }

  public getAcceleration(): number {
    return this.accelerationFactor;
  }

  /**
   * Returns simulated milliseconds corresponding to real milliseconds
   */
  public realToSimulatedDuration(realMs: number): number {
    return realMs * this.accelerationFactor;
  }

  /**
   * Returns real milliseconds needed to wait for simulated milliseconds
   */
  public simulatedToRealDuration(simulatedMs: number): number {
    return simulatedMs / this.accelerationFactor;
  }
}

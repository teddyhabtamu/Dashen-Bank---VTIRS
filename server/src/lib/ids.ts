// Generate a human-friendly, sequential-style vehicle code.
// Format: VB-YYYY-NNNNNN  (VB = Vehicle, Dashen Bank fleet prefix)
export function generateVehicleCode(year: number, sequence: number): string {
  const seq = String(sequence).padStart(6, "0");
  return `VB-${year}-${seq}`;
}

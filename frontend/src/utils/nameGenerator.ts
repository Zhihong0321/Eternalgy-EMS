// Generate random 6-letter simulator name
export function generateSimulatorName(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let name = '';
  for (let i = 0; i < 6; i++) {
    name += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return name;
}

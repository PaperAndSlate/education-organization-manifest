export function statusBlocksTraceability(status: string, hostedMode: boolean): boolean {
  return status === 'open' && !hostedMode;
}

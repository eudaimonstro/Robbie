/** A count with its noun, singular or plural: "1 change", "2 changes", "0 sections" */
export function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

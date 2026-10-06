/**
 * Move one item of a list to another index, returning a new list. An index that is out of
 * range or not a whole number (a stale index from another client, say) leaves the list
 * unchanged, rather than inserting `undefined`. A target past either end moves to that end.
 */
export function moveItem<T>(list: readonly T[], fromIndex: number, toIndex: number): T[] {
  if (!Number.isInteger(fromIndex) || fromIndex < 0 || fromIndex >= list.length) {
    return [...list];
  }
  if (!Number.isInteger(toIndex)) return [...list];
  const result = [...list];
  const [moved] = result.splice(fromIndex, 1);
  result.splice(Math.min(Math.max(toIndex, 0), result.length), 0, moved);
  return result;
}

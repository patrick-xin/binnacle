/** The items whose `text(item)` holds the query's letters in order, whatever their case: the ones that start with it first, then the closest, then in their order. */
export function fuzzy<T>(query: string, items: readonly T[], text: (item: T) => string): T[] {
  const wanted = query.toLowerCase()
  const ranked = items.flatMap((item, index) => {
    const said = text(item).toLowerCase()
    const span = spanOf(wanted, said)
    return span === undefined ? [] : [{ item, index, starts: said.startsWith(wanted), span }]
  })
  ranked.sort((a, b) => Number(b.starts) - Number(a.starts) || a.span - b.span || a.index - b.index)
  return ranked.map(({ item }) => item)
}

/** The fewest characters that an alignment of the query's letters in the text covers; none when the text does not hold them in order. */
function spanOf(query: string, text: string): number | undefined {
  const [first, ...rest] = [...query]
  if (first === undefined) return 0
  let least: number | undefined
  for (let start = text.indexOf(first); start !== -1; start = text.indexOf(first, start + 1)) {
    let end = start + first.length
    for (const letter of rest) {
      const at = text.indexOf(letter, end)
      // A later start has fewer characters after it, so it cannot hold the letters either.
      if (at === -1) return least
      end = at + letter.length
    }
    least = Math.min(least ?? Infinity, end - start)
  }
  return least
}

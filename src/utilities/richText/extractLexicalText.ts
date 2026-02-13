const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

export const extractLexicalText = (value: unknown): string => {
  const parts: string[] = []

  const visit = (node: unknown): void => {
    if (!isRecord(node)) return

    const textValue = node.text

    if (typeof textValue === 'string') {
      const normalized = textValue.replace(/\s+/g, ' ').trim()

      if (normalized) {
        parts.push(normalized)
      }
    }

    const children = node.children

    if (Array.isArray(children)) {
      for (const child of children) {
        visit(child)
      }
    }
  }

  visit(value)

  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

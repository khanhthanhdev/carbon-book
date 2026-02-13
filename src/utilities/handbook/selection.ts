import type { HandbookQaView, HandbookSectionView, HandbookSelection } from './types'

const getFirstSectionWithQa = (sections: HandbookSectionView[]): HandbookSectionView | null => {
  for (const section of sections) {
    if (section.qas.length > 0) return section
  }

  return null
}

const getQaById = (
  sections: HandbookSectionView[],
  qaId: number,
): { section: HandbookSectionView; qa: HandbookQaView } | null => {
  for (const section of sections) {
    const qa = section.qas.find((item) => item.id === qaId)
    if (qa) {
      return {
        section,
        qa,
      }
    }
  }

  return null
}

export const resolveHandbookSelection = ({
  sections,
  selectedQaId,
  selectedSectionId,
}: {
  sections: HandbookSectionView[]
  selectedQaId: number | null
  selectedSectionId: number | null
}): HandbookSelection => {
  if (sections.length === 0) {
    return {
      sectionId: null,
      qaId: null,
    }
  }

  if (selectedQaId) {
    const selectedQa = getQaById(sections, selectedQaId)
    if (selectedQa) {
      return {
        sectionId: selectedQa.section.id,
        qaId: selectedQa.qa.id,
      }
    }
  }

  if (selectedSectionId) {
    const selectedSection = sections.find((section) => section.id === selectedSectionId)
    if (selectedSection) {
      const firstQa = selectedSection.qas[0]
      return {
        sectionId: selectedSection.id,
        qaId: firstQa?.id ?? null,
      }
    }
  }

  const firstSectionWithQa = getFirstSectionWithQa(sections)
  if (firstSectionWithQa) {
    return {
      sectionId: firstSectionWithQa.id,
      qaId: firstSectionWithQa.qas[0]?.id ?? null,
    }
  }

  return {
    sectionId: sections[0]?.id ?? null,
    qaId: null,
  }
}

import React from 'react'
import { Presentation } from '@components'
import { SlideHeadlineMetrics } from '@slides/AvacyMonthly/SlideHeadlineMetrics'
import { SlideNewAccounts } from '@slides/AvacyMonthly/SlideNewAccounts'
import { SlideCollaborations } from '@slides/AvacyMonthly/SlideCollaborations'

export default function AvacyMonthly() {
  return (
    <Presentation>
      <SlideHeadlineMetrics />
      <SlideNewAccounts />
      <SlideCollaborations />
    </Presentation>
  )
}


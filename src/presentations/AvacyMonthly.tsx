import React from 'react'
import { Presentation } from '@components'
import { SlideHeadlineMetrics } from '@slides/AvacyMonthly/SlideHeadlineMetrics'
import { SlideNewAccounts } from '@slides/AvacyMonthly/SlideNewAccounts'
import { SlideCollaborations } from '@slides/AvacyMonthly/SlideCollaborations'
import { SlideUserFunnel } from '@slides/AvacyMonthly/SlideUserFunnel'
import { SlideEconomics } from '@slides/AvacyMonthly/SlideEconomics'

export default function AvacyMonthly() {
  return (
    <Presentation>
      <SlideHeadlineMetrics />
      <SlideNewAccounts />
      <SlideEconomics />
      <SlideUserFunnel />
      <SlideCollaborations />
    </Presentation>
  )
}


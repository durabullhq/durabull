import { AlternativesPage } from '@docs/components/compare/alternatives-page'
import { ArticlePage } from '@docs/components/compare/article-page'
import { ArticleVisual } from '@docs/components/compare/article-visual'
import { CompareTable, CostTable } from '@docs/components/compare/compare-table'
import { CostCalculator } from '@docs/components/compare/cost-calculator'
import { ComparisonDirectory } from '@docs/components/compare/directory'
import {
  ArchitectureDiagram,
  ArticleArt,
  DecisionSummary,
  EditorialHero,
  GuideSteps,
  ResearchNote,
} from '@docs/components/compare/editorial'
import { CompareFaqList } from '@docs/components/compare/faq-list'
import { GuideCard } from '@docs/components/compare/guide-card'
import { CompareHubPage } from '@docs/components/compare/hub-page'
import { JsonLd } from '@docs/components/compare/json-ld'
import {
  CompareCta,
  McpBand,
  RelatedLinks,
  SectionIntro,
  SourceList,
} from '@docs/components/compare/prose-blocks'
import { VsPage } from '@docs/components/compare/vs-page'
import { articles } from '@docs/lib/compare/articles'
import { categoryOrder, competitors, getCompetitor } from '@docs/lib/compare/catalog'
import type { Meta, StoryObj } from '@storybook/react-vite'
import '@docs/styles/v2.css'
import '@docs/styles/editorial.css'

// The async route wrappers resolve params; these stories exercise their rendered templates:
// docs/app/compare/page, docs/app/compare/[slug]/page,
// docs/app/alternatives/[slug]/page, docs/app/blog/[slug]/page.
const bullBoard = getCompetitor('bull-board')!
const inngest = getCompetitor('inngest')!
const trigger = getCompetitor('trigger-dev')!
const meta = { title: 'Marketing/Editorial', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta
type Story = StoryObj<typeof meta>
export const ComparisonHub: Story = { render: () => <CompareHubPage /> }
export const DashboardComparison: Story = { render: () => <VsPage competitor={bullBoard} /> }
export const RuntimeComparison: Story = { render: () => <VsPage competitor={inngest} /> }
export const Alternatives: Story = { render: () => <AlternativesPage competitor={inngest} /> }
export const ProductionGuide: Story = { render: () => <ArticlePage article={articles[0]} /> }
export const CostGuide: Story = {
  render: () => (
    <ArticlePage article={articles.find((a) => a.slug === 'trigger-dev-vs-bullmq-cost')!} />
  ),
}
export const MobileComparison: Story = {
  render: () => <VsPage competitor={bullBoard} />,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
}
export const EditorialComponents: Story = {
  render: () => (
    <div className="v2">
      <EditorialHero
        eyebrow="Editorial components"
        title="Evidence, made readable."
        description="Shared comparison and guide components."
        visual={<ArchitectureDiagram />}
      />
      <div className="editorial-shell space-y-12 py-10">
        <ResearchNote />
        <DecisionSummary
          name="Bull Board"
          theirs={bullBoard.whenToChooseThem}
          ours={bullBoard.whenToChooseDurabull}
        />
        <SectionIntro title="Tables" />
        <CompareTable competitorName="Bull Board" rows={bullBoard.rows} />
        {trigger.costs ? <CostTable {...trigger.costs} /> : null}
        <ComparisonDirectory items={competitors.slice(0, 3)} categories={categoryOrder} />
        <div className="guide-grid">
          <GuideCard article={articles[0]} />
          <ArticleArt />
          <ArticleVisual slug={articles[0].slug} />
        </div>
        <GuideSteps
          title="Evaluate"
          steps={[{ title: 'Connect', detail: 'Validate against staging.' }]}
          caption="An example workflow."
        />
        <CostCalculator mode="trigger" />
        <CostCalculator mode="inngest" />
        <CompareFaqList faqs={bullBoard.faqs} />
        <McpBand />
        <RelatedLinks items={[bullBoard, inngest]} />
        <SourceList sources={bullBoard.sources} />
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            name: 'Editorial components',
          }}
        />
      </div>
      <CompareCta />
    </div>
  ),
}

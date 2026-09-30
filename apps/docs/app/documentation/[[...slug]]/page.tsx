import mdxComponents from 'fumadocs-ui/mdx'
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/page'
import type { MDXComponents } from 'mdx/types'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { ComponentType } from 'react'
import { source } from '../../../source'

interface DocumentationPageProps {
  params: Promise<{
    slug?: string[]
  }>
}

interface RenderableDocPage {
  url: string
  data: {
    title: string
    description?: string
    toc?: Array<{ title: string; url: string; depth: number }>
    full?: boolean
    body: ComponentType<{ components?: MDXComponents }>
  }
}

export default async function DocumentationPage({ params }: DocumentationPageProps) {
  const { slug } = await params
  const page = source.getPage(slug) as RenderableDocPage | undefined

  if (!page) {
    notFound()
  }

  const MDX = page.data.body

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX components={mdxComponents} />
      </DocsBody>
    </DocsPage>
  )
}

export function generateStaticParams() {
  return source.generateParams()
}

export async function generateMetadata({ params }: DocumentationPageProps): Promise<Metadata> {
  const { slug } = await params
  const page = source.getPage(slug) as RenderableDocPage | undefined

  if (!page) {
    return {}
  }

  return {
    title: `${page.data.title} | Durabull Documentation`,
    description: page.data.description,
    alternates: {
      canonical: page.url,
    },
  }
}

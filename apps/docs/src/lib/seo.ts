/**
 * SEO utilities for Next.js metadata
 * Provides helpers for meta tags, Open Graph, Twitter Cards, and JSON-LD structured data
 */

import type { Metadata } from 'next'
import { GITHUB_RELEASE_URL, MAC_DOWNLOAD_URL, SITE_URL } from '@/lib/config'

const SITE_NAME = 'Durabull'
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`

export interface SEOConfig {
  title: string
  description: string
  /** Override the canonical URL (defaults to SITE_URL + path) */
  canonical?: string
  /** Override the OG image URL */
  ogImage?: string
  /** OG type - defaults to 'website' */
  ogType?: 'website' | 'article'
  /** Don't index this page */
  noIndex?: boolean
  /** Additional keywords for meta tag */
  keywords?: string[]
}

/**
 * Generate Next.js Metadata for a page
 */
export function createMetadata(config: SEOConfig, path: string): Metadata {
  const {
    title,
    description,
    canonical = `${SITE_URL}${path}`,
    ogImage = DEFAULT_OG_IMAGE,
    ogType = 'website',
    noIndex = false,
    keywords = [],
  } = config

  const fullTitle = path === '/' ? title : `${title} | ${SITE_NAME}`

  return {
    title: fullTitle,
    description,
    keywords: keywords.length > 0 ? keywords : undefined,
    robots: noIndex ? 'noindex, nofollow' : undefined,
    alternates: {
      canonical,
    },
    openGraph: {
      title: fullTitle,
      description,
      url: canonical,
      siteName: SITE_NAME,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: fullTitle,
        },
      ],
      type: ogType,
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
      images: [ogImage],
    },
  }
}

/**
 * Generate JSON-LD structured data for a SoftwareApplication
 */
export function createSoftwareApplicationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Durabull',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: ['Web', 'macOS', 'Windows'],
    description:
      'The modern BullMQ dashboard for browser, Apple Silicon macOS, Windows, and self-hosted environments. Monitor jobs, debug failures, and scale background processing with confidence.',
    url: SITE_URL,
    downloadUrl: MAC_DOWNLOAD_URL,
    installUrl: GITHUB_RELEASE_URL,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      description: 'Free during beta',
    },
  }
}

/**
 * Generate JSON-LD structured data for an Organization
 */
export function createOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Durabull',
    url: SITE_URL,
    logo: `${SITE_URL}/favicon-512x512.png`,
    description:
      'Modern BullMQ dashboard for monitoring jobs, debugging failures, and scaling background processing.',
    sameAs: [],
  }
}

/**
 * Generate JSON-LD structured data for a WebSite (enables sitelinks search box)
 */
export function createWebSiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Durabull',
    url: SITE_URL,
    description:
      'The modern, powerful dashboard for BullMQ. Monitor jobs, debug failures, and scale your background processing with confidence.',
  }
}

/**
 * Generate JSON-LD structured data for a FAQ page
 */
export function createFAQSchema(faqs: Array<{ question: string; answer: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  }
}

/**
 * Generate JSON-LD structured data for a Product (pricing page)
 */
export function createProductSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'Durabull',
    description:
      'Modern BullMQ dashboard for monitoring jobs, debugging failures, and scaling background processing.',
    brand: {
      '@type': 'Brand',
      name: 'Durabull',
    },
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
      description: 'Free during beta period',
    },
  }
}

/**
 * Generate JSON-LD structured data for a BreadcrumbList
 */
export function createBreadcrumbSchema(items: Array<{ name: string; url: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url.startsWith('http') ? item.url : `${SITE_URL}${item.url}`,
    })),
  }
}

import './globals.css'

export const metadata = {
  metadataBase: new URL('https://fluxchat.panarwala.in'),
  title: {
    default: 'FluxChat by Panarwala — Real-Time Offline-First Messaging App',
    template: '%s | FluxChat by Panarwala',
  },
  description:
    'FluxChat by Panarwala is a high-performance, real-time, offline-first web chat application with instant room messaging, direct messaging, secure channels, and local message syncing.',
  keywords: [
    'FluxChat',
    'Panarwala',
    'FluxChat by Panarwala',
    'real-time chat',
    'offline-first chat app',
    'socket.io chat',
    'secure messaging app',
    'room chat',
    'instant messaging',
  ],
  authors: [{ name: 'Panarwala', url: 'https://fluxchat.panarwala.in' }],
  creator: 'Panarwala',
  publisher: 'Panarwala',
  applicationName: 'FluxChat by Panarwala',
  alternates: {
    canonical: 'https://fluxchat.panarwala.in',
  },
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
    apple: '/icon.svg',
  },
  openGraph: {
    title: 'FluxChat by Panarwala — Real-Time Offline-First Messaging App',
    description:
      'Experience seamless, low-latency, real-time messaging with offline support and secure room collaboration built by Panarwala.',
    url: 'https://fluxchat.panarwala.in',
    siteName: 'FluxChat by Panarwala',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 675,
        alt: 'FluxChat by Panarwala',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FluxChat by Panarwala — Real-Time Messaging App',
    description: 'Real-time, offline-first chat platform built by Panarwala.',
    images: ['/og-image.jpg'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  category: 'technology',
}

export const viewport = {
  themeColor: '#0a0c14',
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'FluxChat',
  alternateName: 'FluxChat by Panarwala',
  url: 'https://fluxchat.panarwala.in',
  description:
    'FluxChat by Panarwala is a high-performance, real-time, offline-first web chat application featuring instant room messaging and direct messaging.',
  applicationCategory: 'CommunicationApplication',
  operatingSystem: 'All',
  author: {
    '@type': 'Organization',
    name: 'Panarwala',
    url: 'https://fluxchat.panarwala.in',
  },
  publisher: {
    '@type': 'Organization',
    name: 'Panarwala',
    url: 'https://fluxchat.panarwala.in',
  },
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>{children}</body>
    </html>
  )
}


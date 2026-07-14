import './globals.css'

export const metadata = {
  title: 'FluxChat — Real-time Offline-first Chat',
  description: 'A production-ready real-time chat app with offline support',
  icons: {
    icon: '/icon.svg',
  },
}

export const viewport = {
  themeColor: '#0a0c14',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

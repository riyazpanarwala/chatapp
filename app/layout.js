import './globals.css'

export const metadata = {
  title: 'FluxChat — Real-time Offline-first Chat',
  description: 'A production-ready real-time chat app with offline support',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

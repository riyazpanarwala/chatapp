export default function manifest() {
  return {
    name: 'FluxChat by Panarwala',
    short_name: 'FluxChat',
    description: 'A production-ready real-time chat application with offline-first support by Panarwala.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0c14',
    theme_color: '#0a0c14',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  };
}

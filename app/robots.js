export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/'],
      },
    ],
    sitemap: 'https://fluxchat.panarwala.in/sitemap.xml',
    host: 'https://fluxchat.panarwala.in',
  };
}

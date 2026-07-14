/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow the custom server to handle requests
  async headers() {
    return [
      {
        source: '/uploads/:path*',
        headers: [
          { key: 'Content-Disposition', value: 'attachment' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Content-Security-Policy', value: "sandbox; default-src 'none'; img-src 'self' data: blob:; media-src 'self' blob:" },
        ],
      },
    ];
  },
};
export default nextConfig;

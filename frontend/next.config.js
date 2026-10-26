/** @type {import('next').NextConfig} */
const nextConfig = {
  // Render serves the browser-only dashboard as a free static site.
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
}

module.exports = nextConfig

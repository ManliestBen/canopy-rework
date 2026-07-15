/**
 * Built-in starter images (inline SVG gradients) so the slideshow works
 * before Cloudinary is configured — per the feature list's "starter set".
 */
function gradient(id: string, stops: [string, string], caption: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${stops[0]}"/><stop offset="1" stop-color="${stops[1]}"/>
  </linearGradient></defs>
  <rect width="1920" height="1080" fill="url(#g)"/>
  <text x="960" y="580" font-family="Georgia, serif" font-size="120" fill="rgba(255,255,255,0.85)" text-anchor="middle">${caption}</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const STARTER_PHOTOS = [
  { id: 'starter-dawn', url: gradient('dawn', ['#f6d3b5', '#c98da4'], '🌄') },
  { id: 'starter-forest', url: gradient('forest', ['#9fc7a5', '#3f7350'], '🌲') },
  { id: 'starter-lake', url: gradient('lake', ['#a9d3e0', '#4a7f9b'], '🛶') },
  { id: 'starter-night', url: gradient('night', ['#40456e', '#181c33'], '✨') },
];

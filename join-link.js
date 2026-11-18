export function joinLink(publicUrl, code) {
  if (!publicUrl?.trim()) return null;
  const url = new URL(publicUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('PUBLIC_URL must be an HTTP or HTTPS URL without credentials.');
  }
  url.pathname = '/play';
  url.search = '';
  url.hash = '';
  url.searchParams.set('code', code);
  return url.href;
}

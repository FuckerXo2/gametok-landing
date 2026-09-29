// Cloudflare Pages middleware to redirect www and *.pages.dev to gametok.co
export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.hostname === 'www.gametok.co' || url.hostname.endsWith('.pages.dev')) {
    url.hostname = 'gametok.co';
    return Response.redirect(url.toString(), 301);
  }
  return context.next();
}

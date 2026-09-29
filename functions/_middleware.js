// Cloudflare Pages middleware to redirect www.gametok.co to gametok.co
export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.hostname === 'www.gametok.co') {
    url.hostname = 'gametok.co';
    return Response.redirect(url.toString(), 301);
  }
  return context.next();
}

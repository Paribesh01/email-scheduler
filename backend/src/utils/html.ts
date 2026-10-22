// the compose editor sends HTML; plain text is still accepted from the API
export const looksLikeHtml = (s: string) => /<\/?[a-z][\s\S]*>/i.test(s);

export function htmlToText(html: string) {
  return html
    .replace(/<(br|\/p|\/div|\/li|\/blockquote|\/h\d)[^>]*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

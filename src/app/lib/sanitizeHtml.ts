import sanitize from 'sanitize-html';

/** Rich text from the notice editor: basic formatting and https links only. Everything else is dropped. */
export const sanitizeRichText = (html: string): string =>
  sanitize(html, {
    allowedTags: ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'a', 'h3', 'blockquote'],
    allowedAttributes: { a: ['href', 'target', 'rel'] },
    allowedSchemes: ['https', 'http', 'mailto', 'tel'],
    transformTags: { a: sanitize.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }) },
  }).trim();

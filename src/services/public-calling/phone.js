// Copyright (c) 2026 Streetlives, Inc. MIT license; see LICENSE.
const { URL } = require('url');
const { parseDocument } = require('htmlparser2');

const decodeHtml = value =>
  value
    .replace(/&(?:amp|#38|#x26);/gi, '&')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'");

function parseNumber(value) {
  if (typeof value !== 'string' || value.length > 180) return null;
  const text = value
    .normalize('NFKC')
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .trim();
  const pattern = /^(\+?[\d().\s-]+?)(?:\s*(?:;ext=|ext\.?|extension|x|[,;#])\s*(\d{1,12}))?$/i;
  const match = pattern.exec(text);
  if (!match) return null;
  let digits = match[1].replace(/\D/g, '');
  if (text.startsWith('+') && !(digits.length === 11 && digits.startsWith('1'))) return null;
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return null;
  return { number: `+1${digits}`, extension: match[2] || '' };
}

function parseHref(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const decoded = decodeHtml(value.trim());
    if (/^tel:/i.test(decoded)) return parseNumber(decodeURIComponent(decoded.slice(4)));
    const url = new URL(decoded);
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'voice.google.com' ||
      url.username ||
      url.password ||
      url.port ||
      url.searchParams.get('a') !== 'nc'
    ) { return null; }
    return parseNumber(url.searchParams.get('n'));
  } catch (_) {
    return null;
  }
}

// Only supported hyperlinks qualify; plain-text numbers and SIP URIs do not.
function linkedNumbers(html) {
  if (typeof html !== 'string') return [];
  const numbers = [];
  // Match the HTML rendered by YourPeer. Comments, scripts, data-href attributes
  // and Markdown-looking plain text must not become telephone authorization.
  const pending = [...parseDocument(html).children];
  while (pending.length) {
    const node = pending.pop();
    const hidden = ['script', 'style', 'template', 'noscript'].includes(node.name) ||
      (node.attribs && Object.prototype.hasOwnProperty.call(node.attribs, 'hidden'));
    if (!hidden) {
      if (node.name === 'a' && node.attribs && node.attribs.href) {
        const phone = parseHref(node.attribs.href);
        if (phone) numbers.push(phone);
      }
      if (node.children) pending.push(...node.children);
    }
  }
  return numbers;
}

module.exports = { parseNumber, parseHref, linkedNumbers };

import { h } from 'vue';

function inlineNodes(text) {
  const pattern = /(\*\*([^*]+)\*\*|`([^`]+)`)/g;
  const nodes = [];
  let cursor = 0;

  for (const match of text.matchAll(pattern)) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    nodes.push(h(match[2] ? 'strong' : 'code', match[2] || match[3]));
    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

// Model text becomes Vue text nodes. HTML and links are deliberately not interpreted.
export function markdownNodes(content) {
  const lines = String(content || '')
    .replace(/\r\n/g, '\n')
    .split('\n');
  const blocks = [];
  let paragraph = [];
  let codeLines = null;
  let list = null;

  function flushParagraph() {
    if (!paragraph.length) return;
    blocks.push(h('p', inlineNodes(paragraph.join('\n'))));
    paragraph = [];
  }

  function flushList() {
    if (!list) return;
    blocks.push(h(list.tag, list.items));
    list = null;
  }

  function appendCodeBlock() {
    blocks.push(h('pre', [h('code', codeLines.join('\n'))]));
    codeLines = null;
  }

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      flushParagraph();
      flushList();
      if (codeLines === null) codeLines = [];
      else appendCodeBlock();
      continue;
    }

    if (codeLines !== null) {
      codeLines.push(line);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    const bullet = /^(?:\s*[-*+]\s+|\s*\d+[.)、]\s*)(.+)$/.exec(line);

    if (heading) {
      flushParagraph();
      flushList();
      blocks.push(h(heading[1].length <= 2 ? 'h2' : 'h3', inlineNodes(heading[2])));
    } else if (bullet) {
      flushParagraph();
      const tag = /^\s*\d/.test(line) ? 'ol' : 'ul';
      if (list?.tag !== tag) {
        flushList();
        list = { tag, items: [] };
      }

      const props = {};
      if (tag === 'ol') {
        const number = Number(/^\s*(\d+)/.exec(line)[1]);
        if (Number.isSafeInteger(number) && number <= 2147483647) props.value = number;
      }
      list.items.push(h('li', props, inlineNodes(bullet[1])));
    } else if (/^>\s?/.test(line)) {
      flushParagraph();
      flushList();
      blocks.push(h('blockquote', inlineNodes(line.replace(/^>\s?/, ''))));
    } else {
      flushList();
      paragraph.push(line);
    }
  }

  flushParagraph();
  flushList();
  if (codeLines !== null) appendCodeBlock();
  return blocks;
}

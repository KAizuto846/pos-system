const ts = require('typescript');
const fs = require('fs');
const path = require('path');

const SRC = 'src';
const KNOWN_DIV = new Set(['Badge', 'Card', 'CardContent', 'CardHeader', 'CardFooter', 'CardTitle', 'CardDescription', 'Skeleton', 'Separator', 'VersionBadge', 'SyncStatusBadge', 'Progress', 'DialogContent', 'DialogHeader', 'DialogFooter', 'DeliveryNoticeBanner']);
const KNOWN_BUTTON = new Set(['Button', 'SelectTrigger', 'DialogTrigger', 'DialogClose']);
const KNOWN_INPUT = new Set(['Input', 'Select', 'Textarea']);
const KNOWN_LABEL = new Set(['Label']);
const KNOWN_IMG = new Set(['Image']);
const BLOCK = new Set(['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'form', 'section', 'article', 'aside', 'header', 'footer', 'nav', 'figure', 'fieldset', 'blockquote', 'pre', 'video', 'main', 'details', 'hr', 'dl']);

function tagOf(name) {
  if (/^[a-z]/.test(name)) return name;
  if (KNOWN_DIV.has(name)) return 'div';
  if (KNOWN_BUTTON.has(name)) return 'button';
  if (KNOWN_INPUT.has(name)) return 'input';
  if (KNOWN_LABEL.has(name)) return 'label';
  if (KNOWN_IMG.has(name)) return 'img';
  return null; // unknown component
}

const PHASING = new Set(['span', 'a', 'label', 'button', 'b', 'i', 'em', 'strong', 'code', 'q', 'small', 'sub', 'sup', 'time', 'kbd', 'samp', 'var', 'abbr', 'cite', 'mark']);

function walk(ts) {
  const files = [];
  function collect(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) collect(p);
      else if (p.endsWith('.tsx') && !p.includes('__scan_test')) files.push(p);
    }
  }
  collect(SRC);

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const stack = []; // {tag, name, pos}

    function emit(node, msg) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      console.log(`${file}:${line + 1}: ${msg}`);
    }

    function checkChild(opener, childTag, childNode) {
      if (!childTag) return;
      const parentTag = opener.tag;
      const parentEl = parentTag === 'div' || parentTag === 'button' || parentTag === 'input' || parentTag === 'label' || parentTag === 'img';
      if (!parentEl && parentTag === 'p') {
        if (BLOCK.has(childTag)) {
          emit(childNode, `> <${childTag}/> dentro de <p> (${opener.name})`);
        }
      } else if (parentTag === 'span') {
        if (BLOCK.has(childTag) && childTag !== 'li') {
          emit(childNode, `> <${childTag}/> dentro de <span> (${opener.name})`);
        }
      } else if (parentTag === 'button' && childTag === 'div') {
        emit(childNode, `> <div/> dentro de <button> (${opener.name})`);
      }
    }

    function visit(node) {
      if (!node) return;
      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
        const name = ts.isJsxSelfClosingElement(node)
          ? node.tagName.getText(sf)
          : node.openingElement.tagName.getText(sf);
        const childTag = tagOf(name);
        const opener = stack[stack.length - 1];
        if (opener) checkChild(opener, childTag, node);
        if (ts.isJsxElement(node)) {
          stack.push({ tag: childTag, name });
          ts.forEachChild(node, visit);
          stack.pop();
        }
      } else {
        ts.forEachChild(node, visit);
      }
    }
    ts.forEachChild(sf, visit);
  }
}

walk(ts);
console.log('--- scan done ---');
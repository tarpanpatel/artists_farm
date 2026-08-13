const fs = require('fs');
const path = require('path');

const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.tsx')) files.push(full);
  }
}
walk(path.join('src', 'components'));

const updates = [];

files.forEach((filepath) => {
  const filename = path.basename(filepath);
  const componentName = filename.replace(/\.tsx$/, '').replace(/\.ts$/, '');
  const bemClass = componentName
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[-\s]+/g, '-')
    .toLowerCase();

  let content = fs.readFileSync(filepath, 'utf8');
  const original = content;

  if (!/<Input[\s>]/.test(content)) return;

  // Case 1: <Input ... className="..." ... /> or <Input ... className="..." ... >
  content = content.replace(
    /<Input\s+([^>]*?)className=("(?:[^"\\]|\\.)*?"|'(?:[^'\\]|\\.)*?')([^>]*?)(\/?>)/g,
    (match, before, existingClass, after, close) => {
      const trimmed = existingClass.trim().slice(1, -1);
      const newClass = `${trimmed} ${bemClass}__input`;
      return `<Input ${before}className="${newClass}"${after}${close}`;
    }
  );

  // Case 2: <Input ... /> without className
  content = content.replace(
    /<Input\s+([^>]*?)(\/>)/g,
    (match, attrs, close) => {
      if (match.includes('className=')) return match;
      return `<Input ${attrs}className="${bemClass}__input"${close}`;
    }
  );

  if (content !== original) {
    fs.writeFileSync(filepath, content);
    updates.push(filename);
  }
});

console.log('Updated ' + updates.length + ' files');
updates.forEach((f) => console.log('  ' + f));

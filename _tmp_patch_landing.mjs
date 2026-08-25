// One-off patch: replaces every <i data-lucide="NAME" class="X"></i> in
// home.html/index3.html with an inline <svg class="X" ...>...</svg> using the
// Flowbite-equivalent markup extracted by _tmp_extract_icons.tsx, then strips
// the now-unused unpkg.com/lucide@latest <script> tag and lucide.createIcons()
// init block. Run once, then discarded along with the other _tmp_* files.
import fs from 'fs';

const icons = JSON.parse(fs.readFileSync('./_tmp_icon_svgs.json', 'utf8'));
const files = ['home.html', 'index3.html'];

for (const file of files) {
  let html = fs.readFileSync(file, 'utf8');
  let replaced = 0;

  html = html.replace(
    /<i data-lucide="([a-z0-9-]+)" class="([^"]*)"><\/i>/g,
    (full, name, classes) => {
      const entry = icons[name];
      if (!entry) {
        console.error(`  ! no extracted markup for "${name}" in ${file} - left as-is`);
        return full;
      }
      replaced++;
      // Splice the original class="..." into the extracted <svg ...> tag
      // (matches what lucide.createIcons() itself used to do at runtime -
      // copy the <i>'s class onto the generated <svg>).
      return entry.markup.replace('<svg ', `<svg class="${classes}" `);
    }
  );

  const beforeLen = html.length;
  html = html.replace(
    /\s*<!-- Lucide Icons -->\s*\n\s*<script src="https:\/\/unpkg\.com\/lucide@latest"><\/script>\n?/,
    '\n'
  );
  html = html.replace(
    /\s*<!-- Initialize Lucide Icons -->\s*\n\s*<script>\s*\n\s*lucide\.createIcons\(\);\s*\n\s*<\/script>\n?/,
    '\n'
  );
  const scriptsStripped = html.length !== beforeLen;

  fs.writeFileSync(file, html);
  console.log(`${file}: replaced ${replaced} icons, stripped lucide script tags: ${scriptsStripped}`);

  const remaining = (html.match(/data-lucide|lucide@latest|lucide\.createIcons/g) || []).length;
  if (remaining > 0) {
    console.error(`  ! ${remaining} lucide reference(s) still remain in ${file} - needs manual check`);
  }
}

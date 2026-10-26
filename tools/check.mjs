#!/usr/bin/env node
// Checks the site before and after publishing. Node 20.11 or later (import.meta.dirname), built-ins only.
//
//   node tools/check.mjs                 every page well formed, every internal link and #anchor resolves, nothing
//                                        loads from anywhere else (no scripts, fonts or trackers), and no {{PLACEHOLDER}}
//                                        or review marker remains anywhere: the site must not be published while one does
//   node tools/check.mjs --site https://collagedeck.github.io
//                                        after deploying: each page loads over HTTPS with 200 directly, http://
//                                        redirects to https://, and an unknown path gets the 404 page
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const site = args.includes('--site') ? args[args.indexOf('--site') + 1]?.replace(/\/+$/, '') : undefined;
const problems = [];

/** Every file the site publishes: everything but dotfiles, this folder and node_modules. */
function files(directory = root) {
  return readdirSync(directory).flatMap(name => {
    const full = path.join(directory, name);
    if (name.startsWith('.') || name === 'tools' || name === 'node_modules') return [];
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}
/** The file a site path is served from: a folder serves its index.html. */
function served(sitePath) {
  const local = path.join(root, decodeURIComponent(sitePath));
  if (existsSync(local) && statSync(local).isFile()) return local;
  const index = path.join(local, 'index.html');
  return existsSync(index) ? index : undefined;
}
const idsOf = html => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]));
const urlPath = file => '/' + path.relative(root, file).split(path.sep).join('/').replace(/(^|\/)index\.html$/, '$1');

const published = files();
const all = published.filter(file => file.endsWith('.html'));

// Placeholders ({{SUPPORT_EMAIL}} and the like) and review markers block publishing, wherever they are.
for (const file of published) {
  const name = path.relative(root, file);
  readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
    const tokens = line.match(/\{\{[^}\n]*\}\}/g) ?? (line.includes('{{') ? ['{{'] : []);
    for (const token of tokens) problems.push(`${name}:${index + 1} still has the placeholder ${token}; fill it in before publishing`);
    if (/\[OWNER|LEGAL REVIEW|class="owner"|class="draft"/.test(line)) problems.push(`${name}:${index + 1} still has a review marker`);
  });
}

for (const file of all) {
  const html = readFileSync(file, 'utf8'), name = path.relative(root, file);
  for (const [pattern, what] of [[/^<!doctype html>/i, 'a doctype'], [/<html lang="[a-z-]+">/i, 'a language'], [/<meta charset="utf-8">/i, 'a charset'],
    [/<meta name="viewport" content="width=device-width, initial-scale=1">/, 'the mobile viewport'], [/<title>[^<]+<\/title>/, 'a title']])
    if (!pattern.test(html)) problems.push(`${name} has no ${what}`);
  if (/<script\b/i.test(html)) problems.push(`${name} has a script: the site runs none`);
  for (const [, tag] of html.matchAll(/<(link|img|iframe|source|video|audio|embed|object)\b([^>]*)>/gi)) {
    const ref = /(?:href|src)="([^"]+)"/.exec(tag)?.[1];
    if (ref && /^(https?:)?\/\//i.test(ref)) problems.push(`${name} loads ${ref} from elsewhere`);
  }
  for (const [, href] of html.matchAll(/\shref="([^"]+)"/g)) {
    if (/^(https?:|mailto:)/i.test(href)) continue;
    const [target, anchor] = href.split('#');
    const resolved = target ? (target.startsWith('/') ? target : path.posix.join(urlPath(file).replace(/[^/]*$/, ''), target)) : urlPath(file);
    const destination = served(resolved);
    if (!destination) { problems.push(`${name} links to ${href}, which doesn't exist`); continue; }
    if (anchor && !idsOf(readFileSync(destination, 'utf8')).has(anchor)) problems.push(`${name} links to ${href}, but that page has no #${anchor}`);
  }
}

if (site) {
  const paths = all.filter(file => !file.endsWith('404.html')).map(urlPath);
  for (const sitePath of paths) {
    const url = `${site}${sitePath}`;
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.status !== 200) problems.push(`${url} answered ${response.status}, not 200`);
      else if (!/<title>/.test(await response.text())) problems.push(`${url} isn't one of the site's pages`);
    } catch (error) { problems.push(`${url} failed: ${error.message}`); }
  }
  try {
    const plain = await fetch(site.replace(/^https:/, 'http:') + '/privacy/', { redirect: 'manual' });
    if (![301, 302, 307, 308].includes(plain.status) || !plain.headers.get('location')?.startsWith('https://')) problems.push(`http:// is not redirected to https:// (answered ${plain.status}); turn on Enforce HTTPS`);
  } catch (error) { problems.push(`http:// check failed: ${error.message}`); }
  try {
    const missing = await fetch(`${site}/this-page-does-not-exist/`);
    if (missing.status !== 404 || !/Page not found/.test(await missing.text())) problems.push(`an unknown path answered ${missing.status} without the 404 page`);
  } catch (error) { problems.push(`404 check failed: ${error.message}`); }
}

if (problems.length) { console.error(['Site check failed:', ...problems.map(problem => `  - ${problem}`)].join('\n')); process.exit(1); }
console.log(`Site check passed: ${all.length} pages, no placeholders${site ? `, live at ${site}` : ''}.`);

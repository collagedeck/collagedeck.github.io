# collagedeck.github.io

The website for CollageDeck, a photo and video collage app for iPhone: its Privacy Policy, Terms of Use and Support
page. Plain HTML and one stylesheet, with no build step, no scripts, no cookies and no analytics. GitHub Pages serves
it as it is from the `main` branch.

| Path | Page |
|---|---|
| `/` | Home: links to the pages below |
| `/privacy/` | Privacy Policy |
| `/terms/` | Terms of Use |
| `/support/` | Support and FAQ |
| `404.html` | Shown for any unknown path |

Each page is a folder's `index.html`, so `/privacy/` loads with or without the trailing slash. `.nojekyll` tells
GitHub Pages to publish the files without running Jekyll.

## Checks

The check needs Node 20.11 or later.

```sh
node tools/check.mjs                                        # pages well formed, links and anchors resolve, nothing
                                                            # loaded from elsewhere, no placeholder left to fill in
node tools/check.mjs --site https://collagedeck.github.io   # after deploying: pages load over HTTPS, http:// redirects,
                                                            # an unknown path gets the 404 page
python3 -m http.server 8000                                 # preview at http://localhost:8000
```

Publish only when `node tools/check.mjs` passes.

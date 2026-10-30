# mikeslanger.com

Source for the personal site of Michael Steven Langer, a sales professional who builds software, AI tools, and workflows. It is plain HTML, CSS, and JavaScript. There is no framework, no build step, and no package manager.

Live site: https://mikeslanger.com/

## Pages

| URL | File | What it is |
| --- | --- | --- |
| `/` | `index.html` | Introduction with the decorative hero globe, featured work, a short about section, and the contact section |
| `/work/` | `work/index.html` | Selected projects: what each is for, my part, and where to see it |
| `/about/` | `about/index.html` | Background and the interactive travel map |
| `/education/` | `education/index.html` | Introduction for educators and a link to the survey |
| `/education/share/` | `education/share/index.html` | Educator survey, embedded from Tally |
| 404 | `404.html` | Page not found, served by GitHub Pages for unknown URLs |

Contact details live in the `#contact` section on the home page. Other pages link to `/#contact`. A notes page is not included until there is real content for it.

## Folder structure

```
index.html
work/index.html
about/index.html
education/index.html
education/share/index.html
404.html
robots.txt
sitemap.xml
CNAME
assets/
  css/
    site.css            shared styles: tokens, fonts, header, footer, cards, contact
    home.css            home page hero
    about.css           travel map and place list
    education.css       education landing page and survey layout
  js/
    site.js             shared behavior: header state, fade in, email, cursor trail, old link redirects
    hero-globe.js       decorative hero globe (home)
    travel-map.js       interactive travel map (about)
    vendor/
      three.min.js      Three.js r134, unmodified, with its license
      three.LICENSE.txt
  data/
    world.geojson       country outlines used by both globes, with its license
    world.geojson.LICENSE.txt
  fonts/                Bebas Neue and Inter (latin subset, woff2), with their licenses
  images/               portrait, Prompt Duel poster, social share image, favicon
```

## Run it locally

All paths in the site start with `/`, so serve the repository root. Any static server works:

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080/. Opening the files directly from disk will not work, because the globes load their data with `fetch` and the paths are root relative.

## Editing

- The header, footer, and `<head>` are written out in each page. When you change one, change them all. The current page's nav link carries `aria-current="page"`.
- Places on the travel map are the `<li data-id="..." data-lat="..." data-lng="...">` items in `about/index.html`. Add or remove an item and the globe, the buttons, and the counts follow. Mark a place with `data-label` to show its name on the globe by default. The decorative arcs are listed by id in `routeIds` in `assets/js/travel-map.js`.
- Add a page by creating `name/index.html`, copying the head, header, and footer from an existing page, and adding the URL to `sitemap.xml`.

## Content Security Policy

Each page sets a strict policy in a `<meta>` tag: everything must come from the site's own origin, and inline scripts and inline `style` attributes are not allowed. Keep scripts in `assets/js/` and styles in `assets/css/`. If you ever add an outside resource, add its host to the policy on the pages that need it.

The one exception today is `/education/share/`, which adds `frame-src https://tally.so` so the survey can be embedded. It uses a plain iframe without Tally's script, so nothing from the page address is passed into the form. The survey itself lives in Tally; the page only frames it and links to it.

## Third party code and data

| Item | Version or source | License |
| --- | --- | --- |
| Three.js | r134, from the `three@0.134.0` npm package | MIT, `assets/js/vendor/three.LICENSE.txt` |
| Bebas Neue | `@fontsource/bebas-neue` 5.3.0 | SIL Open Font License 1.1, `assets/fonts/bebas-neue.OFL.txt` |
| Inter | `@fontsource/inter` 5.3.0 | SIL Open Font License 1.1, `assets/fonts/inter.OFL.txt` |
| `world.geojson` | `DATA/world.geojson` from github.com/holtzy/D3-graph-gallery | MIT, `assets/data/world.geojson.LICENSE.txt` |

## Deployment

The site is static files, so GitHub Pages can publish the root of the `main` branch directly. Merging to `main` publishes the change. `CNAME` holds the custom domain, `mikeslanger.com`. There is nothing to build.

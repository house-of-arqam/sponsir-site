# sponsir.app (published site)

Public deploy target for [sponsir.app](https://sponsir.app). Do not edit here.

`docs/` is a generated mirror: the private `house-of-arqam/sponsir-extension`
repo pushes its `site/docs/` into this directory on every merge to `main`
(`.github/workflows/pages.yml` over there, authenticated with a fine-grained
PAT stored as its `SITE_DEPLOY_TOKEN` secret). This repo's own
`.github/workflows/pages.yml` then publishes `docs/` with GitHub Pages and
smoke-tests every page at `https://sponsir.app/`.

Source, checks and history for the pages live in `sponsir-extension/site/`.

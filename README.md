# Magiapix — Studio Hero

A hero section for a digital studio website: a minimalist four-point menu laid out on one CSS grid, over a lavender gradient, with a pinned scroll exit. It started from [Sujenphea/xylophone](https://github.com/Sujenphea/xylophone); the WebGL scene, its sound and its dependencies have since been removed.

## What it does

- **Hero layout**: logo, menu, tagline, scroll cue, title and lead sit on one CSS grid (`css/base.css`), marked out by dashed lines. Below 768px it stacks into a single column and keeps only the horizontal lines.
- **Load reveal**: the copy fades and rises in once the page has loaded.
- **Scroll exit**: the hero is pinned (sticky) inside a 250svh stage, `#hero-stage`. Scrolling through the stage's extra height fades the dashed lines and slides the copy out of the viewport in turn: the tagline left, the lead right, the title down, last. Then "Scroll down" settles into the bottom-right corner. `src/js/ui/HeroScroll.ts` eases the progress and publishes it as `--p`; the timing windows sit in the exit block of `css/base.css`. The header stays put.

## Where to edit

| What | File |
| --- | --- |
| Copy, menu links, logo | `src/index.html` |
| Colors, background gradient, fonts, grid, breakpoints | `css/base.css` (`:root` tokens) |
| Scroll exit: stage length, timing per element | `css/base.css` (`.hero-stage`, exit block) |

## Development

```bash
npm install
npm run dev       # http://localhost:5173
npm run lint      # type-check + eslint
npm run build     # static output in dist/
npm run preview   # preview the production build
```

## Credits

- Based on the WebGL xylophone by [Sujen Phea](https://github.com/Sujenphea) for [Codrops](https://tympanus.net/codrops/?p=118008) (MIT, see `LICENSE`)

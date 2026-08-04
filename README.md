# WebGL Xylophone

A scrolling helix of frosted glass bars that ring as you sweep across them, built in Three.js with instancing, a fluid simulation, and glass faked entirely in the shader.

![WebGL Xylophone Demo](https://tympanus.net/codrops/wp-content/uploads/2026/07/Home.png)

[Article on Codrops](https://tympanus.net/codrops/?p=118008)

[Demo](https://tympanus.net/Tutorials/Xylophone/)

## Features

- **Instanced Glass Helix**: 64 bars drawn in one call, posed entirely from instance attributes
- **Scroll Conveyor**: advancing the scroll phase wraps bars around a finite ring, so a fixed count reads as an endless column
- **Frosted Transmission**: the backdrop is rendered and Gaussian-blurred into its own buffer, then refracted through each bar with fresnel and thin-film iridescence
- **Fluid Hover Wake**: a low-res GPU fluid solve drives the colour tint, and sleeps itself when the pointer goes idle
- **GPU-Geometry Picking**: the bars exist only on the GPU, so hit testing rebuilds each instance's matrix on the CPU and tests one bounding box per bar — allocation-free, no per-triangle work
- **Polyphonic Web Audio**: one recorded sample pitch-shifted across a major-pentatonic scale, one voice per strike, with a voice cap for fast sweeps

## Development

Start the development server with hot module replacement:

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

Type-check and lint:

```bash
npm run lint
```

## Building for Production

Create an optimized production build:

```bash
npm run build
```

The built files will be in the `dist/` directory. Preview the production build:

```bash
npm run preview
```

## Credits

- Fluid solver adapted from [WebGL-Fluid-Simulation](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation) by Pavel Dobryakov (MIT)
- Built with [three.js](https://threejs.org/) and [postprocessing](https://github.com/pmndrs/postprocessing)

## Misc

Follow Sujen: [Twitter](https://x.com/sujen_p), [GitHub](https://github.com/Sujenphea), [Linkedin](https://www.linkedin.com/in/sujenphea/)

Follow Codrops: [X](http://www.x.com/codrops), [Facebook](https://www.facebook.com/codrops), [Instagram](https://www.instagram.com/codropsss/), [LinkedIn](https://www.linkedin.com/company/codrops/), [GitHub](https://github.com/codrops)

## License

[MIT](LICENSE)

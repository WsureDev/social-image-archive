import { PurgeCSS } from 'purgecss'

const build = await Bun.build({
  entrypoints: ['src/gallery/app.ts'],
  target: 'browser',
  outdir: 'dist/gallery',
  minify: true,
  splitting: true
})
if (!build.success) {
  throw new Error('Gallery bundle failed: ' + build.logs.join('\n'))
}
const original = Bun.file('dist/gallery/app.css').size
const [stylesheet] = await new PurgeCSS().purge({
  content: ['src/gallery/**/*.html', 'src/gallery/**/*.ts'],
  css: ['dist/gallery/app.css'],
  safelist: [/^pswp/],
  fontFace: true
})
if (!stylesheet) {
  throw new Error('Gallery stylesheet was not generated')
}
await Bun.write('dist/gallery/app.css', stylesheet.css)
console.log('Gallery built. CSS: ' + original + ' → ' + Bun.file('dist/gallery/app.css').size + ' bytes')
for (const output of build.outputs) {
  if (output.path.endsWith('.js')) {
    console.log(output.path.split('/').pop() + ': ' + output.size + ' bytes')
  }
}

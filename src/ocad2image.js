#!/usr/bin/env node

const fs = require('fs')
const { program } = require('commander')
const OcadTiler = require('.')
const { readOcad } = require('ocad2geojson')

program
  .option('-b,--bounds <string>', 'bounds (xmin, ymin, xmax, ymax) in map CRS coordinates; defaults to map bounds')
  .option('-r,--resolution <number>', 'resolution in meters per pixel', 1)
  .option('-f,--fill <string>', 'Background color (HTML color, transparent as default)')
  .parse(process.argv)

const { bounds: boundsStr, resolution, fill } = program
const [ocadPath, outputPath] = program.args

readOcad(ocadPath)
  .then(async ocadFile => {
    const tiler = new OcadTiler(ocadFile)
    const bounds = boundsStr ? boundsStr.split(',').map(Number) : tiler.bounds
    const isSvg = /^.*\.(svg)$/i.exec(outputPath)
    if (!isSvg) {
      tiler.render(bounds, resolution, { outputPath, fill })
    } else {
      const svg = tiler.renderSvg(bounds, resolution, { fill })
      fs.writeFileSync(outputPath, svg)
    }
  })
  .catch(err => {
    console.error('Unexpected error:', err)
  })

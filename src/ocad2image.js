#!/usr/bin/env node

const fs = require('fs')
const { program } = require('commander')
const OcadTiler = require('.')
const { readOcad } = require('ocad2geojson')

program
  .option(
    '-b,--bounds <string>',
    'bounds (xmin, ymin, xmax, ymax) in map CRS coordinates; defaults to map bounds'
  )
  .option('-r,--resolution <number>', 'resolution in meters per pixel', 1)
  .option(
    '-f,--fill <string>',
    'Background color (HTML color, transparent as default)'
  )
  .option('--show-hidden', 'Include hidden symbols in the output')
  .option(
    '--filter-symbols <numbers>',
    'only include numbered symbols in output'
  )
  .option('-v,--verbose', 'Show more output')
  .parse(process.argv)

const {
  bounds: boundsStr,
  resolution,
  fill,
  showHidden: exportHidden,
  verbose,
} = program
const [ocadPath, outputPath] = program.args
const includeSymbols =
  program.filterSymbols && parseSymNums(program.filterSymbols)

readOcad(ocadPath)
  .then(async ocadFile => {
    const tiler = new OcadTiler(ocadFile)
    const bounds = boundsStr ? boundsStr.split(',').map(Number) : tiler.bounds
    const isSvg = /^.*\.(svg)$/i.exec(outputPath)
    const isPdf = /^.*\.(pdf)$/i.exec(outputPath)
    const isGeoJson = /^.*\.(json|geojson)$/i.exec(outputPath)
    verboseLog('Bounds', bounds)
    if (isSvg || isPdf) {
      const svg = tiler.renderSvg(bounds, resolution, {
        fill,
        exportHidden,
        includeSymbols,
      })
      if (isPdf) {
        const PDFDocument = require('pdfkit')
        const SVGtoPDF = require('svg-to-pdfkit')
        const XMLSerializer = require('xmldom').XMLSerializer

        const doc = new PDFDocument()
        const stream = doc.pipe(fs.createWriteStream(outputPath))
        SVGtoPDF(doc, new XMLSerializer().serializeToString(svg), 0, 0, {
          assumePt: true,
          colorCallback: x => {
            const color =
              x &&
              ocadFile.colors.find(
                c =>
                  c &&
                  c.rgbArray[0] === x[0][0] &&
                  c.rgbArray[1] === x[0][1] &&
                  c.rgbArray[2] === x[0][2]
              )
            return (color && color.cmyk && [color.cmyk, x[1]]) || x
          },
        })

        doc.end()
        stream.on('finish', () => {
          process.exit(0)
        })
      } else {
        fs.writeFileSync(outputPath, svg)
      }
    } else if (isGeoJson) {
      fs.writeFileSync(
        outputPath,
        JSON.stringify(
          tiler.renderGeoJson(bounds, { exportHidden, includeSymbols })
        )
      )
    } else {
      return tiler.render(bounds, resolution, {
        outputPath,
        fill,
        exportHidden,
        includeSymbols,
      })
    }
  })
  .then(() => verboseLog('Wrote image to', outputPath))
  .catch(err => {
    console.error('Unexpected error:', err)
  })

function verboseLog(...params) {
  if (verbose) {
    console.log(...params)
  }
}

function parseSymNums(s) {
  return s.split(',').map(parseSymNum)
}

function parseSymNum(x) {
  const n = Number(x)
  const t = Math.trunc(n)
  return Math.round((t + (n - t) / 100) * 1000)
}

#!/usr/bin/env node

const fs = require('fs')
const { program } = require('commander')
const OcadTiler = require('ocad-tiler')
const { render, renderSvg, renderGeoJson } = require('./')
const { readOcad } = require('ocad2geojson')
const mToPt = 2834.65

program
  .option(
    '-b,--bounds <string>',
    'bounds (xmin, ymin, xmax, ymax) in map CRS coordinates; defaults to map bounds'
  )
  .option('-r,--resolution <number>', 'resolution in meters per pixel', 1)
  .option(
    '-s,--scale <string>',
    'scale to print in, for PDF output; overrides --resolution; use either "1:10000" or just denominator like "10000"'
  )
  .option(
    '-f,--fill <string>',
    'Background color (HTML color, transparent as default)'
  )
  .option('--show-hidden', 'Include hidden symbols in the output')
  .option(
    '--filter-symbols <numbers>',
    'only include numbered symbols in output'
  )
  .option('--apply-grivation', 'rotate map according to its grivation')
  .option(
    '--page-size <string>',
    'page size for PDF output (e.g. A4, A3, A2, A1, A0)',
    'A4'
  )
  .option(
    '--page-orientation <string>',
    'page orientation (portrait, landscape)',
    'portrait'
  )
  .option('-v,--verbose', 'Show more output')
  .arguments('<ocadpath> <outputpath>')
  .parse(process.argv)

const {
  bounds: boundsStr,
  resolution,
  scale,
  fill,
  showHidden: exportHidden,
  verbose,
  applyGrivation,
} = program
const [ocadPath, outputPath] = program.args
const includeSymbols =
  program.filterSymbols && parseSymNums(program.filterSymbols)

if (!ocadPath) exit('Missing input OCAD map path')
if (!outputPath) exit('Missing output path')

readOcad(ocadPath)
  .then(async ocadFile => {
    const tiler = new OcadTiler(ocadFile)
    const bounds = boundsStr ? boundsStr.split(',').map(Number) : tiler.bounds
    const isSvg = /^.*\.(svg)$/i.exec(outputPath)
    const isPdf = /^.*\.(pdf)$/i.exec(outputPath)
    const isGeoJson = /^.*\.(json|geojson)$/i.exec(outputPath)

    verboseLog('Bounds', bounds)
    if (isSvg || isPdf) {
      let scaleDenominator
      if (scale) {
        const scaleMatch = /^(\d+):(\d+)$/.exec(scale)
        if (scaleMatch) {
          scaleDenominator = Number(scaleMatch[2])
        } else {
          scaleDenominator = Number(scale)
        }
      }

      const svg = renderSvg(
        tiler,
        bounds,
        scaleDenominator ? scaleDenominator / mToPt : resolution,
        {
          fill,
          exportHidden,
          includeSymbols,
          applyGrivation,
        }
      )
      const XMLSerializer = require('xmldom').XMLSerializer
      if (isPdf) {
        const PDFDocument = require('pdfkit')
        const SVGtoPDF = require('svg-to-pdfkit')

        const doc = new PDFDocument({ autoFirstPage: false })
        doc.addPage({
          size: program.pageSize,
          layout: program.pageOrientation,
        })
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
        fs.writeFileSync(outputPath, new XMLSerializer().serializeToString(svg))
      }
    } else if (isGeoJson) {
      fs.writeFileSync(
        outputPath,
        JSON.stringify(
          renderGeoJson(tiler, bounds, { exportHidden, includeSymbols })
        )
      )
    } else {
      return render(tiler, bounds, resolution, {
        outputPath,
        fill,
        exportHidden,
        includeSymbols,
        applyGrivation,
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

function exit(s) {
  process.stderr.write(s + '\n')
  process.exit(1)
}

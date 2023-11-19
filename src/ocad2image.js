#!/usr/bin/env node

const fs = require('fs')
const { program } = require('commander')
const XMLSerializer = require('xmldom').XMLSerializer
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

    verboseLog('Bounds', bounds)
    const format = getFormat(outputPath)
    switch (format) {
      case 'svg':
      case 'pdf':
        {
          const scaleDenominator = getScaleDenominator(scale)
          const outputResolution = scaleDenominator
            ? scaleDenominator / mToPt
            : resolution
          const svg = getSvg(tiler, bounds, outputResolution)
          if (format === 'pdf') {
            return svgToPdf(svg, ocadFile)
          } else {
            fs.writeFileSync(
              outputPath,
              new XMLSerializer().serializeToString(svg)
            )
          }
        }
        break
      case 'json':
      case 'geojson':
        fs.writeFileSync(
          outputPath,
          JSON.stringify(
            renderGeoJson(tiler, bounds, { exportHidden, includeSymbols })
          )
        )
        break
      default:
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

function getScaleDenominator(scale) {
  if (scale) {
    const scaleMatch = /^(\d+):(\d+)$/.exec(scale)
    if (scaleMatch) {
      return Number(scaleMatch[2])
    } else {
      return Number(scale)
    }
  }
}

function mapRgbToCmyk(ocadFile) {
  return x => {
    const color =
      x &&
      ocadFile.colors.find(
        c => c && c.rgbArray && c.rgbArray.every((v, i) => v === x[0][i])
      )
    const result = color && color.cmyk ? [color.cmyk, x[1]] : x
    return result
  }
}

function getFormat(path) {
  const match = /\.(\w+)$/.exec(path)
  return match && match[1].toLowerCase()
}

function getSvg(tiler, bounds, resolution) {
  const svg = renderSvg(tiler, bounds, resolution, {
    fill,
    exportHidden,
    includeSymbols,
    applyGrivation,
  })
  return svg
}

function svgToPdf(svg, ocadFile) {
  return new Promise((resolve, reject) => {
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
      colorCallback: mapRgbToCmyk(ocadFile),
    })

    doc.end()
    stream.on('finish', () => {
      resolve()
    })
    stream.on('error', err => {
      reject(err)
    })
  })
}

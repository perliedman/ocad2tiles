const { ocadToGeoJson } = require('ocad2geojson/src/ocad-to-geojson')
const sharp = require('sharp')
const DOMImplementation = global.DOMImplementation
  ? global.DOMImplementation
  : new (require('xmldom').DOMImplementation)()
const XMLSerializer = global.XMLSerializer
  ? global.XMLSerializer
  : require('xmldom').XMLSerializer

module.exports = {
  renderGeoJson,
  renderSvg,
  render,
}

function renderGeoJson(tiler, extent, options) {
  return ocadToGeoJson(tiler.ocadFile, {
    objects: tiler.getObjects(extent),
    ...options,
  })
}

function renderSvg(tiler, extent, resolution, options = {}) {
  const svg = tiler.renderSvg(extent, resolution, {
    DOMImplementation,
    ...options,
  })
  fixIds(svg)
  return svg
}

function render(tiler, extent, resolution, options = {}) {
  const crs = tiler.ocadFile.getCrs()
  const svgResolution = Math.min(resolution, 1 * (crs.scale / 15000))
  const svg = renderSvg(tiler, extent, svgResolution, options)
  const extentWidth = extent[2] - extent[0]
  const extentHeight = extent[3] - extent[1]

  svg.setAttributeNS(
    'http://www.w3.org/2000/svg',
    'width',
    extentWidth / svgResolution + 'px'
  )
  svg.setAttributeNS(
    'http://www.w3.org/2000/svg',
    'height',
    extentHeight / svgResolution + 'px'
  )
  const xml = new XMLSerializer().serializeToString(svg)
  const result = sharp(Buffer.from(xml)).resize(
    Math.round(extentWidth / resolution),
    Math.round(extentHeight / resolution)
  )
  if (options.outputPath) {
    return result.toFile(options.outputPath)
  } else if (options.format) {
    return result.toFormat(options.format).toBuffer()
  } else {
    throw new Error('Missing option "outputPath" or "format".')
  }
}

// In xmldom, node ids are normal attributes, while in the browser's
// DOM, they are a property on the node object itself. This method
// recursively "fixes" nodes by adding id attributes.
function fixIds(n) {
  if (n.id) {
    n.setAttributeNS('http://www.w3.org/2000/svg', 'id', n.id)
  }
  if (n.childNodes) {
    for (let i = 0; i < n.childNodes.length; i++) {
      fixIds(n.childNodes[i])
    }
  }
}

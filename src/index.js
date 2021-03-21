const { ocadToSvg, ocadToGeoJson } = require('ocad2geojson')
const Flatbush = require('flatbush')
const sharp = require('sharp')
const DOMImplementation = global.DOMImplementation
  ? global.DOMImplementation
  : new (require('xmldom').DOMImplementation)()
const XMLSerializer = global.XMLSerializer
  ? global.XMLSerializer
  : require('xmldom').XMLSerializer

// OCAD uses 1/100 mm of "paper coordinates" as units, we
// want to convert to meters in real world
const hundredsMmToMeter = 1 / (100 * 1000)

module.exports = class OcadTiler {
  constructor(ocadFile) {
    this.ocadFile = ocadFile
    this.index = new Flatbush(this.ocadFile.objects.length)

    const bounds = [
      Number.MAX_VALUE,
      Number.MAX_VALUE,
      -Number.MAX_VALUE,
      -Number.MAX_VALUE,
    ]

    for (const o of this.ocadFile.objects) {
      let minX = Number.MAX_VALUE
      let minY = Number.MAX_VALUE
      let maxX = -Number.MAX_VALUE
      let maxY = -Number.MAX_VALUE

      for (const [x, y] of o.coordinates) {
        minX = Math.min(x, minX)
        minY = Math.min(y, minY)
        maxX = Math.max(x, maxX)
        maxY = Math.max(y, maxY)
      }
      this.index.add(minX, minY, maxX, maxY)

      bounds[0] = Math.min(minX, bounds[0])
      bounds[1] = Math.min(minY, bounds[1])
      bounds[2] = Math.max(maxX, bounds[2])
      bounds[3] = Math.max(maxY, bounds[3])
    }

    this.index.finish()
    const crs = ocadFile.getCrs()
    this.bounds = mapExtentToProjected(bounds, crs)
  }

  renderGeoJson(extent, options) {
    return ocadToGeoJson(this.ocadFile, {
      objects: this.getObjects(extent),
      ...options,
    })
  }

  renderSvg(extent, resolution, options = {}) {
    const document = DOMImplementation.createDocument(null, 'xml', null)
    const svg = ocadToSvg(this.ocadFile, {
      objects: this.getObjects(extent, (options.buffer || 256) * resolution),
      document,
      includeSymbols: options.includeSymbols,
      verbose: options.verbose,
    })

    fixIds(svg)
    const mapGroup = svg.getElementsByTagName('g')[0]
    const crs = this.ocadFile.getCrs()
    extent = projectedExtentToMapCoords(extent, crs)
    const transform = `scale(${
      (hundredsMmToMeter * crs.scale) / resolution
    }) translate(${-extent[0]}, ${extent[3]}) rotate(${
      (crs.grivation / Math.PI) * 180
    })`
    mapGroup.setAttributeNS(
      'http://www.w3.org/2000/svg',
      'transform',
      transform
    )
    if (options.fill) {
      const rect = document.createElement('rect')
      rect.setAttributeNS(
        'http://www.w3.org/2000/svg',
        'fill',
        `${options.fill}`
      )
      rect.setAttributeNS('http://www.w3.org/2000/svg', 'width', '100%')
      rect.setAttributeNS('http://www.w3.org/2000/svg', 'height', '100%')
      svg.insertBefore(rect, svg.firstChild)
    }
    return svg
  }

  render(extent, resolution, options = {}) {
    const crs = this.ocadFile.getCrs()
    const svgResolution = Math.min(resolution, 1 * (crs.scale / 15000))
    const svg = this.renderSvg(extent, svgResolution, options)
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

  getObjects(extent, buffer) {
    const crs = this.ocadFile.getCrs()
    extent = projectedExtentToMapCoords(extent, crs)
    extent = enlargeExtent(extent, buffer)
    return this.index
      .search(extent[0], extent[1], extent[2], extent[3])
      .map(i => this.ocadFile.objects[i])
  }

  tileBounds(resolution, tileSize) {
    const projectedTileSize = tileSize * resolution
    const { bounds } = this
    return [
      roundDown(bounds[0], projectedTileSize),
      roundDown(bounds[1], projectedTileSize),
      roundUp(bounds[2], projectedTileSize),
      roundUp(bounds[3], projectedTileSize),
    ]
  }

  getTileExtent(resolution, tileSize, row, col) {
    const projectedTileSize = tileSize * resolution
    return [
      col * projectedTileSize,
      row * projectedTileSize,
      (col + 1) * projectedTileSize,
      (row + 1) * projectedTileSize,
    ]
  }
}

function roundDown(x, div) {
  return Math.floor(x / div)
}

function roundUp(x, div) {
  return Math.ceil(x / div)
}

function projectedExtentToMapCoords(extent, crs) {
  return transformExtent(extent, c => crs.toMapCoord(c))
}
function mapExtentToProjected(extent, crs) {
  return transformExtent(extent, c => crs.toProjectedCoord(c))
}

function transformExtent(extent, transform) {
  const corners = [
    [extent[0], extent[1]],
    [extent[2], extent[1]],
    [extent[2], extent[3]],
    [extent[0], extent[3]],
  ]
  const transformed = corners.map(transform)
  return [
    Math.min.apply(
      Math,
      transformed.map(c => c[0])
    ),
    Math.min.apply(
      Math,
      transformed.map(c => c[1])
    ),
    Math.max.apply(
      Math,
      transformed.map(c => c[0])
    ),
    Math.max.apply(
      Math,
      transformed.map(c => c[1])
    ),
  ]
}

function enlargeExtent(extent, buffer) {
  return [
    extent[0] - buffer,
    extent[1] - buffer,
    extent[2] + buffer,
    extent[3] + buffer,
  ]
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

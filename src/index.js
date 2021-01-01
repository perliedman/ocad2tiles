const { ocadToSvg } = require('ocad2geojson')
const Flatbush = require('flatbush')
const sharp = require('sharp')
const DOMImplementation = global.DOMImplementation
  ? global.DOMImplementation
  : new (require('xmldom').DOMImplementation)()
const XMLSerializer = global.XMLSerializer
  ? global.XMLSerializer
  : require('xmldom').XMLSerializer

const hundredsMmToMeter = 1 / (100 * 1000)

module.exports = class OcadTiler {
  constructor(ocadFile) {
    this.ocadFile = ocadFile
    this.index = new Flatbush(this.ocadFile.objects.length)

    const bounds = [Number.MAX_VALUE, Number.MAX_VALUE, -Number.MAX_VALUE, -Number.MAX_VALUE]

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
    this.bounds = [
      bounds[0] * hundredsMmToMeter * crs.scale + crs.easting,
      bounds[1] * hundredsMmToMeter * crs.scale + crs.northing,
      bounds[2] * hundredsMmToMeter * crs.scale + crs.easting,
      bounds[3] * hundredsMmToMeter * crs.scale + crs.northing,
    ]
  }

  renderSvg(extent, resolution) {
    const crs = this.ocadFile.getCrs()
    extent = [
      (extent[0] - crs.easting) / crs.scale / hundredsMmToMeter,
      (extent[1] - crs.northing) / crs.scale / hundredsMmToMeter,
      (extent[2] - crs.easting) / crs.scale / hundredsMmToMeter,
      (extent[3] - crs.northing) / crs.scale / hundredsMmToMeter,
    ]
    const objects = this.index.search(extent[0], extent[1], extent[2], extent[3])
      .map(i => this.ocadFile.objects[i])
    const svg = ocadToSvg(this.ocadFile, {
      objects,
      document: DOMImplementation.createDocument(null, 'xml', null)
    })

    const mapGroup = svg.getElementsByTagName('g')[0]
    const transform = `scale(${(hundredsMmToMeter * crs.scale / resolution)}) translate(${-extent[0]}, ${extent[3]})`
    mapGroup.setAttributeNS('http://www.w3.org/2000/svg', 'transform', transform)
    return svg
  }

  render(extent, resolution, options) {
    const svg = this.renderSvg(extent, resolution)
    svg.setAttributeNS('http://www.w3.org/2000/svg', 'width', (extent[2] - extent[0]) / resolution)
    svg.setAttributeNS('http://www.w3.org/2000/svg', 'height', (extent[3] - extent[1]) / resolution)
    const xml = new XMLSerializer().serializeToString(svg)
    const result = sharp(Buffer.from(xml))
    if (options.outputPath) {
      return result.toFile(options.outputPath)
    } else if (options.format) {
      return result.toFormat(options.format).toBuffer()
    } else {
      throw new Error('Missing option "outputPath" or "format".')
    }
  }
}

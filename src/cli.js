const fs = require('fs')
const path = require('path')
const { program } = require('commander')
const OcadTiler = require('.')
const { readOcad } = require('ocad2geojson')
const { sync: mkdirp } = require('mkdirp')
const { SingleBar } = require('cli-progress')

program
  .option('-n,--number-zoomlevels <number>', 'Number of zoom levels to generate', 6)
  .option('-o,--zoomlevel-offset <number>', 'Number to add to zoom level numbers', 0)
  .option('-s,--tile-size <number>', 'Tile size in pixels', 256)
  .option('-r,--base-resolution <number>', 'Base (most zoomed in) resolution used', 1)
  .parse(process.argv)

if (program.args.length !== 2) {
  console.error('Expected [OCAD MAP PATH] [OUTPUT PATH]')
  process.exit(1)
}

const [ocadPath, outputPath] = program.args
const { numberZoomlevels, zoomlevelOffset, tileSize, baseResolution } = program

readOcad(ocadPath)
  .then(async ocadFile => {
    const tiler = new OcadTiler(ocadFile)
    let resolution = baseResolution

    // Count tiles
    let totalTiles = 0
    for (let z = numberZoomlevels - 1; z >= 0; z--) {
      const [minCol, minRow, maxCol, maxRow] = tiler.tileBounds(resolution, tileSize)
      totalTiles += (maxCol - minCol) * (maxRow - minRow)
      resolution *= 2
    }

    const progress = new SingleBar()
    progress.start(totalTiles, 0)

    // Render tiles
    resolution = baseResolution
    let renderedTiles = 0
    for (let z = numberZoomlevels - 1; z >= 0; z--) {
      const [minCol, minRow, maxCol, maxRow] = tiler.tileBounds(resolution, tileSize)
      for (let row = minRow; row < maxRow; row++) {
        for (let col = minCol; col < maxCol; col++) {
          const tileDirPath = path.join(outputPath, (z + zoomlevelOffset).toString(), col.toString())
          const tilePath = path.join(tileDirPath, `${row}.png`)

          if (!fs.existsSync(tilePath)) {
            const extent = tiler.getTileExtent(resolution, tileSize, row, col)
            mkdirp(tileDirPath)
            await tiler.render(extent, resolution, { outputPath: tilePath })
          }

          progress.update(++renderedTiles)
        }
      }

      resolution *= 2
    }

    progress.stop()
  })

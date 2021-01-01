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
    const { bounds } = tiler
    let resolution = baseResolution

    // Count tiles
    let totalTiles = 0
    for (let z = numberZoomlevels - 1; z >= 0; z--) {
      const projectedTileSize = tileSize * resolution
      const [minCol, minRow, maxCol, maxRow] = tileBounds(projectedTileSize)
      totalTiles += (maxCol - minCol) * (maxRow - minRow)
      resolution *= 2
    }

    const progress = new SingleBar()
    progress.start(totalTiles, 0)

    // Render tiles
    resolution = baseResolution
    let renderedTiles = 0
    for (let z = numberZoomlevels - 1; z >= 0; z--) {
      const projectedTileSize = tileSize * resolution
      const [minCol, minRow, maxCol, maxRow] = tileBounds(projectedTileSize)
      for (let row = minRow; row < maxRow; row++) {
        for (let col = minCol; col < maxCol; col++) {
          const extent = [
            col * projectedTileSize,
            row * projectedTileSize,
            (col + 1) * projectedTileSize,
            (row + 1) * projectedTileSize
          ]
          const tileDirPath = path.join(outputPath, (z + zoomlevelOffset).toString(), col.toString())
          mkdirp(tileDirPath)
          const tilePath = path.join(tileDirPath, `${row}.png`)
          await tiler.render(extent, resolution, { outputPath: tilePath })

          progress.update(++renderedTiles)
        }
      }

      resolution *= 2
    }

    progress.stop()

    function tileBounds(projectedTileSize) {
      return [
        roundDown(bounds[0], projectedTileSize), 
        roundDown(bounds[1], projectedTileSize), 
        roundUp(bounds[2], projectedTileSize),        
        roundUp(bounds[3], projectedTileSize),
      ]
    }

  })


function roundDown(x, div) {
  return Math.floor(x / div)
}

function roundUp(x, div) {
  return Math.ceil(x / div)
}

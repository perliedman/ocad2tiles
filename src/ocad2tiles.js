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
  .option('-f,--fill <string>', 'Background color (HTML color, transparent as default)')
  .parse(process.argv)

if (program.args.length !== 2) {
  console.error('Expected [OCAD MAP PATH] [OUTPUT PATH]')
  process.exit(1)
}

const [ocadPath, outputPath] = program.args
const { numberZoomlevels, zoomlevelOffset, tileSize, baseResolution, fill } = program

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

    console.log('Min resolution:', baseResolution)
    console.log('Max resolution:', baseResolution * Math.pow(2, numberZoomlevels - 1))
    console.log('Bounds:', tiler.bounds)

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
            await tiler.render(extent, resolution, { outputPath: tilePath, fill })
          }

          progress.update(++renderedTiles)
        }
      }

      resolution *= 2
    }

    progress.stop()

    const indexTemplate = fs.readFileSync(path.join(__dirname, 'index.html.template'), 'utf8')
    fs.writeFileSync(path.join(outputPath, 'index.html'), template(indexTemplate, {
      bounds: JSON.stringify(tiler.bounds),
      minZoom: 0,
      maxZoom: numberZoomlevels - 1,
      baseResolution
    }))
  })
  .catch(err => {
    console.error('Unexpected error:', err)
  })

// Template util: copied from Leaflet.js
const templateRe = /\$\{ *([\w_ -]+) *\}/g;
function template(str, data) {
  return str.replace(templateRe, function (str, key) {
    var value = data[key];

    if (value === undefined) {
      throw new Error('No value provided for variable ' + str);

    } else if (typeof value === 'function') {
      value = value(data);
    }
    return value;
  });
}
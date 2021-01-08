#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { program } = require('commander')
const OcadTiler = require('.')
const { readOcad } = require('ocad2geojson')
const { sync: mkdirp } = require('mkdirp')
const { SingleBar } = require('cli-progress')

program
  .option('-n,--number-zoomlevels <number>', 'Number of zoom levels to generate', 4)
  .option('-o,--zoomlevel-offset <number>', 'Number to add to zoom level numbers', 0)
  .option('-s,--tile-size <number>', 'Tile size in pixels', 256)
  .option('-r,--base-resolution <number>', 'Base (most zoomed in) resolution used', 1)
  .option('-f,--fill <string>', 'Background color (HTML color, transparent as default)')
  .option('-s,--serve', 'Run as webserver, serving the tiles')
  .option('-p,--port <number>', 'Port to run webserver on (see --serve)', 8080)
  .option('--show-hidden', 'Include hidden symbols in the output')
  .parse(process.argv)

if (program.args.length !== 2) {
  console.error('Expected [OCAD MAP PATH] [OUTPUT PATH]')
  process.exit(1)
}

const [ocadPath, outputPath] = program.args
const {
  numberZoomlevels,
  zoomlevelOffset,
  tileSize,
  baseResolution,
  fill,
  port,
  serve,
  showHidden: exportHidden
} = program

readOcad(ocadPath)
  .then(async ocadFile => {
    const tiler = new OcadTiler(ocadFile)

    console.log('Min resolution:', baseResolution)
    console.log('Max resolution:', baseResolution * Math.pow(2, numberZoomlevels - 1))
    console.log('Bounds:', tiler.bounds)

    const minZoom = zoomlevelOffset
    const maxZoom = zoomlevelOffset + numberZoomlevels - 1
    const indexTemplate = fs.readFileSync(path.join(__dirname, 'index.html.template'), 'utf8')
    const indexPage = template(indexTemplate, {
      bounds: JSON.stringify(tiler.bounds),
      minZoom,
      maxZoom,
      baseResolution
    })

    if (!serve) {
      renderAllTiles()
    } else {
      serveTiles()
    }

    async function renderAllTiles() {
      // Count tiles
      let resolution = baseResolution
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
              await tiler.render(extent, resolution, { outputPath: tilePath, fill, exportHidden })
            }

            progress.update(++renderedTiles)
          }
        }

        resolution *= 2
      }

      progress.stop()
      fs.writeFileSync(path.join(outputPath, 'index.html'), indexPage)
    }

    function serveTiles() {
      const http = require('http')
      const director = require('director')
      const router = new director.http.Router({
        '/': { get: index },
        '/:z/:x/:y.png': { get: tile }
      })
      const server = http.createServer(function (req, res) {
        router.dispatch(req, res, function (err) {
          if (err) {
            console.error(err)
            res.writeHead(err.status || 500)
            res.end()
          }
        })
      })
      server.listen(port)
      console.log(`Web server started, listening on http://127.0.0.1:${port}`)

      function index() {
        this.res.writeHead(200, { 'Content-Type': 'text/html' })
        this.res.end(indexPage)
      }

      async function tile(z, x, y) {
        z = parseInt(z)
        x = parseInt(x)
        y = parseInt(y)

        const resolution = baseResolution * Math.pow(2, (numberZoomlevels - 1) - (z - zoomlevelOffset))
        const tileDirPath = path.join(outputPath, (z + zoomlevelOffset).toString(), x.toString())
        const tilePath = path.join(tileDirPath, `${y}.png`)
        if (!fs.existsSync(tilePath)) {
          const [minCol, minRow, maxCol, maxRow] = tiler.tileBounds(resolution, tileSize)

          if (z < minZoom || z > maxZoom || x < minCol || x > maxCol || y < minRow || y > maxRow) {
            this.res.writeHead(404, 'Not found')
            this.res.end()
            return
          }

          const extent = tiler.getTileExtent(resolution, tileSize, y, x)
          mkdirp(tileDirPath)
          await tiler.render(extent, resolution, { outputPath: tilePath, fill, exportHidden })
        }
        this.res.writeHead(200, { 'Content-Type': 'image/png' })
        this.res.end(fs.readFileSync(tilePath))
      }
    }
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
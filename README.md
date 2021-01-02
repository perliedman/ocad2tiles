OCAD to Tiles
=============

Creates raster tiles from an OCAD map file, suitable for use with for example [Leaflet](https://leafletjs.com/) or [OpenLayers](https://openlayers.org/).

## Installing

```shell
npm install ocad2tiles
```

## Usage

From the command line:

```
Usage: npx ocad2tiles [options] [OCAD MAP FILE] [OUTPUT PATH]

Options:
  -n,--number-zoomlevels <number>  Number of zoom levels to generate (default: 6)
  -o,--zoomlevel-offset <number>   Number to add to zoom level numbers (default: 0)
  -s,--tile-size <number>          Tile size in pixels (default: 256)
  -r,--base-resolution <number>    Base (most zoomed in) resolution used (default: 1)
  -h, --help                       display help for command
```

## API

### OcadTiler

```js
const OcadTiler = require('.')
const { readOcad } = require('ocad2geojson')
const metersPerPixel = 1

readOcad(pathToOcadMap).then(ocadFile => {
  const tiler = new OcadTiler(ocadFile)
  tiler.render(tiler.bounds, metersPerPixel, { outputPath: 'test.png' })
})
```

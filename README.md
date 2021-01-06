OCAD to Tiles
=============

Creates raster images and tiles from an OCAD map file. Tiles are suitable for use with for example [Leaflet](https://leafletjs.com/) or [OpenLayers](https://openlayers.org/).

## Installing

To use command line tools:

```shell
npm install -g ocad2tiles
```

To use as a library in your project:

```shell
npm install ocad2tiles
```

## Command line usage

### Create tiles

This will create a set of tiles (small, square raster images, sometimes also called image pyramid or image mosaic) suitable for use in map clients like Leaflet or OpenLayers.

The tool will create a number of directories, one per zoom level, in the output path. It also creates a small demo HTML page, `index.html`, where you can see the tiles result in a Leaflet map.

Optionally, using the `--serve` option, the tool will start a web server which
can serve the tiles, as well as the demo web page. This is a great way to quickly
test configuration without generating a lot of tiles.

Tiles are currently always written in PNG format.

Example:

```shell
ocad2tiles my-map-file.ocd /my/output/path
```

Detailed usage:

```
Usage: ocad2tiles [options] [OCAD MAP FILE] [OUTPUT PATH]

Options:
  -n,--number-zoomlevels <number>  Number of zoom levels to generate (default: 4)
  -o,--zoomlevel-offset <number>   Number to add to zoom level numbers (default: 0)
  -s,--tile-size <number>          Tile size in pixels (default: 256)
  -r,--base-resolution <number>    Base (most zoomed in) resolution used (default: 1)
  -f,--fill <string>               Background color (HTML color, transparent as default)
  -s,--serve                       Run as webserver, serving the tiles
  -p,--port <number>               Port to run webserver on (see --serve) (default: 8080)
  -h, --help                       display help for command
```

### Create image

Make a single raster image from an OCAD map file.

Supported output formats:

* PNG
* JPEG
* SVG
* PDF (basic support, currently limited control over page format and scale)
* WEBP
* GIF
* TIFF

Output format is determined by the output path's extension

Example:

```shell
ocad2image my-map-file.ocd my-image.png
```

Detailed usage:

```
Usage: ocad2image [options] [OCAD MAP FILE] [OUTPUT PATH]

Options:
  -b,--bounds <string>      bounds (xmin, ymin, xmax, ymax) in map CRS coordinates; defaults to map bounds
  -r,--resolution <number>  resolution in meters per pixel (default: 1)
  -f,--fill <string>        Background color (HTML color, transparent as default)
  -h, --help                display help for command
```

## API

### OcadTiler

```js
const OcadTiler = require('ocad2tiles')
const { readOcad } = require('ocad2geojson')
const metersPerPixel = 1

readOcad(pathToOcadMap).then(ocadFile => {
  const tiler = new OcadTiler(ocadFile)
  tiler.render(tiler.bounds, metersPerPixel, { outputPath: 'test.png' })
})
```

var assert = require('assert');
var printer = require('../');
var fs = require('fs');
var path = require('path');
var mapnik = require('mapnik');

// defaults
var zoom = 5,
    scale = 4,
    x = 4096,
    y = 4096,
    quality = 256,
    format = 'png',
    limit = 19008,
    tileSize = 256;


// fixtures
var tiles = fs.readdirSync(path.resolve(__dirname + '/fixtures/')).reduce(function(memo, basename) {
    var key = basename.split('.').slice(0, 4).join('.');
    memo[key] = fs.readFileSync(path.resolve(__dirname + '/fixtures/' + basename));
    return memo;
}, {});

describe('Get center from bbox', function() {
    it('should fail if (x1, y1) and (x2,y2) are equal', function(done) {
        var bbox = [0, 0, 0, 0];

        var center = printer.coordsFromBbox(zoom, scale, bbox, tileSize);
        assert(center.w <= 0 || center.h <= 0, 'Incorrect coordinates')

        done();
    });
    it('should fail if the image is too large', function(done) {
        var bbox = [-60, -60, 60, 60];

        var center = printer.coordsFromBbox(7, 2, bbox, tileSize);
        assert(center.w >= limit || center.h >= limit, 'Desired image is too large')

        done();
    });
    it('should return the correct coordinates', function(done) {
        var bbox = [-60, -60, 60, 60];

        var center = printer.coordsFromBbox(zoom, scale, bbox, tileSize);
        assert.deepEqual(center.w, 10922);
        assert.deepEqual(center.h, 13736);
        assert.deepEqual(center.x, 16384);
        assert.deepEqual(center.y, 16384);
        done();
    });
});

describe('get coordinates from center', function() {
    it('should should fail if the image is too large', function(done) {
        var center = {
            x: 0,
            y: 0,
            w: 4752,
            h: 4752
        };

        var center = printer.coordsFromCenter(zoom, scale, center, tileSize);
        assert(center.w >= limit || center.h >= limit, 'Desired image is too large')

        done();
    });
    it('should return correct origin coords', function(done) {
        var center = {
            x: 0,
            y: 20,
            w: 800,
            h: 800
        };
        var center2 = printer.coordsFromCenter(zoom, scale, center, tileSize);
        assert.equal(center2.x, 16384);
        assert.equal(center2.y, 14525);
        done();
    });
});

describe('create list of tile coordinates', function() {
    var center =  {x: x, y: y, w: 1824, h: 1832 };

    var expectedCoords = {
        tiles: [
            { z: 5, x: 3, y: 3, px: -112, py: -108 },
            { z: 5, x: 3, y: 4, px: -112, py: 916 },
            { z: 5, x: 4, y: 3, px: 912, py: -108 },
            { z: 5, x: 4, y: 4, px: 912, py: 916 }
        ],
        dimensions: { x: 1824, y: 1832 },
        center: { row: 4, column: 4, zoom: 5 },
        scale: 4
    };
    it('should return a tiles object with correct coords', function(done) {
        var coords = printer.tileList(zoom, scale, center);
        assert.deepEqual(JSON.stringify(coords), JSON.stringify(expectedCoords));
        done();
    });
});

[256, 512, 1024].forEach(function(size) {
    describe('stitch tiles into single png', function() {
        var expectedCoords = {
            tiles: [
                { z: 1, x: 0, y: 0, px: 0, py: 0 },
                { z: 1, x: 0, y: 1, px: 0, py: size },
                { z: 1, x: 1, y: 0, px: size, py: 0 },
                { z: 1, x: 1, y: 1, px: size, py: size }
            ],
            dimensions: {
                x: size * 2,
                y: size * 2
            },
            center: { row: 1, column: 1, zoom: 1 },
            scale: 1,
            tileSize: size
        };

        it('should fail if no coordinates object', function(done) {
            printer.stitchTiles(null, format, quality, function() {}, function(err) {
                assert.equal(err.message, 'No coords object.');
                done();
            });
        });

        it('should return tiles and stitch them together', function(done) {
            var expectedImage = fs.readFileSync(path.resolve(__dirname + '/expected/expected.' + size + '.png'));

            printer.stitchTiles(expectedCoords, format, quality, getTileTest, function(err, image, header) {
                fs.writeFile(__dirname + '/outputs/expected.' + size + '.png', image, function(err){
                    checkImage(image, expectedImage);
                    done();
                });
            });
        });
    });

    describe('run entire function', function() {
        it('stitches images with a center coordinate', function(done) {
            var expectedImage = fs.readFileSync(path.resolve(__dirname + '/expected/center.' + size + '.png'));

            var params = {
                zoom: 1,
                scale: 1,
                center: {
                    x: 0,
                    y: 0,
                    w: 200,
                    h: 200
                },
                format: 'png',
                quality: 50,
                tileSize: size,
                getTile: getTileTest
            };

            printer(params, function(err, image) {
                assert.equal(err, null);

                fs.writeFile(__dirname + '/outputs/center.' + size + '.png', image, function(err){
                    assert.equal(err, null);
                    console.log('\tVisually check image at '+ __dirname + '/outputs/center.' + size + '.png');

                    // byte by byte check of image:
                    checkImage(image, expectedImage);
                    done();
                });
            });
        });

        it('stitches images with a wsen bbox', function(done) {
            var expectedImage = fs.readFileSync(path.resolve(__dirname + '/expected/bbox.' + size + '.png'));

            var params = {
                zoom: 1,
                scale: 1,
                bbox: [-140, -80, 140, 80],
                format: 'png',
                quality: 50,
                tileSize: size,
                getTile: getTileTest
            };

            printer(params, function(err, image, headers) {
                assert.equal(err, null);
                fs.writeFile(__dirname + '/outputs/bbox.' + size + '.png', image, function(err){
                    assert.equal(err, null);
                    console.log('\tVisually check image at '+ __dirname + '/outputs/bbox.'+ size +'.png');

                    // byte by byte check of image:
                    checkImage(image, expectedImage);
                    done();
                });
            });
        })
    });

    // This approximates a tilelive's getTile function
    // (https://github.com/mapbox/tilelive-vector/blob/master/index.js#L119-L218)
    // by loading a series of local png tiles
    // and returning the tile requested with the x, y, & z,
    // parameters along with the appropriate headers
    function getTileTest(z, x, y, callback) {
        var key = [z, x, y, size].join('.');

        // Headers.
        var headers = {
            'Last-Modified': new Date().toUTCString(),
            'ETag':'73f12a518adef759138c142865287a18',
            'Content-Type':'application/x-protobuf'
        };

        if (!tiles[key]) {
            return callback(new Error('Tile does not exist'));
        } else {
            return callback(null, tiles[key], headers);
        }
    }

    function checkImage(actual, expected) {
        actual = new mapnik.Image.fromBytes(actual);
        expected = new mapnik.Image.fromBytes(expected);
        var max_diff_pixels = 0;
        var compare_alpha = true;
        var threshold = 16;
        var diff_pixels = actual.compare(expected, {
            threshold: threshold,
            alpha: compare_alpha
        });
        if (diff_pixels > max_diff_pixels) {
            expected.save('test/outputs/center.fail.png');
        }
        assert.equal(max_diff_pixels, diff_pixels);
    }

});

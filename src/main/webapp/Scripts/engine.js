define(['jquery', 'point', 'datacache', 'camera', 'spritesheet', 'svg', 'svg.tile', 'svg.foreignobject'], function($, Point, DataCache, Camera, SpriteSheet, SVG) {
    'use strict';

    /**
     * Engine module constructor.
     * 
     * @param {HTMLElement or jQuery object} container Engine will live inside this element.
     * @param {Client} controller Game logic and data translation provider.
     * @param {number} refreshSpeed How often the screen should be updated.
     */
    function Engine(container, controller, refreshSpeed) {
        // Make sure container is jQuery object.
        container = $(container);

        if (SVG.supported) {
            this.refreshSpeed = refreshSpeed || 200;

            this.context = SVG(container[0]);
            this.controller = controller;

            // Information about logical field of view.
            this.camera = new Camera();//new Point(35.1, 16.7));
            this.cache = new DataCache();
            this.spritesheet = new SpriteSheet(this.context);

            // Information about actually drawn field of view.
            this.tiles = this.context.group();

            this.resize(container);
        } else {
            // If SVG is not supported, disable engine run.
            this.run = function() {
                container.append('<span>SVG is not supported in this browser.</span>');
            };
        }
    }
    
    
    /**
     * Draws a tile on the screen.
     * 
     * @param {type} tileData containing logical coordinates and tile content.
     * @param {type} tileSize size of the tile on screen.
     * @param {Point} center of the tile on the screen.
     */
    Engine.prototype.drawTile = function(tileData, tileSize, center) {
                  
        // Draw the actual tile
        var tile = this.controller.createTile(this.tiles, tileData.content);

        tile.tile(tileSize);
                
        tile.coordinates = tileData.position;
        tile.center = center;

        // Add user controls handlers.
        tile.click(this.controller.onClick);
                        
        // Move operates with top left corner, while my center is tile center.
        tile.move(center.x - tileSize.width / 2, center.y - tileSize.height / 2);

        // TODO: Reorder all tiles infront of this one on the z-index
            
        return tile;
    };
    
    
    /**
     * Updates data cache and if the tile needs to be redrawn, returns its coordinates on screen.
     * 
     * @param {type} tileData containing logical coordinates and tile content.
     * @param {type} tileSize tileSize is optionally passed in to prevent recalculation for each updated tile and hence improve performance.
     */
    Engine.prototype.updateTile = function(tileData, tileSize) {
        var oldTile = this.cache.get(tileData.position),
            center,
            tile;

        // Do something only if the tile changed
        if (!oldTile || !oldTile.tile || oldTile.content !== tileData.content) {

            // Reuse old coordinates if possible, otherwise calculate new
            if (oldTile && oldTile.tile) {
                center = oldTile.tile.center;
                
                // Remove the original tile
                oldTile.tile.remove();
            } else {
                center = this.camera.getIsometricCoordinates(tileData.position);
            }

            tileSize = tileSize || this.camera.getTileSize();

            // Skip tiles that would end up out of the screen
            if (this.camera.showTile(center, tileSize)) {
                tile = this.drawTile(tileData, tileSize, center);
            }
            
            // Update the data cache
            this.cache.set(tileData.position, tileData.content, tile);
        }
    };
    

    /**
     * Updates the screen with tiles based on given data.
     * 
     * @param {Chunk} data Fresh data for the screen
     */
    Engine.prototype.redraw = function(data) {
        var dimension = new Point(data.tiles.length, data.tiles[0].length),
            tileSize = this.camera.getTileSize(),
            x, y;

        for (x = 0; x < dimension.x; x++) {
            for (y = 0; y < dimension.y; y++) {
                this.updateTile(data.tiles[x][y], tileSize);
            }
        }
    };

    /**
     * Requests data update from the server and when it's delivered, redraws the screen.
     * 
     * @param {DOMHighResTimeStamp} timestamp from the beginning of the animation. In miliseconds, but with decimal precision to 10 microseconds. 
     */
    Engine.prototype.updateAsync = function(timestamp) {
        requestAnimationFrame(this.updateAsync.bind(this));

        // Don't bother server on every frame render.
        if (!this.lastUpdate || timestamp - this.lastUpdate > this.refreshSpeed) {
            this.lastUpdate = timestamp;
            
            var xmlHttp = new XMLHttpRequest();

            xmlHttp.onreadystatechange = (function(that) {
                return function() {
                    if ((this.readyState === 4) && (this.status === 200)) {
                        var data = JSON.parse(this.responseText);
                        that.redraw(data);
                    }
                };
            })(this);

            try {
                // Request data surrounding the current camera position
                var screen = this.camera.getScreenOuterBounds();

                xmlHttp.open('GET', this.controller.serverUrl + '/tiles/' + screen.join(), true);
                xmlHttp.setRequestHeader('Content-type', 'application/json');
                xmlHttp.send();
            }
            catch (error) {
                console.log(error);
            }
        } else {
            //TODO: Only handle animations and I/O.

            this.spritesheet.animateSprites(timestamp);
        }
    };

    /**
     * Launches the engine update loop. 
     */
    Engine.prototype.run = function() {
        this.lastUpdate = null;                                              

        requestAnimationFrame(this.updateAsync.bind(this));

        this.ui = this.controller.createUi(this.context);
    };


    Engine.prototype.resize = function(container) {
        var c = $(container),
            size = new Point(c.innerWidth(), c.innerHeight());

        this.camera.resizeViewport(size);
        this.context.size(size.x, size.y);
    };


    Engine.prototype.move = function(xDiff, yDiff) {
        this.tiles.animate(200).move(this.tiles.x() + -xDiff, this.tiles.y() + -yDiff);

        this.camera.move(xDiff, yDiff);

        //TODO: Get rid of those outside screen.
        //TODO: Fetch new in screen from cache.
    };

    return Engine;
});
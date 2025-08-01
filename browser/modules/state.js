/*
 * @author     Martin Høgh <mh@mapcentia.com>
 * @copyright  2013-2018 MapCentia ApS
 * @license    http://www.gnu.org/licenses/#AGPL  GNU AFFERO GENERAL PUBLIC LICENSE 3
 */

'use strict';

const STATE_STORE_NAME = `vidi-state-store`;
const LOG = false;

const MODULE_NAME = `state`;

/**
 * @type {*|exports|module.exports}
 */
var cloud, setting, baseLayer, setBaseLayer, switchLayer, legend, print, draw, advancedInfo, meta;

/**
 * @type {*|exports|module.exports}
 */
var urlparser = require('./urlparser');

/**
 * @type {string}
 */
var hash = urlparser.hash;

/**
 * @type {array}
 */
var urlVars = urlparser.urlVars;

/**
 *
 * @type {string}
 */
var BACKEND = require('../../config/config.js').backend;

var anchor;

var layers;

var _self;

var backboneEvents;

var layerTree;

var stateSnapshots;

let extensions;

let utils;

var listened = {};

var p, hashArr = hash.replace("#", "").split("/");

let activeLayersInSnapshot = false;

let isApplyingState = false;

/**
 * Returns internaly stored global state
 *
 * @returns {Promise}
 */
const _getInternalState = () => {
    let result = new Promise((resolve, reject) => {
        localforage.getItem(STATE_STORE_NAME, (error, value) => {
            if (LOG) console.log('State: after getting state');

            if (error) {
                resolve({});
            }

            let localState = {modules: {}};
            if (value) {
                localState = JSON.parse(value);
            }

            if (LOG) console.log('State: ', localState);

            resolve(localState);
        });
    });

    return result;
};

/**
 * Sets internaly stored global state
 *
 * @returns {Promise}
 */
const _setInternalState = (value) => {
    let result = new Promise((resolve, reject) => {
        localforage.setItem(STATE_STORE_NAME, JSON.stringify(value), (error) => {
            if (error) {
                console.error(error);
            } else {
                if (LOG) console.log('State: saved', value);
            }
            resolve();
        });
    });

    return result;
};


/**
 *
 * @type {{set: module.exports.set, init: module.exports.init}}
 */
module.exports = {

    /**
     *
     * @param o
     * @returns {exports}
     */
    set: function (o) {
        anchor = o.anchor;
        cloud = o.cloud;
        setting = o.setting;
        stateSnapshots = o.stateSnapshots;
        setBaseLayer = o.setBaseLayer;
        baseLayer = o.baseLayer;
        switchLayer = o.switchLayer;
        legend = o.legend;
        print = o.print;
        draw = o.draw;
        layers = o.layers;
        advancedInfo = o.advancedInfo;
        meta = o.meta;
        layerTree = o.layerTree;
        utils = o.utils;
        backboneEvents = o.backboneEvents;
        extensions = o.extensions;
        _self = this;
        return this;
    },

    /**
     * @todo Most of the functionality from this method should be moved to the
     * corresponding modules and extensions
     */
    init: function () {
        _self = this;
        /**
         * Creates promise
         *
         * @param {String} data Input data for underlying function
         *
         * @return {Function}
         */
        const createPromise = (data) => {
            return new Promise(resolve => {
                switchLayer.init(data, true, true).then(() => {
                    backboneEvents.get().trigger(`layerTree:activeLayersChange`);
                    resolve()
                });
            })
        };

        /**
         * Executes promises one after another
         *
         * @param {Array} data Set of input values
         */
        const executeSequentially = (data) => {
            return createPromise(data.pop()).then(x => data.length === 0 ? x : executeSequentially(data));
        };
        return new Promise((initResolve, initReject) => {
            try {

                if (!('localforage' in window)) {
                    console.error('localforage is not defined');
                }

                var arr, i, maxBounds = setting.getMaxBounds();

                if (maxBounds) {
                    cloud.get().setMaxBounds(maxBounds);
                }

                // When all layers are loaded, when load legend and when set "all_loaded" for print
                backboneEvents.get().once("allDoneLoading:layers", function (e) {
                    legend.init().then(function () {
                        console.log("Vidi is now loaded");// Vidi is now fully loaded
                        window.status = "all_loaded";
                        if (window.vidiConfig?.initFunction) {
                            let func = Function('"use strict";return (' + window.vidiConfig.initFunction + ')')();
                            try {
                                func();
                            } catch (e) {
                                console.error("Error in initFunction:", e.message)
                            }
                        }
                        if (urlVars?.readyCallback) {
                            try {
                                window.parent.postMessage({
                                    type: "vidiCallback",
                                    method: urlVars.readyCallback
                                }, "*");
                            } catch (e) {
                            }
                        }
                    });
                });

                // Reset hash. Needed if state is invoked after start up
                hash = decodeURIComponent(window.location.hash);
                hashArr = hash.replace("#", "").split("/");

                const setLayers = (hash = true) => {
                    let layersToActivate = [];
                    let baseLayerId = false;
                    if (hash) {
                        $(".base-map-button").removeClass("active");
                        if (hashArr[0]) $("#" + hashArr[0]).addClass("active");

                        if (hashArr[1] && hashArr[2] && hashArr[3]) {
                            baseLayerId = hashArr[0];

                            // Layers to activate
                            if (hashArr[4]) {
                                layersToActivate = utils.removeDuplicates(hashArr[4].split(","));
                            }
                        }
                    }
                    // This is used if fastInit is not used
                    layersToActivate = utils.removeDuplicates(layersToActivate.concat(window.vidiConfig.activeLayers));

                    const initializeLayersFromURL = () => {
                        if (layersToActivate.length === 0) {
                            initResolve();
                        } else {
                            executeSequentially(layersToActivate).then(() => {
                                initResolve();
                            });
                        }
                    };

                    if (layerTree.isReady()) {
                        setBaseLayer.init(baseLayerId);
                        initializeLayersFromURL();
                    } else {
                        backboneEvents.get().once(`layerTree:ready`, () => {
                            setBaseLayer.init(baseLayerId);
                            initializeLayersFromURL();
                        });
                    }
                };

                /**
                 * Applies settings provided in the URL hash part
                 */
                const initializeFromHashPart = () => {
                    if (urlVars.k === undefined) {
                        if (hashArr[0]) {
                            setLayers();
                        } else {
                            let layersToActivate = [];
                            // Set base layer to the first added one
                            setBaseLayer.init(baseLayer.getAvailableBaseLayers()[0].id);

                            if (!utils.parseZoomCenter(window.vidiConfig?.initZoomCenter)) {
                                const extent = setting.getExtent();
                                if (extent !== null) {
                                    cloud.get().zoomToExtent(extent);
                                } else {
                                    cloud.get().zoomToExtent();
                                }
                            }
                            // If initialFilter is set, when Fast Init is disabled. We need to activate layers from config.activeLayers
                            if (!urlVars.state && urlVars.initialFilter) {
                                layersToActivate = utils.removeDuplicates(window.vidiConfig.activeLayers);
                                if (layersToActivate.length === 0) {
                                    initResolve();
                                } else {
                                    executeSequentially(layersToActivate).then(() => {
                                        initResolve();
                                    });
                                }
                            } else {
                                initResolve();
                            }
                        }
                    } else {
                        var parr, v, l, t, GeoJsonAdded = false;
                        parr = urlVars.k.split("#");
                        if (parr.length > 1) {
                            parr.pop();
                        }

                        $.ajax({
                            dataType: "json", method: "get", url: '/api/postdata/', data: {
                                k: parr.join()
                            }, scriptCharset: "utf-8", success: function (response) {
                                // Server replies have different structure
                                if (!(`anchor` in response.data) && !(`bounds` in response.data) && `data` in response.data && response.data.data) {
                                    if (`anchor` in response.data.data && `bounds` in response.data.data) {
                                        response.data = response.data.data;
                                    }
                                }
                                if (response.data.bounds !== null) {
                                    var frame = urlVars.frame || 0;
                                    var bounds = response.data.bounds[frame];
                                    cloud.get().map.fitBounds([bounds._northEast, bounds._southWest], {animate: false})
                                }

                                if (typeof response.data.customData !== "undefined" && response.data.customData !== null) {
                                    backboneEvents.get().trigger("on:customData", response.data.customData);
                                }

                                // Recreate print
                                // ==============
                                if (response.data.print !== null) {
                                    GeoJsonAdded = false;
                                    parr = response.data.print;
                                    v = parr;
                                    let m = v[0].geojson.features[frame];
                                    if (m.type === "Feature") {
                                        const flippedCoordinates = m.geometry.coordinates[0].map(coord => [coord[1], coord[0]]);
                                        const g = L.polygon([flippedCoordinates], {
                                            fillOpacity: 0,
                                            opacity: 1,
                                            color: 'red',
                                            fillColor: 'red',
                                            weight: 10,
                                            className: 'print-rect-poly',
                                        });
                                        cloud.get().map.addLayer(g);
                                        const width = document.getElementById('pane1').offsetWidth;
                                        const rectWidth = document.querySelector('.print-rect-poly').getBoundingClientRect().width;
                                        const scaleFactor = width / rectWidth;
                                        const getCurrenTransform = (el) => {
                                            const st = window.getComputedStyle(el, null);
                                            const tr = st.getPropertyValue("transform");
                                            let scale, angle;
                                            let values = tr.split('(')[1];
                                            values = values.split(')')[0];
                                            values = values.split(',');
                                            const a = values[0];
                                            const b = values[1];
                                            scale = Math.sqrt(a * a + b * b);
                                            const radians = Math.atan2(b, a);
                                            angle = Math.round(radians * (180 / Math.PI));
                                            return [angle, scale];
                                        }
                                        const zoom = cloud.get().map.getZoom();
                                        const orgZoom = parseInt(response.data.anchor.split('/')[1]);
                                        setTimeout(() => {
                                            document.querySelectorAll('.drag-marker').forEach(marker => {
                                                const tr = getCurrenTransform(marker);
                                                const rotate = tr[0];
                                                const scale = tr[1] * Math.pow(2, (zoom - orgZoom));
                                                marker.style.transform = `rotate(${rotate}deg) scale(${scale})`;
                                            })
                                        }, 0)
                                        $("#container1").css("transform", "scale(" + scaleFactor + ")");
                                        $(".leaflet-control-scale-line").prependTo("#scalebar").css("transform", "scale(" + scaleFactor + ")");
                                        $(".leaflet-control-scale-line").prependTo("#scalebar").css("transform-origin", "left bottom 0px");
                                        $("#scale").html("1 : " + response.data.scale);
                                        $("#title").html(decodeURIComponent(urlVars.t));
                                        parr = urlVars.c.split("#");
                                        if (parr.length > 1) {
                                            parr.pop();
                                        }
                                        $("#comment").html(decodeURIComponent(parr.join()));

                                        if (hashArr[0]) {
                                            setLayers()
                                        }
                                        if (urlVars.html !== 'true') {
                                            cloud.get().map.removeLayer(g);
                                        }
                                    }
                                }

                                // Recreate Drawings
                                // =================

                                if (response.data.state.modules?.draw?.drawnItems) {
                                    draw.recreateDrawnings(response.data.state.modules.draw.drawnItems);
                                }

                                // Recreate Measurements
                                // =====================

                                if (response.data.state.modules?.measurements?.measurements) {
                                    draw.recreateDrawnings(response.data.state.modules.measurements.measurements);
                                }

                                // Recreate query draw
                                // ===================

                                if (response.data.queryDraw !== null) {
                                    GeoJsonAdded = false;
                                    parr = response.data.queryDraw;
                                    v = parr;
                                    l = advancedInfo.getDrawLayer();
                                    $.each(v[0].geojson.features, function (n, m) {
                                        if (m.type === "Feature" && GeoJsonAdded === false) {
                                            var g = L.geoJson(v[0].geojson, {
                                                style: function (f) {
                                                    return f.style;
                                                }
                                            });
                                            $.each(g._layers, function (i, v) {
                                                l.addLayer(v);
                                            });
                                            GeoJsonAdded = true;
                                        }
                                        if (m.type === "Circle") {
                                            g = L.circle(m._latlng, m._mRadius, m.style);
                                            g.feature = m.feature;
                                            l.addLayer(g);
                                        }
                                        if (m.type === "Rectangle") {
                                            g = L.rectangle([m._latlngs[0], m._latlngs[2]], m.style);
                                            g.feature = m.feature;
                                            l.addLayer(g);
                                        }
                                        if (m.type === "Marker") {
                                            if (m?._vidi_awesomemarkers) {
                                                g = L.marker(m._latlng, {
                                                    icon: L.AwesomeMarkers.icon(m._vidi_awesomemarkers)
                                                })
                                            } else {
                                                g = L.marker(m._latlng, m.style);
                                            }
                                            g.feature = m.feature;
                                            l.addLayer(g);
                                        }
                                    });
                                }

                                // Recreate query buffer
                                // =====================

                                if (response.data.queryBuffer !== null) {
                                    GeoJsonAdded = false;
                                    parr = response.data.queryBuffer;
                                    v = parr;
                                    l = advancedInfo.getDrawLayer();
                                    $.each(v[0].geojson.features, function (n, m) {
                                        if (m.type === "Feature" && GeoJsonAdded === false) {
                                            var g = L.geoJson(v[0].geojson, {
                                                style: function (f) {
                                                    return f.style;
                                                }
                                            });
                                            $.each(g._layers, function (i, v) {
                                                l.addLayer(v);
                                            });
                                            GeoJsonAdded = true;
                                        }
                                    });
                                }


                                // Recreate result
                                // ===============

                                if (response.data.queryResult !== null) {
                                    GeoJsonAdded = false;
                                    parr = response.data.queryResult;
                                    v = parr;
                                    $.each(v[0].geojson.features, function (n, m) {
                                        if (m.type === "Feature" && GeoJsonAdded === false) {
                                            var g = L.geoJson(v[0].geojson, {
                                                style: function (f) {
                                                    return f.style;
                                                }
                                            });
                                            $.each(g._layers, function (i, v) {
                                                cloud.get().map.addLayer(v);
                                            });
                                            GeoJsonAdded = true;
                                        }
                                        if (m.type === "Circle") {
                                            g = L.circleMarker(m._latlng, m.style);
                                            g.setRadius(m._radius);
                                            g.feature = m.feature;
                                            cloud.get().map.addLayer(g);
                                        }
                                    });
                                }

                                // Recreate symbols
                                // ================
                                if ('symbols' in extensions && response?.data?.state?.modules?.symbols?.symbolState) {
                                    extensions.symbols.index.recreateSymbolsFromState(response.data.state.modules.symbols.symbolState);
                                    extensions.symbols.index.lock();
                                }

                                // Recreate added layers
                                // from layerSearch
                                // =====================

                                var currentLayers = meta.getMetaData();
                                var flag;
                                var addedLayers = [];

                                // Get array with the added layers
                                $.each(response.data.metaData.data, function (i, v) {
                                    flag = false;
                                    $.each(currentLayers.data, function (u, m) {
                                        if (m.f_table_name === v.f_table_name && m.f_table_schema === v.f_table_schema) {
                                            flag = true; // Flag layers from loaded schemata
                                        }
                                    });
                                    if (!flag) {
                                        addedLayers.push(v);
                                    }
                                });

                                if (`state` in response.data && response.data.state) {
                                    if (`modules` in response.data.state && `layerTree` in response.data.state.modules && `order` in response.data.state.modules.layerTree) {
                                        layerTree.applyState(response.data.state.modules.layerTree);
                                    }
                                }

                                // If any added layers, then add them
                                if (addedLayers.length > 0) {
                                    // @todo Review
                                    console.error(`Consider reviewing`);

                                    meta.addMetaData({data: addedLayers});
                                    layerTree.init();
                                    if (arr) {
                                        for (i = 0; i < arr.length; i++) {
                                            switchLayer.init(arr[i], true, true);
                                        }
                                    }
                                }
                            }
                        });
                    }
                };

                // The configuration "snapshot" property has lesser priority than the URL one
                let snapshotFromURL = (urlVars.state ? urlVars.state : false);
                let snapshotFromConfiguration = (`snapshot` in window.vidiConfig && window.vidiConfig.snapshot && window.vidiConfig.snapshot.indexOf(`state_snapshot_`) === 0 ? window.vidiConfig.snapshot : false);
                let selectedStateSnapshot = (snapshotFromURL ? snapshotFromURL : (snapshotFromConfiguration ? snapshotFromConfiguration : false));
                if (selectedStateSnapshot) {
                    stateSnapshots.getSnapshotByID(selectedStateSnapshot).then((state) => {
                        if (state) {
                            if (state.snapshot.map.layers.length === 0) {
                                console.log("No active layers in snapshot");
                                $('.layer-loading-indicator').hide();
                            } else {
                                console.log("Active layers in snapshot");
                                activeLayersInSnapshot = true;
                            }
                            this.applyState(state.snapshot).then(initResolve).catch((error) => {
                                console.error(error)
                            });
                        } else {
                            initializeFromHashPart();
                        }
                    }).catch(error => {
                        console.warn(`Unable to find valid state snapshot with id ${selectedStateSnapshot}`);
                        initializeFromHashPart();
                    });
                } else {
                    initializeFromHashPart();
                }

                backboneEvents.get().trigger("end:state");

            } catch (e) {
                console.error(e);
                initReject();
            }

        });
    },

    listenTo: (moduleName, module) => {
        if ('getState' in module === false || 'applyState' in module === false) {
            throw new Error(`Module or extension has to implement getState() and applyState() methods in order to support state`);
        }

        listened[moduleName] = module;
    },

    /**
     * Returns current state
     *
     * @returns {Promise}
     */
    getState: () => {
        return _getInternalState();
    },

    /**
     * Resets current state
     *
     * @return {Promise}
     */
    resetState: (customModulesToReset = []) => {
        let appliedStatePromises = [];
        let localState = {};
        localState.modules = {};
        if (customModulesToReset.length > 0) {
            for (let key in listened) {
                if (customModulesToReset.indexOf(key) !== -1) {
                    appliedStatePromises.push(listened[key].applyState(false));
                } else {
                    localState.modules[key] = listened[key].getState();
                }
            }
        } else {
            for (let key in listened) {
                appliedStatePromises.push(listened[key].applyState(false));
            }
        }
        return Promise.all(appliedStatePromises).then(() => {
            return _setInternalState(localState);
        });
    },

    /**
     * Shortcut for getting specific module or extension state
     *
     * @param {String} name Name of the module or extension
     *
     * @returns {Promise}
     */
    getModuleState: (name) => {
        if (!name) {
            throw new Error(`No module name was specified`);
        }

        let result = new Promise((resolve, reject) => {
            // If the state parameter is provided, then locally stored state for module is ignored
            if (urlVars.state) {
                resolve(false);
            } else {
                _getInternalState().then(state => {
                    if ('modules' in state && name in state.modules) {
                        resolve(state.modules[name]);
                    } else {
                        resolve(false);
                    }
                }).catch(error => {
                    console.error(error);
                });
            }
        });

        return result;
    },


    /**
     * Applies state
     *
     * @param {Object} state Applied state
     * @param ignoreInitZoomCenter
     * @returns {Promise}
     */
    applyState: (state, ignoreInitZoomCenter = false) => {
        isApplyingState = true;
        if (LOG) console.log(`${MODULE_NAME}: applying state`, state);
        if (!urlVars.dps) {
            history.pushState(``, document.title, window.location.pathname + window.location.search);
        }
        let result = new Promise((resolve, reject) => {
            if (!state) {
                console.error(`Provided state is empty`);
                reject(`Provided state is empty`);
                return;
            }
            _setInternalState(state);
            const applyStateToModules = () => {
                let promises = [];
                let modulesWithAppliedState = [];
                if ('modules' in state) {
                    for (let name in state.modules) {
                        if (name in listened) {
                            promises.push(listened[name].applyState(state.modules[name]));
                            modulesWithAppliedState.push(name);
                        } else {
                            console.warn(`Module or extension ${name} is not registered in state module, so its state will be applied when the "${name}:initialized" event will be fired`);
                            backboneEvents.get().once(`${name}:initialized`, () => {
                                if (name in listened) {
                                    listened[name].applyState(state.modules[name]).catch(error => {
                                        console.error(`Unable to apply state to ${name}, though the event was fired`, error);
                                    });
                                }
                            });
                        }
                    }
                }

                for (let key in listened) {
                    if (modulesWithAppliedState.indexOf(key) === -1) {
                        if (`resetState` in listened[key]) {
                            promises.push(listened[key].resetState());
                        }
                    }
                }

                Promise.all(promises).then(() => {
                    isApplyingState = false
                    resolve();
                }).catch(errors => {
                    console.error(errors);
                    isApplyingState = false
                    reject(errors);
                });
            };

            if ('map' in state) {
                anchor.applyMapParameters(state.map, ignoreInitZoomCenter).then(() => {
                    applyStateToModules();
                }).catch(error => {
                    console.error(error);
                    reject(error);
                });
            } else {
                applyStateToModules();
            }
        });
        return result;
    },

    /**
     * Pushes the current saved state to the server (GC2), then displays the link with saved state identifier (bookmark)
     *
     * @returns {Promise}
     */

    bookmarkState: (customData, png = false) => {
        return new Promise((resolve, reject) => {
            // Getting the print data
            print.getPrintData(customData).then(printData => {
                // Getting modules and extensions state
                let modulesData = {};

                let overallData = Object.assign({}, printData, modulesData);
                if (png) {
                    overallData.png = true;
                    overallData.image = false;
                }
                $.ajax({
                    dataType: `json`,
                    method: `POST`,
                    url: `/api/print/`,
                    contentType: `application/json`,
                    data: JSON.stringify(overallData),
                    scriptCharset: `utf-8`,
                    success: resolve,
                    error: reject
                });
            }).catch(error => {
                console.error(error);
            });
        });
    },

    setExtent: function () {
        const arr = window.vidiConfig?.initZoomCenter ? utils.parseZoomCenter(window.vidiConfig.initZoomCenter) : null;
        if (arr) {
            hashArr[1] = arr.z;
            hashArr[2] = arr.x;
            hashArr[3] = arr.y;
        }
        if (hashArr[1] && hashArr[2] && hashArr[3]) {
            p = geocloud.transformPoint(hashArr[2], hashArr[3], "EPSG:4326", "EPSG:3857");
            cloud.get().zoomToPoint(p.x, p.y, hashArr[1]);
        } else {
            cloud.get().zoomToExtent();
        }
    },

    setBaseLayer: function (b) {
        setBaseLayer = b;
    },

    /**
     * Updates overall state of the application on provided event (less optimized than listen())
     */
    listenAny: (eventName, updatedModules = []) => {
        backboneEvents.get().on(eventName, () => {
            _getInternalState().then(localState => {
                if (`modules` in localState === false || !localState.modules) {
                    localState.modules = {};
                }

                if (updatedModules.length === 0) {
                    for (let name in listened) {
                        localState.modules[name] = listened[name].getState();
                    }
                } else {
                    for (let name in listened) {
                        if (updatedModules.indexOf(name) > -1) {
                            localState.modules[name] = listened[name].getState();
                        }
                    }
                }

                _setInternalState(localState);
            }).catch(error => {
                console.error(error);
            });
        });
    },

    /**
     * Listens to specific events of modules and extensions, then gets their state and updates
     * and saves the overall state locally, so next reload will keep all changes
     */
    listen: (name, eventId) => {
        backboneEvents.get().on(name + ':' + eventId, () => {
            _self._updateStateForModule(name);
        });
    },

    /**
     * Retrieves state for specific module or extension
     *
     * @param {String} name Module or extension name
     */
    _updateStateForModule: (name) => {
        if (name in listened === false) {
            throw new Error(`Module or extension ${name} does not exist`);
        }

        if ('getState' in listened[name] === false || 'applyState' in listened[name] === false) {
            throw new Error(`Module or extension has to implement getState() and applyState() methods in order to support state`);
        }

        _getInternalState().then(localState => {
            if (`modules` in localState === false || !localState.modules) {
                localState.modules = {};
            }

            localState.modules[name] = listened[name].getState();
            _setInternalState(localState);
        }).catch(error => {
            console.error(error);
        });
    },

    resetStore: () => {
        _setInternalState({});
    },

    activeLayersInSnapshot: () => {
        return activeLayersInSnapshot;
    },

    layersInUrl: () => {
        let l = [];
        if (hashArr[4]) {
            l = hashArr[4].split(",");
        }
        return l;
    },

    isApplyingState: () => isApplyingState
};

/*
 * @author     Martin Høgh <mh@mapcentia.com>
 * @copyright  2013-2022 MapCentia ApS
 * @license    http://www.gnu.org/licenses/#AGPL  GNU AFFERO GENERAL PUBLIC LICENSE 3
 */

'use strict';

const MODULE_ID = `print`;

var cloud;
var printOn = false;
var boxCount = 0;
var recEdit = [];
var curBounds = [];
var serializeLayers;
var anchor;
var printItems = new L.FeatureGroup();
var urlparser = require('./urlparser');
var db = urlparser.db;
var urlVars = urlparser.urlVars;
var schema = urlparser.schema;
var scale;
var center = [];
var config = require('../../config/config.js');
var printC = config.print.templates;
var scales = config.print.scales;
var tmpl;
var pageSize;
var printingOrientation;
var backboneEvents;
var legend;
var meta;
var state;
var _self = false;
var callBack = () => {
};
var alreadySetFromState = false;
var setState = true;
var paramsFromDb;
let scaleFromForm = false;
let min_scale = scales.length > 0 ? Math.min(...scales) : 200;

import dayjs from 'dayjs';
import advancedFormat from "dayjs/plugin/advancedFormat";

require('dayjs/locale/da')
dayjs.extend(advancedFormat)
// Set locale for date/time string
var lc = window._vidiLocale.split("_")[0];
dayjs.locale(lc);

/**
 * @private
 */
var _cleanUp = function (hard) {
    try {
        for (let i = 0; i <= boxCount; i++) {
            cloud.get().map.removeLayer(recEdit[i]);
        }
    } catch (e) {
        //console.error(e.message);
    }
    printOn = false;
    if (hard) {
        center = [];
        printC = config.print.templates;
        // scales = config.print.scales;
        scale = null;
        pageSize = null;
        printingOrientation = null;
        tmpl = null;
        boxCount = 0;
    }
};

/**
 *
 * @type {{set: module.exports.set, init: module.exports.init, activate: module.exports.activate, print: module.exports.print, control: module.exports.control}}
 */
module.exports = {
    set: function (o) {
        cloud = o.cloud;
        serializeLayers = o.serializeLayers;
        anchor = o.anchor;
        meta = o.meta;
        state = o.state;
        backboneEvents = o.backboneEvents;
        _self = this;
        return this;
    },
    init: function () {
        backboneEvents.get().on(`reset:all reset:${MODULE_ID}`, () => {
            _self.off();
        });
        backboneEvents.get().on(`off:all`, () => {
            _self.off();
        });
        backboneEvents.get().on(`on:${MODULE_ID}`, () => {
            _self.on();
        });
        backboneEvents.get().on(`off:${MODULE_ID}`, () => {
            _self.off();
        });
        state.listenTo(MODULE_ID, _self);
        state.listen(MODULE_ID, `state_change`);
        backboneEvents.get().on("end:print", function (response) {
            console.log("Response", response)
            $("#open-pdf, #open-pdf-toggle").show();
            if (response.format === "pdf") {
                $("#download-pdf, #open-pdf").attr("href", "/tmp/print/pdf/" + response.key + ".pdf");
            } else if (response.format === "png") {
                $("#download-pdf, #open-pdf").attr("href", "/tmp/print/png/" + response.key + ".png");
            } else {
                $("#download-pdf, #open-pdf").attr("href", "/tmp/print/png/" + response.key + ".zip");
            }
            $("#download-pdf").attr("download", response.key);
            $("#open-html").attr("href", response.uri + '&html=true');
            $("#start-print-btn").find("span").hide();
            $(".dropdown-toggle.start-print-btn").prop("disabled", false);
            // GeoEnviron
            console.log("GEMessage:LaunchURL:" + urlparser.urlObj.protocol + "://" + urlparser.urlObj.host + "/tmp/print/pdf/" + response.key + ".pdf");
        });
        $("#start-print-btn").on("click", function () {
            $("#open-pdf, #open-pdf-toggle").hide();
            const format = $("#start-print-png-btn").val();
            if (_self.print("end:print", null, format === "png")) {
                $(this).find("span").show()

                $(".dropdown-toggle.start-print-btn").prop("disabled", true);
                $("#get-print-fieldset").prop("disabled", true);
            }
        });

        $("#add-print-box-btn").on("click", function () {
            boxCount++;
            _self.control(null, null, null, null, null, null, null, null, null, null, null, false);
            backboneEvents.get().trigger(`${MODULE_ID}:state_change`);
        });
        $("#remove-print-box-btn").on("click", function () {
            if (boxCount > 0) {
                cloud.get().map.removeLayer(recEdit[boxCount]);
                recEdit.pop()
                center.pop()
                boxCount--;
                backboneEvents.get().trigger(`${MODULE_ID}:state_change`);
            }
        });
        cloud.get().map.addLayer(printItems);
    },

    off: function () {
        _cleanUp(true);
        $("#print-form :input, .start-print-btn, #select-scale").prop("disabled", true);
    },

    setCallBack: function (fn) {
        callBack = fn;
    },

    on: function () {
        let numOfPrintTmpl = 0;
        alreadySetFromState = false;
        $("#print-form :input, .start-print-btn, #select-scale").prop("disabled", false);
        $("#print-tmpl").empty();
        $("#print-size").empty();
        $("#print-orientation").empty();
        $("#select-scale").empty();
        scale = null;
        // Set up print dialog
        $("#ul-scale").empty();
        for (var i = 0; i < scales.length; i++) {
            $("#ul-scale").append("<li><a class='dropdown-item' data-scale-ul='" + scales[i] + "'>" + scales[i] + "</a></li>");
        }
        $("#print-sticky").unbind("change");
        $("#print-sticky").change(function (e) {
            alreadySetFromState = true;
        });
        $("#select-scale").unbind("change");
        $("#select-scale").change(function (e) {
            var s = e.target.value;
            scale = s;
            scales.push(parseInt(s));
            scales.sort((a, b) => a - b);
            scaleFromForm = true;
            change();
        });
        $.each(printC, function (i) {
            if (window.vidiConfig.enabledPrints.indexOf(i) > -1) {
                if (i.charAt(0) !== "_") {
                    numOfPrintTmpl = numOfPrintTmpl + 1;
                }
                $("#print-tmpl").append('<input type="radio" class="print print-tmpl btn-check" name="print-tmpl" id="' + i + '" value="' + i + '"><label class="btn btn-sm btn-outline-secondary" for="' + i + '">' + i + '</label>');
            }
        });
        if (numOfPrintTmpl > 1) {
            $("#print-tmpl").show();
        }
        var me = this;
        var change = function () {
            var arr = $("#print-form").serializeArray();
            $("#get-print-fieldset").prop("disabled", true);
            if (arr.length === 3) {
                _cleanUp();
                tmpl = arr[0].value;
                pageSize = arr[1].value;
                printingOrientation = arr[2].value;
                if (!alreadySetFromState && $("#print-sticky").is(":checked")) {
                    alreadySetFromState = true;
                    setState = false;
                    state.getState().then(applicationState => {
                        if (typeof applicationState.modules.print !== "undefined") {
                            let params = applicationState.modules.print;
                            for (let i = 0; i < params.bounds.length; i++) {
                                boxCount = i;
                                me.control(false,
                                    params.scales, params.tmpl, params.pageSize,
                                    params.orientation, params.legend,
                                    params.bounds[i], params.scale, params.title, params.comment, params.sticky, false);
                            }
                        } else {
                            me.control(null, null, null, null, null, null, null, null, null, null, null, false);
                        }
                    });
                } else {
                    let boxCountTemp = boxCount;
                    for (let i = 0; i <= boxCountTemp; i++) {
                        boxCount = i;
                        me.control(null, null, null, null, null, null, null, null, null, null, null, false);
                    }
                    setState = true;
                }
                if (setState) {
                    backboneEvents.get().trigger(`${MODULE_ID}:state_change`);
                    setState = false;
                }
            } else {
                _cleanUp();
            }
        };
        $(".print-tmpl").unbind("change");
        $(".print-tmpl").change(function (e) {
            $("#print-size").empty();
            $("#print-orientation").empty();

            $.each(printC[e.target.value], function (i, v) {
                $("#print-size").append('<input type="radio" class="print print-size btn-check" name="print-size" id="' + i + '" value="' + i + '"><label class="btn btn-sm btn-outline-secondary" for="' + i + '">' + i + '</label>');
            });
            // Click the first options in size
            setTimeout(function () {
                $("input:radio[name=print-size]:first").trigger("click");
            }, 5);
            $(".print-size").unbind("change");
            $(".print-size").change(function (e) {
                $("#print-orientation").empty();
                change();
                // Click the first options in orientation
                setTimeout(function () {
                    $("input:radio[name=print-orientation]:first").trigger("click");
                }, 5);
                $.each(printC[$('input[name=print-tmpl]:checked', '#print-form').val()][e.target.value], function (i, v) {
                    $("#print-orientation").append('<input type="radio" class="print print-orientation btn-check" name="print-orientation" id="' + i + '" value="' + i + '"><label for="' + i + '" class="btn btn-sm btn-outline-secondary">' + (i === "l" ? "Landscape" : "Portrait") + '</label>');
                });
                $(".print-orientation").unbind("change");
                $(".print-orientation").change(function (e) {
                    change();
                });
            });
            change();
        });
        $("#add-legend-btn, #print-title, #print-comment").unbind("change");
        $("#add-legend-btn, #print-title, #print-comment").change(() => {
            setTimeout(() => {
                backboneEvents.get().trigger(`${MODULE_ID}:state_change`);
            }, 5)
        });
        // Click the first options in all
        $("input:radio[name=print-tmpl]:first").trigger("click");
        setTimeout(function () {
            $("input:radio[name=print-size]:first").trigger("click");
            setTimeout(function () {
                $("input:radio[name=print-orientation]:first").trigger("click");
            }, 5)
        }, 5);
    },

    print: (endEventName = "end:print", customData, png = false) => {
        return new Promise((resolve, reject) => {
            state.bookmarkState(customData, png).then(response => {
                backboneEvents.get().trigger(endEventName, response);
                callBack(response.responseJSON);
                resolve(response);
            }).catch(response => {
                backboneEvents.get().trigger(endEventName, response);
                callBack(response);
                reject();
            });
        });
    },

    control: function (p, s, t, pa, o, l, b, sc, ti, cm, st, cleanUp = true) {
        if (cleanUp) {
            _cleanUp();
        }
        printC = p ? p : printC;
        scales = s ? s : scales;
        tmpl = t ? t : tmpl;
        pageSize = pa ? pa : pageSize;
        printingOrientation = o ? o : printingOrientation;
        legend = l ? l : null;
        let bnds = b || null;
        if (sc) {
            scale = sc;
            $("#select-scale").val(sc);
        }
        if (t) {
            $('#' + t).prop("checked", true);
        }
        setTimeout(() => {
            if (pa) {
                $('#' + pa).prop("checked", true);
            }
            setTimeout(() => {
                if (o) {
                    $('#' + o).prop("checked", true);
                }
            }, 5);
        }, 5);
        if (ti) {
            $('#print-title').val(decodeURIComponent(ti));
        }
        if (cm) {
            $('#print-comment').val(decodeURIComponent(cm));
        }
        if (l) {
            $("#add-legend-btn").prop("checked", l === "inline");
        }
        if (st) {
            $("#print-sticky").prop("checked", st);
        }
        var ps = printC[tmpl][pageSize][printingOrientation].mapsizeMm;
        var _getScale = function (scaleObject) {
            var bounds = scaleObject.getBounds(),
                sw = bounds.getSouthWest(),
                ne = bounds.getNorthEast(),
                halfLat = (sw.lat + ne.lat) / 2,
                midLeft = L.latLng(halfLat, sw.lng),
                midRight = L.latLng(halfLat, ne.lng),
                mwidth = midLeft.distanceTo(midRight),
                mscale = mwidth * 1000 / ps[0];
            scale = scales.reduce(function (prev, curr) {
                return (Math.abs(curr - mscale) < Math.abs(prev - mscale) ? curr : prev);
            });
            return scale;
        };

        const epsg = window.vidiConfig.crs;
        const rectangle = function (initCenter, scaleObject, color, initScale, isFirst, interactive = true) {
            scale = initScale ? initScale : _getScale(scaleObject);
            $("#select-scale").val(scale);
            if (isFirst && !sc) { // Only when print tool is activated first time and no state from project
                let scaleIndex = scales.indexOf(scale);
                if (scaleIndex > 1) {
                    scaleIndex = scaleIndex - 2;
                } else if (scaleIndex > 0) {
                    scaleIndex = scaleIndex - 1;
                }
                scale = scales[scaleIndex];
            }

            // Convert center point
            const centerM = geocloud.transformPoint(initCenter.lng, initCenter.lat, "EPSG:4326", epsg);

            // Calculate the dimensions of the rectangle in meters
            const printSizeM = [(ps[0] * scale / 1000), (ps[1] * scale / 1000)];
            let correctionFactor = 1;
            if (epsg === "EPSG:3857") {
                correctionFactor = 1 / Math.cos(initCenter.lat * Math.PI / 180);
            }
            // Calculate corners in projected coordinates
            const adjustedWidth = printSizeM[0] * correctionFactor;
            const adjustedHeight = printSizeM[1] * correctionFactor;
            const halfWidth = adjustedWidth / 2;
            const halfHeight = adjustedHeight / 2;
            const cornersM = [
                [centerM.x - halfWidth, centerM.y - halfHeight], // SW
                [centerM.x - halfWidth, centerM.y + halfHeight], // NW
                [centerM.x + halfWidth, centerM.y + halfHeight], // NE
                [centerM.x + halfWidth, centerM.y - halfHeight], // SE
                [centerM.x - halfWidth, centerM.y - halfHeight]  // Close polygon by repeating first point
            ];

            // Transform corners back to geographic coordinates for Leaflet polygon
            const cornersLatLng = cornersM.map(function (pt) {
                const geo = geocloud.transformPoint(pt[0], pt[1], epsg, "EPSG:4326");
                return [geo.y, geo.x];
            });

            // Create polygon
            const rectPoly = L.polygon(cornersLatLng, {
                color: color,
                fillOpacity: 0,
                opacity: 1,
                transform: true,
                interactive: interactive,
                className: 'print-rect-poly'
            });
            rectPoly.bindTooltip(`${(boxCount + 1)}`, {
                    permanent: true,
                    className: 'print-rect-poly-tooltip'
                }
            )
            center[boxCount] = rectPoly.getBounds().getCenter();
            return rectPoly;
        };

        var first = !center[0];
        center[boxCount] = center[boxCount] || cloud.get().map.getCenter(); // Init center as map center
        if (bnds) {
            let rec = L.rectangle([[bnds._southWest.lat, bnds._southWest.lng], [bnds._northEast.lat, bnds._northEast.lng]], {
                aspectRatio: (ps[0] / ps[1])
            });
            recEdit[boxCount] = rectangle(rec.getBounds().getCenter(), cloud.get().map, "blue", scale, first);
            bnds = null;
        } else {
            recEdit[boxCount] = rectangle(center[boxCount], cloud.get().map, "red", scale, first);
        }
        recEdit[boxCount]._vidi_type = "print";
        recEdit[boxCount]._count = boxCount;
        printItems.addLayer(recEdit[boxCount]);
        recEdit[boxCount].dragging.enable();

        var sw = recEdit[boxCount].getBounds().getSouthWest(), ne = recEdit[boxCount].getBounds().getNorthEast();
        curBounds[boxCount] = [sw.lat, sw.lng, ne.lat, ne.lng];
        recEdit[boxCount].on('dragend', function (e) {
            scaleFromForm = false;
            for (let i = 0; i <= boxCount; i++) {
                let c = recEdit[i].getBounds().getCenter();
                center[i] = c; // re-calculate centers
               // rectangle(c, recEdit[i], "red", null, false, true);
                $("#get-print-fieldset").prop("disabled", true);
                var sw = recEdit[i].getBounds().getSouthWest(),
                    ne = recEdit[i].getBounds().getNorthEast();
                curBounds[boxCount] = [sw.lat, sw.lng, ne.lat, ne.lng];
            }
            backboneEvents.get().trigger(`${MODULE_ID}:state_change`);
        });
    },

    getPrintParams: () => {

        var layerQueryDraw = [], layerQueryResult = [], layerQueryBuffer = [], layerPrint = [], e, parr,
            configFile = null;
        if (scale && (isNaN(scale) || scale < min_scale)) {
            alert(__("Not a valid scale. Must be over ") + min_scale + ".");
            return false;
        }
        backboneEvents.get().trigger("start:print");
        try {
            recEdit.editing.disable();
        } catch (e) {
        }
        // recEdit[recEdit.length - 1]?.editing.enable();
        if (paramsFromDb) {
            setTimeout(() => {
                paramsFromDb = null;
            }, 0);
            return paramsFromDb;
        }
        let anchorRaw = anchor.getAnchor();
        anchorRaw = anchorRaw.substr(0, anchorRaw.lastIndexOf(`/`));

        // Serialize drawing layers
        e = serializeLayers.serialize({
            "printHelper": true,
            "query_draw": false, // Get query draw
            "query_buffer": true,
            "query_result": true,
            "draw": true,
            "print": true,
            "measurements": true
        }, true);
        $.each(e, function (i, v) {
            if (v.type === "Vector") {
                layerQueryDraw.push({geojson: v.geoJson})
            }
        });
        e = serializeLayers.serialize({
            "printHelper": true,
            "query_draw": true,
            "query_buffer": false, // Get query buffer draw
            "query_result": true,
            "draw": true,
            "print": true,
            "measurements": true
        }, true);
        $.each(e, function (i, v) {
            if (v.type === "Vector") {
                layerQueryBuffer.push({geojson: v.geoJson})
            }
        });
        e = serializeLayers.serialize({
            "printHelper": true,
            "query_draw": true,
            "query_buffer": true,
            "query_result": false, // Get result
            "draw": true,
            "print": true,
            "measurements": true
        }, true);
        $.each(e, function (i, v) {
            if (v.type === "Vector") {
                layerQueryResult.push({geojson: v.geoJson})
            }
        });
        e = serializeLayers.serialize({
            "printHelper": true,
            "query_draw": true,
            "query_buffer": true,
            "query_result": true,
            "draw": true,
            "print": false, // Get print
            "measurements": true
        }, true);
        $.each(e, function (i, v) {
            if (v.type === "Vector") {
                layerPrint.push({geojson: v.geoJson})
            }
        });

        let data;
        // Slim down the meta data
        let metaData = meta.getMetaData();
        for (let i = 0; i < metaData.data.length; i++) {
            delete metaData.data[i].class;
            delete metaData.data[i].classwizard;
            delete metaData.data[i].def;
            delete metaData.data[i].fieldconf;
            delete metaData.data[i].fields;
        }
        try {
            data = {
                anchor: anchorRaw,
                applicationHost: window.location.origin,
                db: db,
                schema: schema,
                queryDraw: (typeof layerQueryDraw[0] !== "undefined" && layerQueryDraw[0].geojson.features.length > 0) ? layerQueryDraw : null,
                queryBuffer: (typeof layerQueryBuffer[0] !== "undefined" && layerQueryBuffer[0].geojson.features.length > 0) ? layerQueryBuffer : null,
                queryResult: (typeof layerQueryResult[0] !== "undefined" && layerQueryResult[0].geojson.features.length > 0) ? layerQueryResult : null,
                print: (typeof layerPrint[0] !== "undefined" && layerPrint[0].geojson.features.length > 0) ? layerPrint : null,
                bounds: recEdit.map(i => i.getBounds()),
                scale: scale,
                tmpl: tmpl,
                pageSize: pageSize,
                orientation: printingOrientation,
                title: encodeURIComponent($("#print-title").val()),
                comment: encodeURIComponent($("#print-comment").val()),
                legend: $("#add-legend-btn").is(":checked") ? "inline" : "none",
                header: encodeURIComponent($("#print-title").val()) || encodeURIComponent($("#print-comment").val()) ? "inline" : "none",
                dateTime: dayjs().format('Do MMMM YYYY, H:mm'),
                date: dayjs().format('Do MMMM YYYY'),
                metaData: metaData,
                px: config.print.templates[tmpl][pageSize][printingOrientation].mapsizePx[0],
                py: config.print.templates[tmpl][pageSize][printingOrientation].mapsizePx[1],
                queryString: urlparser.search.replace(/state=[a-z0-9_-]*/g, ""), // remove the state snapshot
                customData: null,
                scales: scales,
                sticky: $("#print-sticky").is(":checked")
            };
        } catch (e) {
            data = {};
        }
        if (urlVars.config) {
            parr = urlVars.config.split("#");
            if (parr.length > 1) {
                parr.pop();
            }
            data.config = parr.join();
        }
        return data;
    },

    /**
     * Gathers current application state
     *
     * @returns {Object}
     */
    getPrintData: (customData) => {
        return new Promise((resolve, reject) => {
            let data = _self.getPrintParams();
            data.customData = customData || null;
            state.getState().then(applicationState => {
                data.state = applicationState;
                // Set layer active if provided
                if (customData && typeof customData.layer === "string") {
                    data.state.modules.layerTree.activeLayers = [customData.layer];
                }
                resolve(data);
            });
        });
    },

    cleanUp: function (hard) {
        _cleanUp(hard);
    },

    getState: () => {
        let state = _self.getPrintParams();
        return state;
    },

    applyState: (print) => {
        return new Promise((resolve) => {
            paramsFromDb = print;
            backboneEvents.get().trigger(`${MODULE_ID}:state_change`);
            resolve();
        });
    }
};

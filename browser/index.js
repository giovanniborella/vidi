/*
 * @author     Martin Høgh <mh@mapcentia.com>
 * @copyright  2013-2024 MapCentia ApS
 * @license    http://www.gnu.org/licenses/#AGPL  GNU AFFERO GENERAL PUBLIC LICENSE 3
 */


'use strict';

require('./../public/js/gc2/geocloud.js');
require('./../public/js/gc2/gc2table.js');
require('./../public/js/vidi.js');

window.$ = window.jQuery = require('jquery');

// Hack to compile Glob files. Don´t call this function!
function ಠ_ಠ() {
    require('./i18n/*.js', {glob: true});
}

/**
 * Global i18n dict
 */
window.gc2i18n = require('./i18n/' + window._vidiLocale + '.js');

/**
 * Global var with config object
 */
window.vidiConfig = require('../config/config.js');

/**
 * Th global Vidi API
 */
window.api = {};

window.Promise = require('es6-promise').Promise;


/**
 *
 * @returns {{init: *}}
 * @constructor
 */
window.Vidi = function () {

    // Avoid 'console' errors in browsers that lack a console.
    // =======================================================

    (function () {
        var method;
        var noop = function () {
        };
        var methods = [
            'assert', 'clear', 'count', 'debug', 'dir', 'dirxml', 'error',
            'exception', 'group', 'groupCollapsed', 'groupEnd', 'info', 'log',
            'markTimeline', 'profile', 'profileEnd', 'table', 'time', 'timeEnd',
            'timeStamp', 'trace', 'warn'
        ];
        var length = methods.length;
        var console = (window.console = window.console || {});

        while (length--) {
            method = methods[length];

            // Only stub undefined methods.
            if (!console[method]) {
                console[method] = noop;
            }
        }
    }());

    // Set widow.status after 300 secs.
    // This should be set in "loading.js"
    // when all layers are loaded. Used in print.
    // ==========================================

    setTimeout(function () {
        window.status = "all_loaded";
        console.info("load_timeout");
    }, 300000);

    // Require the standard modules
    // ============================

    var modules = {
        init: require('./modules/init'),
        socketId: require('./modules/socketId'),
        urlparser: require('./modules/urlparser'),
        cloud: require('./modules/cloud'),
        switchLayer: require('./modules/switchLayer'),
        setBaseLayer: require('./modules/setBaseLayer'),
        meta: require('./modules/meta'),
        layerTree: require('./modules/layerTree'),
        layers: require('./modules/layers'),
        setting: require('./modules/setting'),
        baseLayer: require('./modules/baseLayer'),
        legend: require('./modules/legend'),
        state: require('./modules/state'),
        stateSnapshots: require('./modules/stateSnapshots'),
        anchor: require('./modules/anchor'),
        infoClick: require('./modules/infoClick'),
        bindEvent: require('./modules/bindEvent'),
        draw: require('./modules/draw'),
        measurements: require('./modules/measurements'),
        mapcontrols: require('./modules/mapcontrols'),
        tilecache: require('./modules/tileCache'),
        print: require('./modules/print'),
        advancedInfo: require('./modules/advancedInfo'),
        sqlQuery: require('./modules/sqlQuery'),
        serializeLayers: require('./modules/serializeLayers'),
        pushState: require('./modules/pushState'),
        backboneEvents: require('./modules/backboneEvents'),
        utils: require('./modules/utils'),
        //loading: require('./modules/loading'),
        reset: require('./modules/reset'),
        configSwitcher: require('./modules/configSwitcher'),
        extensions: {},
        search: {}
    };

    // Use the setters in modules so they can interact
    // ===============================================

    modules.init.set(modules);
    modules.cloud.set(modules);
    modules.socketId.set(modules);
    modules.meta.set(modules);
    modules.layerTree.set(modules);
    modules.layers.set(modules);
    modules.setting.set(modules);
    modules.switchLayer.set(modules);
    modules.setBaseLayer.set(modules);
    modules.baseLayer.set(modules);
    modules.legend.set(modules);
    modules.state.set(modules);
    modules.stateSnapshots.set(modules);
    modules.anchor.set(modules);
    modules.infoClick.set(modules);
    modules.bindEvent.set(modules);
    modules.draw.set(modules);
    modules.measurements.set(modules);
    modules.mapcontrols.set(modules);
    modules.tilecache.set(modules);
    modules.print.set(modules);
    modules.advancedInfo.set(modules);
    modules.sqlQuery.set(modules);
    modules.serializeLayers.set(modules);
    modules.pushState.set(modules);
    modules.backboneEvents.set(modules);
    modules.utils.set(modules);
    //modules.loading.set(modules);
    modules.reset.set(modules);
    modules.configSwitcher.set(modules);

    // Return the init module to be called in index.html
    // =================================================

    return {
        init: modules.init
    }
};

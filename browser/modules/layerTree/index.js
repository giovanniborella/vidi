/**
 * @fileoverview Description of file, its uses and information
 * about its dependencies.
 */

'use strict';

const LOG = false;

const MODULE_NAME = `layerTree`;

var meta, layers, switchLayer, cloud, layers, legend, state, backboneEvents;

var automaticStartup = true;

var layerTreeOrder = false;

var onEachFeature = [];

var pointToLayer = [];

var onLoad = [];

var onSelect = [];

var onMouseOver = [];

var cm = [];

var styles = [];

var store = [];

var _self;

/**
 *
 * @type {*|exports|module.exports}
 */
let urlparser = require('./../urlparser');

/**
 *
 * @type {*|exports|module.exports}
 */
let makrupGenerator = require('./MarkupGenerator');

/**
 *
 * @type {*|exports|module.exports}
 */
let QueueStatisticsWatcher = require('./QueueStatisticsWatcher');

let queueStatistsics = false;

/**
 * @type {string}
 */
var db = urlparser.db;

/**
 *
 * @type {*|exports|module.exports}
 */
let APIBridgeSingletone = require('./../api-bridge');

/**
 *
 * @type {APIBridge}
 */
var apiBridgeInstance = false;

/**
 * Specifies if layer tree is ready
 */
let layerTreeIsReady = false;

/**
 * Fires when the layer tree is built
 */
let _onReady = false;

/**
 * Keeps track of changed layers
 */

const tileLayerIcon = `<i class="material-icons">border_all</i>`;

const vectorLayerIcon = `<i class="material-icons">gesture</i>`;

let layerTreeWasBuilt = false;

let editingIsEnabled = false;

let treeIsBeingBuilt = false;

let userPreferredForceOfflineMode = -1;

/**
 *
 * @type {{set: module.exports.set, init: module.exports.init}}
 */
module.exports = {
    set: function (o) {
        cloud = o.cloud;
        meta = o.meta;
        layers = o.layers;
        legend = o.legend;
        state = o.state;
        switchLayer = o.switchLayer;
        backboneEvents = o.backboneEvents;
        return this;
    },

    init: function () {
        _self = this;
        queueStatistsics = new QueueStatisticsWatcher({ switchLayer });
        apiBridgeInstance = APIBridgeSingletone((statistics, forceLayerUpdate) => {
            _self.statisticsHandler(statistics, forceLayerUpdate);
        });

        state.listenTo('layerTree', _self);
    },

    statisticsHandler: (statistics, forceLayerUpdate, skipLastStatisticsCheck) => {
        if (layerTreeWasBuilt === false || _self.isReady() == false) {
            return;
        } else {
            queueStatistsics.processStatisticsUpdate(statistics, forceLayerUpdate, skipLastStatisticsCheck, userPreferredForceOfflineMode, apiBridgeInstance);
        }
    },

    postInit: () => {
        if (layerTreeWasBuilt === false && automaticStartup) {
            _self.create();
        }
    },

    setSelectorValue: (name, type) => {
        let el = $('*[data-gc2-id="' + name.replace('v:', '') + '"]');
        if (type === 'tile') {
            el.data('gc2-layer-type', 'tile');
            el.closest('.layer-item').find('.js-dropdown-label').first().html(tileLayerIcon);
        } else if (type === 'vector') {
            el.data('gc2-layer-type', 'vector');
            el.closest('.layer-item').find('.js-dropdown-label').first().html(vectorLayerIcon);
        } else {
            throw new Error('Invalid type was provided');
        }
    },


    /**
     * Returns layers order in corresponding groups
     * 
     * @return {Promise}
     */
    getLayersOrder: () => {
        let result = new Promise((resolve, reject) => {
            state.getModuleState(MODULE_NAME).then(initialState => {
                let order = ((initialState && `order` in initialState) ? initialState.order : false);
                resolve(order);
            });
        });

        return result;
    },

    /**
     * Returns last available layers order
     * 
     * @return {Promise}
     */
    getLatestLayersOrder: () => {
        return layerTreeOrder;
    },

    isReady: () => {
        return layerTreeIsReady;
    },

    _createToggleOfflineModeControl() {
        let toggleOfllineOnlineMode = $(makrupGenerator.getToggleOfflineModeSelectorDisabled());
        if (`serviceWorker` in navigator) {
            toggleOfllineOnlineMode = $(makrupGenerator.getToggleOfflineModeSelectorEnabled());

            if (apiBridgeInstance.offlineModeIsEnforced()) {
                $(toggleOfllineOnlineMode).find('.js-toggle-offline-mode').prop('checked', true);
            }

            $(toggleOfllineOnlineMode).find('.js-toggle-offline-mode').change(event => {
                if ($(event.target).is(':checked')) {
                    apiBridgeInstance.setOfflineMode(true);
                } else {
                    apiBridgeInstance.setOfflineMode(false);
                }

                userPreferredForceOfflineMode = $(event.target).is(':checked');
            });
        }

        return toggleOfllineOnlineMode;
    },

    /**
     * Creating request for building the tree.
     * In order to avoid race condition as simultaneous calling of run() the pending create()
     * requests are performed one by one.
     */
    create: (forcedState = false, createdByEditor = false) => {
        if (LOG) console.log(`${MODULE_NAME}: create`, forcedState, createdByEditor);

        queueStatistsics.setLastStatistics(false);

        if (editingIsEnabled === false && createdByEditor) {
            editingIsEnabled = true;
        }

        let result = false;
        if (treeIsBeingBuilt) {
            result = new Promise((resolve, reject) => {
                setTimeout(() => {
                    _self.create(forcedState, createdByEditor).then(() => {
                        resolve();
                    })
                }, 1000);
            });
        } else {
            layerTreeWasBuilt = true;
            treeIsBeingBuilt = true;
            result = new Promise((resolve, reject) => {
                if (LOG) console.log(`${MODULE_NAME}: started building the tree`);

                /*
                    Some layers are already shown, so they need to be checked in order
                    to stay in tune with the map. Those are different from the activeLayers,
                    which are defined externally via forcedState only.
                */
                let precheckedLayers = layers.getMapLayers();

                layerTreeIsReady = false;
                if (forcedState) {
                    if (LOG) console.log(`${MODULE_NAME}: disabling active layers`, _self.getActiveLayers());

                    _self.getActiveLayers().map(item => {
                        // Disabling active layers
                        switchLayer.init(item, false, true, false);
                    });
                }

                // Emptying the tree
                $("#layers").empty();

                _self.getLayersOrder().then(order => {

                    try {


                    let activeLayers = [];
                    if (forcedState) {
                        order = forcedState.order;
                        if (`activeLayers` in forcedState) {
                            activeLayers = forcedState.activeLayers;
                        }

                        let layersThatAreNotInMeta = [];
                        let existingMeta = meta.getMetaData();
                        if (`data` in existingMeta) {
                            activeLayers.map(layerName => {
                                let correspondingMeta = false;
                                existingMeta.data.map(layer => {
                                    if (layer.f_table_schema + '.' + layer.f_table_name === layerName.replace(`v:`, ``)) {
                                        correspondingMeta = layer;
                                    }
                                });

                                if (correspondingMeta === false) {
                                    layersThatAreNotInMeta.push(layerName.replace(`v:`, ``));
                                }
                            });
                        }

                        if (LOG) console.log(`${MODULE_NAME}: layers that are not in meta`, layersThatAreNotInMeta);

                        if (layersThatAreNotInMeta.length > 0) {
                            let layerFeatchPromises = [];
                            layersThatAreNotInMeta.map(item => {
                                layerFeatchPromises.push(switchLayer.init(item, true));
                            });

                            Promise.all(layerFeatchPromises).then(() => {
                                backboneEvents.get().trigger(`${MODULE_NAME}:activeLayersChange`);
                            });
                        }
                    }

                    layerTreeOrder = order;

                    var base64GroupName, groups, metaData, i, l, count;

                    if (editingIsEnabled) {
                        let toggleOfllineOnlineMode = _self._createToggleOfflineModeControl();
                        if (toggleOfllineOnlineMode) {
                            $("#layers").append(toggleOfllineOnlineMode);
                        }
                    }

                    groups = [];

                    // Getting set of all loaded vectors
                    metaData = meta.getMetaData();
                    for (i = 0; i < metaData.data.length; ++i) {
                        groups[i] = metaData.data[i].layergroup;
                    }

                    let notSortedGroupsArray = array_unique(groups.reverse());
                    metaData.data.reverse();

                    let arr = notSortedGroupsArray;
                    if (order) {
                        arr = _self.sortGroups(order, notSortedGroupsArray);
                    }

                    $("#layers").append(`<div id="layers_list"></div>`);
                    // Filling up groups and underlying layers (except ungrouped ones)
                    for (i = 0; i < arr.length; ++i) {
                        if (arr[i] && arr[i] !== "<font color='red'>[Ungrouped]</font>") {
                            let numberOfActiveLayers = 0;
                            l = [];
                            base64GroupName = Base64.encode(arr[i]).replace(/=/g, "");

                            // Add group container
                            // Only if container doesn't exist
                            // ===============================
                            if ($("#layer-panel-" + base64GroupName).length === 0) {
                                $("#layers_list").append(makrupGenerator.getGroupPanel(base64GroupName, arr[i]));

                                // Append to inner group container
                                // ===============================
                                $("#group-" + base64GroupName).append(`<div id="collapse${base64GroupName}" class="accordion-body collapse"></div>`);
                            }

                            // Get layers that belong to the current layer group
                            let notSortedLayersForCurrentGroup = [];
                            for (let u = 0; u < metaData.data.length; ++u) {
                                if (metaData.data[u].layergroup == arr[i]) {
                                    notSortedLayersForCurrentGroup.push(metaData.data[u]);
                                }
                            }

                            let layersForCurrentGroup = _self.sortLayers(order, notSortedLayersForCurrentGroup, arr[i]);

                            // Add layers
                            // ==========
                            for (var u = 0; u < layersForCurrentGroup.length; ++u) {
                                let localLayer = layersForCurrentGroup[u];

                                let layerIsActive = false;
                                let activeLayerName = false;
                                // If activeLayers are set, then no need to sync with the map
                                if (!forcedState) {
                                    if (precheckedLayers && Array.isArray(precheckedLayers)) {
                                        precheckedLayers.map(item => {
                                            if (item.id && item.id === `${localLayer.f_table_schema}.${localLayer.f_table_name}`
                                                || item.id && item.id === `v:${localLayer.f_table_schema}.${localLayer.f_table_name}`) {
                                                layerIsActive = true;
                                                activeLayerName = item.id;
                                                numberOfActiveLayers++;
                                            }
                                        });
                                    }
                                }

                                _self.generateLayerRecord(localLayer, forcedState, precheckedLayers, base64GroupName, layerIsActive, activeLayerName);
                                l.push({});
                            }

                            $("#collapse" + base64GroupName).sortable({
                                axis: 'y',
                                stop: (event, ui) => {
                                    _self.calculateOrder();
                                    backboneEvents.get().trigger(`${MODULE_NAME}:sorted`);
                                    layers.reorderLayers();
                                }
                            });
                            
                            if (!isNaN(parseInt($($("#layer-panel-" + base64GroupName + " .layer-count span")[1]).html()))) {
                                count = parseInt($($("#layer-panel-" + base64GroupName + " .layer-count span")[1]).html()) + l.length;
                            } else {
                                count = l.length;
                            }

                            $("#layer-panel-" + base64GroupName + " span:eq(1)").html(count);
                            // Remove the group if empty
                            if (l.length === 0) {
                                $("#layer-panel-" + base64GroupName).remove();
                            }

                            if (numberOfActiveLayers > 0) {
                                $("#layer-panel-" + base64GroupName + " span:eq(0)").html(numberOfActiveLayers);
                            }
                        }
                    }

                    $(`#layers_list`).sortable({
                        axis: 'y',
                        stop: (event, ui) => {
                            _self.calculateOrder();
                            backboneEvents.get().trigger(`${MODULE_NAME}:sorted`);
                            layers.reorderLayers();
                        }
                    });

                    if (queueStatistsics.getLastStatistics()) {
                        _self.statisticsHandler(queueStatistsics.getLastStatistics(), false, true);
                    }

                    layers.reorderLayers();
                    state.listen(MODULE_NAME, `sorted`);
                    state.listen(MODULE_NAME, `activeLayersChange`);
                    
                    backboneEvents.get().trigger(`${MODULE_NAME}:sorted`);
                    setTimeout(() => {
                        if (LOG) console.log(`${MODULE_NAME}: active layers`, activeLayers);

                        if (activeLayers) {   
                            activeLayers.map(layerName => {
                                if ($(`[data-gc2-layer-key="${layerName.replace('v:', '')}.the_geom"]`).find(`.js-layer-type-selector-tile`).length === 1 &&
                                    $(`[data-gc2-layer-key="${layerName.replace('v:', '')}.the_geom"]`).find(`.js-layer-type-selector-vector`).length === 1) {
                                    if (layerName.indexOf(`v:`) === 0) {
                                        $(`[data-gc2-layer-key="${layerName.replace('v:', '')}.the_geom"]`).find(`.js-layer-type-selector-vector`).trigger(`click`, [{doNotLegend: true}]);
                                    } else {
                                        $(`[data-gc2-layer-key="${layerName.replace('v:', '')}.the_geom"]`).find(`.js-layer-type-selector-tile`).trigger(`click`, [{doNotLegend: true}]);
                                    }
                                } else {
                                    $(`#layers`).find(`input[data-gc2-id="${layerName.replace('v:', '')}"]`).trigger('click', [{doNotLegend: true}]);
                                }
                            });

                            legend.init();
                        }

                        layerTreeIsReady = true;
                        treeIsBeingBuilt = false;
                        backboneEvents.get().trigger(`${MODULE_NAME}:ready`);
                        backboneEvents.get().trigger(`${MODULE_NAME}:activeLayersChange`);

                        if (LOG) console.log(`${MODULE_NAME}: finished building the tree`);

                        resolve();
                    }, 1000);


                }catch(e) {
                    console.log(e);
                }


                });
            });
        }

        return result;
    },

    /**
     * Generates separate layer control record
     * 
     * @returns {void}
     */
    generateLayerRecord: (layer, forcedState, precheckedLayers, base64GroupName, layerIsActive, activeLayerName) => {
        let displayInfo;
        let text = (layer.f_table_title === null || layer.f_table_title === "") ? layer.f_table_name : layer.f_table_title;

        if (layer.baselayer) {
            $("#base-layer-list").append(`<div class='list-group-item'>
                <div class='row-action-primary radio radio-primary base-layer-item' data-gc2-base-id='${layer.f_table_schema}.${layer.f_table_name}'>
                    <label class='baselayer-label'>
                        <input type='radio' name='baselayers'>${text}<span class='fa fa-check' aria-hidden='true'></span>
                    </label>
                </div>
            </div>`);
        } else {
            let layerIsTheTileOne = true;
            let layerIsTheVectorOne = false;
                                        
            let singleTypeLayer = true;
            let selectorLabel = tileLayerIcon;
            let defaultLayerType = 'tile';

            let layerIsEditable = false;
            if (layer && layer.meta) {
                let parsedMeta = JSON.parse(layer.meta);
                if (parsedMeta && typeof parsedMeta === `object`) {
                    if (`vidi_layer_editable` in parsedMeta && parsedMeta.vidi_layer_editable) {
                        layerIsEditable = true;
                    }

                    if (`meta_desc` in parsedMeta) {
                        displayInfo = (parsedMeta.meta_desc || layer.f_table_abstract) ? "visible" : "hidden";
                    }

                    if (`vidi_layer_type` in parsedMeta && ['v', 'tv', 'vt'].indexOf(parsedMeta.vidi_layer_type) !== -1) {
                        layerIsTheVectorOne = true;
                        singleTypeLayer = false;

                        if (parsedMeta.vidi_layer_type === 'v') {
                            defaultLayerType = 'vector';
                            selectorLabel = vectorLayerIcon;
                            singleTypeLayer = true;
                            layerIsTheTileOne = false;
                        }
                    }
                }
            }

            if (layerIsActive) {
                if (activeLayerName.indexOf(`v:`) === 0) {
                    selectorLabel = vectorLayerIcon;
                    defaultLayerType = 'vector';
                }
            }

            let layerKey = layer.f_table_schema + "." + layer.f_table_name;
            let layerKeyWithGeom = layerKey + "." + layer.f_geometry_column;

            if (layerIsTheVectorOne) {
                store['v:' + layerKey] = new geocloud.sqlStore({
                    jsonp: false,
                    method: "POST",
                    host: "",
                    db: db,
                    uri: "/api/sql",
                    clickable: true,
                    id: 'v:' + layerKey,
                    name: 'v:' + layerKey,
                    lifetime: 0,
                    styleMap: styles['v:' + layerKey],
                    sql: "SELECT * FROM " + layer.f_table_schema + "." + layer.f_table_name + " LIMIT 500",
                    onLoad: (l) => {
                        if (l === undefined) return;
                        $('*[data-gc2-id-vec="' + l.id + '"]').parent().siblings().children().removeClass("fa-spin");

                        layers.decrementCountLoading(l.id);
                        backboneEvents.get().trigger("doneLoading:layers", l.id);
                    },
                    transformResponse: (response, id) => {
                        return apiBridgeInstance.transformResponseHandler(response, id);
                    },
                    onEachFeature: onEachFeature['v:' + layerKey]
                });
            }

            let lockedLayer = (layer.authentication === "Read/write" ? " <i class=\"fa fa-lock gc2-session-lock\" aria-hidden=\"true\"></i>" : "");

            let layerTypeSelector = false;
            if (singleTypeLayer) {
                if (layerIsTheTileOne) {
                    layerTypeSelector = `<div style="display: inline-block; vertical-align: middle;">
                        ${tileLayerIcon}
                    </div>`;
                } else if (layerIsTheVectorOne) {
                    layerTypeSelector = `<div style="display: inline-block; vertical-align: middle;">
                        ${vectorLayerIcon}
                    </div>`;
                }
            } else {
                layerTypeSelector = makrupGenerator.getLayerTypeSelector(selectorLabel, tileLayerIcon, vectorLayerIcon);
            }

            let addButton = ``;
            if (editingIsEnabled && layerIsEditable) {
                addButton = makrupGenerator.getAddButton(layerKeyWithGeom);
            }

            let layerControlRecord = $(makrupGenerator.getLayerControlRecord(layerKeyWithGeom, layerKey, layerIsActive,
                layer, defaultLayerType, layerTypeSelector, text, lockedLayer, addButton, displayInfo));

            $(layerControlRecord).find('.js-layer-type-selector-tile').first().on('click', (e, data) => {
                let switcher = $(e.target).closest('.layer-item').find('.js-show-layer-control');
                $(switcher).data('gc2-layer-type', 'tile');
                $(switcher).prop('checked', true);
                _self.reloadLayer($(switcher).data('gc2-id'), false, (data ? data.doNotLegend : false));
                $(e.target).closest('.layer-item').find('.js-dropdown-label').html(tileLayerIcon);
                backboneEvents.get().trigger(`${MODULE_NAME}:activeLayersChange`);
            });

            $(layerControlRecord).find('.js-layer-type-selector-vector').first().on('click', (e, data) => {
                let switcher = $(e.target).closest('.layer-item').find('.js-show-layer-control');
                $(switcher).data('gc2-layer-type', 'vector');
                $(switcher).prop('checked', true);
                _self.reloadLayer('v:' + $(switcher).data('gc2-id'), false, (data ? data.doNotLegend : false));
                $(e.target).closest('.layer-item').find('.js-dropdown-label').html(vectorLayerIcon);
                backboneEvents.get().trigger(`${MODULE_NAME}:activeLayersChange`);
            });

            $("#collapse" + base64GroupName).append(layerControlRecord);   
        }
    },


    /**
     * Sorts groups according to defined order (not all groups
     * can be present in order definition).
     * 
     * @returns {Array}
     */
    sortGroups: (order, notSortedGroupsArray) => {
        let result = [];
        for (let key in order) {
            let item = order[key];
            let sortedElement = false;
            for (let i = (notSortedGroupsArray.length - 1); i >= 0; i--) {
                if (item.id === notSortedGroupsArray[i]) {
                    sortedElement = notSortedGroupsArray.splice(i, 1);
                    break;
                }
            }

            if (sortedElement) {
                result.push(item.id);
            }
        }

        if (notSortedGroupsArray.length > 0) {
            for (let j = 0; j < notSortedGroupsArray.length; j++) {
                result.push(notSortedGroupsArray[j]);
            }
        }

        return result;
    },

    /**
     * Sorts layers and their subgroups
     * 
     * @returns {Array}
     */
    sortLayers: (order, notSortedLayersForCurrentGroup, groupName) => {
        let sortedLayers = [];
        if (order) {
            let currentGroupLayersOrder = false;
            for (let key in order) {
                if (order[key].id === groupName && 'layers' in order[key]) {
                    currentGroupLayersOrder = order[key].layers;
                }
            }

            if (currentGroupLayersOrder) {
                for (let key in currentGroupLayersOrder) {
                    let item = currentGroupLayersOrder[key];
                    let sortedElement = false;
                    for (let i = (notSortedLayersForCurrentGroup.length - 1); i >= 0; i--) {
                        let layerId = notSortedLayersForCurrentGroup[i].f_table_schema + '.' + notSortedLayersForCurrentGroup[i].f_table_name;
                        if (item.id === layerId) {
                            sortedElement = notSortedLayersForCurrentGroup.splice(i, 1);
                            break;
                        }
                    }

                    if (sortedElement) {
                        sortedLayers.push(sortedElement.pop());
                    }
                }

                if (notSortedLayersForCurrentGroup.length > 0) {
                    for (let j = 0; j < notSortedLayersForCurrentGroup.length; j++) {
                        sortedLayers.push(notSortedLayersForCurrentGroup[j]);
                    }
                }
            }
        }

        /*
            There is a list of layers, some of them belong to subgroups, some of them do not
            First go to order object and find what subgroups are there, remember theirs order and order of underlying layers
            After that get all subgroups from existing layers, and match the, to the ordered ones - those that are not in order, put them afterwards
            Match meta layers of every subgroup and the order in subgroup - the meta data is more important in terms of belonging than the order

            1. Order and complete subgroups
            2. Order and complete layers inside subgroups
            3. Store as three-level hierarchy
        */

        return ((sortedLayers.length > 0) ? sortedLayers : notSortedLayersForCurrentGroup);
    },

    calculateOrder: () => {
        layerTreeOrder = [];

        $(`[id^="layer-panel-"]`).each((index, element) => {
            let id = $(element).attr(`id`).replace(`layer-panel-`, ``);
            let layers = [];
            $(`#${$(element).attr(`id`)}`).find(`#collapse${id}`).children().each((layerIndex, layerElement) => {
                let layerKey = $(layerElement).data(`gc2-layer-key`);
                let splitLayerKey = layerKey.split('.');
                if (splitLayerKey.length !== 3) {
                    throw new Error(`Invalid layer key (${layerKey})`);
                }

                layers.push({ id: `${splitLayerKey[0]}.${splitLayerKey[1]}` });
            });

            let readableId = atob(id);
            if (readableId) {
                layerTreeOrder.push({ id: readableId, layers });
            } else {
                throw new Error(`Unable to decode the layer group identifier (${id})`);
            }
        });
    },

    /**
     * Returns current module state
     */
    getState: () => {
        let activeLayers = _self.getActiveLayers();
        let state = {
            order: layerTreeOrder,
            activeLayers
        };

        return state;
    },

    /**
     * Applies externally provided state
     */
    applyState: (newState) => {
        queueStatistsics.setLastStatistics(false);
        if (newState === false) {
            newState = { order: false };
        } else if (newState.order && newState.order === 'false') {
            newState.order = false;
        }

        return _self.create(newState);
    },

    /**
     * Reloading provided layer.
     * 
     * @param {String} layerId Layer identifier
     */
    reloadLayer: (layerId, forceTileRedraw = false, doNotLegend = false) => {
        switchLayer.init(layerId, false, doNotLegend, forceTileRedraw);
        switchLayer.init(layerId, true, doNotLegend, forceTileRedraw);
    },

    /**
     * Returns list of currently enabled layers
     */
    getActiveLayers: () => {
        let activeLayerIds = [];
        $('*[data-gc2-layer-type]').each((index, item) => {
            let isEnabled = $(item).is(':checked');
            if (isEnabled) {
                if ($(item).data('gc2-layer-type') === 'tile') {
                    activeLayerIds.push($(item).data('gc2-id'));
                } else {
                    activeLayerIds.push('v:' + $(item).data('gc2-id'));
                }
            }
        });

        activeLayerIds = activeLayerIds.filter((v, i, a) => { return a.indexOf(v) === i}); 
        return activeLayerIds;
    },

    setOnEachFeature: function (layer, fn) {
        onEachFeature[layer] = fn;
    },

    setOnLoad: function (layer, fn) {
        onLoad[layer] = fn;
    },

    setOnSelect: function (layer, fn) {
        onSelect[layer] = fn;
    },

    setOnMouseOver: function (layer, fn) {
        onMouseOver[layer] = fn;
    },

    setCM: function (layer, c) {
        cm[layer] = c;
    },

    setStyle: function (layer, s) {
        styles[layer] = s;
    },

    setPointToLayer: function (layer, fn) {
        pointToLayer[layer] = fn;
    },

    setAutomatic: (value) => {
        automaticStartup = value;
    },
    
    getStores: function () {
        return store;
    },

    load: function (id) {
        store[id].load();
    }
};
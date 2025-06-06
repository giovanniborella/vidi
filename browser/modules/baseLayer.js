/*
 * @author     Martin Høgh <mh@mapcentia.com>
 * @copyright  2013-2023 MapCentia ApS
 * @license    http://www.gnu.org/licenses/#AGPL  GNU AFFERO GENERAL PUBLIC LICENSE 3
 */

'use strict';

const MODULE_NAME = `baseLayer`;

import {LAYER} from './layerTree/constants';
import layerTreeUtils from './layerTree/utils';
import {booleanIntersects, polygon} from '@turf/turf'

/**
 * @type {*|exports|module.exports}
 */
let cloud, setBaseLayer, urlparser, backboneEvents, state, setting, layers, utils;

/**
 * List with base layers added to the map. Can be got through API.
 * @type {Array}
 */
let baseLayers = [];

let _self = false;

let sideBySideControl = false;

let activeBaseLayer = false;

let activeTwoLayersModeLayer = false;

let twoLayersAtOnceEnabled = false;

let overlayOpacity = false;

let overlayLayer = false;

const TWO_LAYERS_AT_ONCE_MODES = [`side-by-side`, `overlay`];

const OVERLAY_OPACITY_RANGE = [10, 90];

let currentTwoLayersAtOnceMode;
let active;
let mode;
let defaultMode;
let bindEvent;
let bounds;

/**
 * Checks if the module state has correct structure
 *
 * @param {Object} state Module state
 */
const validateModuleState = (state) => {
    return state && `twoLayersAtOnceMode` in state && TWO_LAYERS_AT_ONCE_MODES.indexOf(state.twoLayersAtOnceMode) !== -1
        && `layers` in state && Array.isArray(state.layers) && `opacity` in state
        && (state.opacity >= OVERLAY_OPACITY_RANGE[0] && state.opacity <= OVERLAY_OPACITY_RANGE[1] || state.opacity === false || state.opacity === `false`)
        && state.layers.length === 2;
};

/**
 *
 * @type {{set: module.exports.set, init: module.exports.init}}
 */
module.exports = module.exports = {
    /**
     *
     * @param o
     * @returns {exports}
     */
    set: function (o) {
        cloud = o.cloud;
        urlparser = o.urlparser;
        layers = o.layers;
        setBaseLayer = o.setBaseLayer;
        state = o.state;
        backboneEvents = o.backboneEvents;
        utils = o.utils;
        setting = o.setting;
        bindEvent = o.bindEvent;

        _self = this;
        return this;
    },
    /**
     *
     */
    init: () => {
        state.listenTo('baseLayer', _self);

        mode =  window.vidiConfig?.advancedBaseLayerSwitcher?.mode ? window.vidiConfig.advancedBaseLayerSwitcher.mode : 3;
        active = window.vidiConfig?.advancedBaseLayerSwitcher?.active;
        defaultMode = mode === 1 ? 1 : mode === 2 ? 2 : window.vidiConfig?.advancedBaseLayerSwitcher?.default ? window.vidiConfig.advancedBaseLayerSwitcher.default : 1
        currentTwoLayersAtOnceMode = TWO_LAYERS_AT_ONCE_MODES[defaultMode - 1];
        cloud.get().map.on('moveend baselayerchange', () => {
            if (bounds) {
                const b = cloud.get().map.getBounds();
                let b2;
                let outside = false;
                try {
                    b2 = polygon([[[b.getWest(), b.getSouth()], [b.getWest(), b.getNorth()], [b.getEast(), b.getNorth()], [b.getEast(), b.getSouth()], [b.getWest(), b.getSouth()]]]);
                    outside = !booleanIntersects(bounds, b2);
                } catch (e) {
                    console.log(e)
                }
                console.log(outside)
                if (outside) {
                    utils.showInfoToast(__("The selected map has no content in the current map extent"), {delay: 150000000})
                } else {
                    utils.hideInfoToast();
                }
            } else {
                utils.hideInfoToast();
            }
        })

        if (typeof window.setBaseLayers !== 'object') {
            window.setBaseLayers = [
                {"id": "osm", "name": "OSM"}
            ];
        }

        if (typeof window.vidiConfig.baseLayers === "object") {
            window.setBaseLayers = window.vidiConfig.baseLayers;
        }

        // Setting keys
        cloud.get().bingApiKey = window.bingApiKey;
        cloud.get().digitalGlobeKey = window.digitalGlobeKey;

        // Creating side-by-side mode toggle
        if (typeof window.vidiConfig.dontUseAdvancedBaseLayerSwitcher === "undefined" ||
            (typeof window.vidiConfig.dontUseAdvancedBaseLayerSwitcher === "boolean" && window.vidiConfig.dontUseAdvancedBaseLayerSwitcher === false)) {
            $("#base-layer-list").append(`
                <div class="d-grid mb-2">
                    <input class="btn-check js-two-layers-at-once-control" id="js-two-layers-at-once-control" type="checkbox">
                    <label class="btn btn-outline-secondary btn-block mb-3" for="js-two-layers-at-once-control">${__(`Display two layers at once`)}</label>
                </div>`);
        }

        // Creating js-two-layers-at-once-mode-control-container-wrapper
        $("#base-layer-list").append(`<div id ="js-two-layers-at-once-mode-control-container-wrapper"></div>`);

        $(`.js-two-layers-at-once-control`).off();
        $(`.js-two-layers-at-once-control`).change((event) => {
            $(`#js-two-layers-at-once-mode-control-container-wrapper`).find(`.js-two-layers-at-once-mode-control-container`).remove();
            twoLayersAtOnceEnabled = $(event.target).is(':checked');
            if (twoLayersAtOnceEnabled) {
                activeTwoLayersModeLayer = false;
                _self.drawBaseLayersControl();
            } else {
                _self.destroyLeafletTwoLayersAtOnceControls();
                setBaseLayer.init(activeBaseLayer);
            }

            backboneEvents.get().trigger(`${MODULE_NAME}:side-by-side-mode-change`);
        });

        backboneEvents.get().once(`allDoneLoading:layers`, () => {
            _self.getSideBySideModeStatus().then(lastState => {
                if (validateModuleState(lastState)) {
                    _self.toggleSideBySideControl(lastState);
                } else if (active) {
                    $(`.js-two-layers-at-once-control`).trigger(`click`);
                }
            })
        })

        state.listen(MODULE_NAME, `side-by-side-mode-change`);

    },

    getAvailableBaseLayers: () => {
        return window.setBaseLayers;
    },

    /**
     *
     */
    toggleSideBySideControl: (forcedState) => {
        let result = false;
        if (forcedState === false || forcedState === `false`) {
            result = new Promise((resolve, reject) => {
                if ($('.js-two-layers-at-once-control').is(':checked')) {
                    $(`.js-two-layers-at-once-control`).trigger(`click`);
                    resolve();
                } else {
                    resolve();
                }
            });
        } else {
            // Reset the side-by-side control
            _self.destroyLeafletTwoLayersAtOnceControls();

            activeTwoLayersModeLayer = false;
            twoLayersAtOnceEnabled = false;
            $(`.js-two-layers-at-once-control`).prop(`checked`, false);
            // Simulate the enabling of the side-by-side control
            result = new Promise((resolve, reject) => {
                $(`.js-two-layers-at-once-control`).trigger(`click`);
                setTimeout(() => {
                    _self.drawBaseLayersControl().then(() => {
                        $(`[name="baselayers"][value="${forcedState.layers[0]}"]`).trigger('click');
                        setTimeout(() => {
                            $(`[name="side-by-side-baselayers"][value="${forcedState.layers[1]}"]`).trigger('click');
                            setTimeout(() => {
                                overlayOpacity = forcedState.opacity;
                                if (forcedState.twoLayersAtOnceMode === TWO_LAYERS_AT_ONCE_MODES[0]) {
                                    $(`[name="two-layers-at-once-mode"][value="${forcedState.twoLayersAtOnceMode}"]`).trigger('click');
                                } else if (forcedState.twoLayersAtOnceMode === TWO_LAYERS_AT_ONCE_MODES[1]) {
                                    $(`[name="two-layers-at-once-mode"][value="${forcedState.twoLayersAtOnceMode}"]`).trigger('click');
                                }

                                resolve();
                            }, 100);
                        }, 100);
                    });
                }, 100);
            });

            return result;
        }
    },

    destroyLeafletTwoLayersAtOnceControls: () => {
        if (sideBySideControl) sideBySideControl.remove();
        sideBySideControl = false;
        overlayLayer = false;

        // Delete previously initialized side-by-side layers
        for (let key in cloud.get().map._layers) {
            if (`_vidi_twolayersatonce_sidebyside` in cloud.get().map._layers[key] && cloud.get().map._layers[key]._vidi_twolayersatonce_sidebyside) {
                cloud.get().map.removeLayer(cloud.get().map._layers[key]);
            }
        }

        // Delete previously initialized overlay layers
        for (let key in cloud.get().map._layers) {
            if (`_vidi_twolayersatonce_overlay` in cloud.get().map._layers[key] && cloud.get().map._layers[key]._vidi_twolayersatonce_overlay) {
                cloud.get().map.removeLayer(cloud.get().map._layers[key]);
            }
        }
    },

    redraw: (newBaseLayerName) => {
        activeBaseLayer = newBaseLayerName;
        _self.drawBaseLayersControl();
    },

    // get the baseLayerGroup object.
    getBaseLayerGroup() {
        return window.vidiConfig.baseLayerGroups;
    },
    // true: baseLayerGroups exists
    hasBaseLayerGroup() {
        return _self.getBaseLayerGroup() !== undefined;
    },



    // returns a array of groupName from
    baseLayerGroupNames() {
        if (!_self.hasBaseLayerGroup())
            return [];
        return _self.getBaseLayerGroup().map(group => group.groupName);
    },
    // returns array of layerIds for a group
    baseLayerGetLayersFromGroup(groupName) {
        const group = _self.getBaseLayerGroup().find(group => group.groupName === groupName);
        return group ? group.layers : null;
    },
    //  true: layerId is in a baseLayerGroup
    baseLayerIsInGroup(layerId) {
        if (!_self.hasBaseLayerGroup())
            return false;
        for (const group of _self.getBaseLayerGroup()) {
            if (group.layers.includes(layerId)) {
                return true; //group.groupName;
            }
        }
        return false;
    },
    buildLayerHtmlNode(layerId, layerName, tooltip, displayInfo, abstract, ingroup=false) {
        const sideBySideLayerControl = _self.getSideBySideLayerControl(layerId);
        return `<li class="list-group-item js-base-layer-control d-flex align-items-center${ingroup ? `px-3 border-start-0 border-end-0` : ``}">
                    <div class="d-flex align-items-center gap-1 me-auto">
                        <div class='base-layer-item' data-gc2-base-id='${layerId}'>
                            <input type='radio' class="form-check-input" name='baselayers' value='${layerId}' ${layerId === activeBaseLayer ? `checked=""` : ``}> 
                        </div>
                        ${sideBySideLayerControl}
                        <div>${layerName}</div>
                    </div>
                    <div>
                        <button
                            data-toggle="tooltip"
                            data-bs-placement="right"
                            title="${tooltip}"
                            style="visibility: ${displayInfo};"
                            data-baselayer-name="${layerName}"
                            data-baselayer-info="${abstract}"
                            class="info-label btn btn-sm btn-outline-secondary"><i class="bi bi-info-square pe-none"></i></button>
                    </div>
                </li>`;

    },

    getBaseLayerById(layerId) {
        const bl = window.setBaseLayers.find(bl => bl.id === layerId);
        return bl;
    },
    buildLayerHtmlGroupStart(groupName, open) {
        const isOpen = open ? "open='open'" : ''
        return `<li class="list-group-item js-base-layer-control align-items-center p-0"> <details ${isOpen}><summary class="py-2 px-3">${groupName}</summary>`;
    },
    buildLayerHtmlGroupEnd() {
        return '</details></li>';
    },

    buildLayerHtmlInGroup() {

        let result = '';

        for (const groupName of _self.baseLayerGroupNames()) {
            const bls = _self.baseLayerGetLayersFromGroup(groupName);
            if (!bls)
                continue;
            const isOpen = bls.includes(activeBaseLayer);
            result += _self.buildLayerHtmlGroupStart(groupName, isOpen);

            for (const layerId of bls) {
                const bl = _self.getBaseLayerById(layerId);
                if (!bl) continue;

                let displayInfo = (bl.abstract ? `visible` : `hidden`);
                let tooltip = (bl.abstract ? $(bl.abstract).text() : ``);
                result += _self.buildLayerHtmlNode(bl.id, bl.name, tooltip, displayInfo, bl.abstract, true);
            }
            result += _self.buildLayerHtmlGroupEnd();
        }
        return result;
    },

    getSideBySideLayerControl(layerId) {
        const valueContent = layerId === activeTwoLayersModeLayer ? `checked=""` : ``;
        return (twoLayersAtOnceEnabled) ?
            `<div class='base-layer-item' data-gc2-side-by-side-base-id='${layerId}' style='float: left;'>
                    <input type='radio' class="form-check-input" name='side-by-side-baselayers' value='${layerId}' ${valueContent}>
            </div>`:
            ``;
    },

    drawBaseLayersControl: () => {
        return new Promise((resolve, reject) => {
            // Resetting the side-by-side mode
            currentTwoLayersAtOnceMode = TWO_LAYERS_AT_ONCE_MODES[defaultMode - 1];

            // Delete current layers
            $(`.js-base-layer-control`).remove();
            baseLayers = [];

            // Add base layers controls, not in group
            let appendedCode = ``;
            for (const bl of window.setBaseLayers) {


                let layerId = false;
                let layerName = false;
                if (typeof bl.type !== "undefined" && bl.type === "XYZ") {
                    baseLayers.push(bl.id);
                    layerId = bl.id;
                    layerName = bl.name;
                } else if (typeof bl.restrictTo === "undefined"
                    || bl.restrictTo.filter((n) => {
                        return schemas.indexOf(n) !== -1;
                    }).length > 0) {
                    baseLayers.push(bl.id);
                    layerId = bl.id;
                    layerName = bl.name;
                }
                if (_self.baseLayerIsInGroup(layerId)) {
                    continue;
                }

                let displayInfo = (bl.abstract ? `visible` : `hidden`);
                let tooltip = (bl.abstract ? $(bl.abstract).text() : ``);
                appendedCode += _self.buildLayerHtmlNode(layerId, layerName, tooltip, displayInfo, bl.abstract);

            }
            appendedCode += _self.buildLayerHtmlInGroup();

            const disableInputs = () => {
                // Disabling inputs of side-by-side base layers
                if (activeBaseLayer) {
                    $('[name="side-by-side-baselayers"]').prop('disabled', false);
                    $(`[data-gc2-side-by-side-base-id="${activeBaseLayer}"]`).find('[name="side-by-side-baselayers"]').prop('disabled', true);
                }

                // Disabling inputs of base layers
                if (activeTwoLayersModeLayer) {
                    $(`[data-gc2-base-id]`).find('[name="baselayers"]').prop('disabled', false);
                    $(`[data-gc2-base-id="${activeTwoLayersModeLayer}"]`).find('[name="baselayers"]').prop('disabled', true);
                }
            }

            /**
             * Shows two layers side by side and reactivates the radio button controls
             */
            const drawTwoLayersAtOnce = () => {
                disableInputs();

                if (activeTwoLayersModeLayer === false) {
                    throw new Error(`Unable to detect the side-by-side layer`);
                }

                if (activeBaseLayer === activeTwoLayersModeLayer) {
                    throw new Error(`Active and side-by-side layers are the same`);
                }

                _self.destroyLeafletTwoLayersAtOnceControls();

                if (currentTwoLayersAtOnceMode === TWO_LAYERS_AT_ONCE_MODES[0]) {
                    let layer1 = _self.addBaseLayer(activeBaseLayer);
                    if (Array.isArray(layer1)) layer1 = layer1.pop();
                    layer1._vidi_twolayersatonce_sidebyside = true;
                    layer1.addTo(cloud.get().map);

                    let layer2 = _self.addBaseLayer(activeTwoLayersModeLayer);
                    if (Array.isArray(layer2)) layer2 = layer2.pop();
                    layer2._vidi_twolayersatonce_sidebyside = true;
                    layer2.addTo(cloud.get().map);

                    cloud.get().map.invalidateSize();
                    sideBySideControl = L.control.sideBySide(layer1, layer2).addTo(cloud.get().map);

                    backboneEvents.get().trigger(`${MODULE_NAME}:side-by-side-mode-change`);
                } else if (currentTwoLayersAtOnceMode === TWO_LAYERS_AT_ONCE_MODES[1]) {
                    let layer1 = _self.addBaseLayer(activeBaseLayer);
                    if (Array.isArray(layer1)) layer1 = layer1.pop();
                    layer1._vidi_twolayersatonce_overlay = true;
                    layer1.addTo(cloud.get().map);

                    let layer2 = _self.addBaseLayer(activeTwoLayersModeLayer);
                    if (Array.isArray(layer2)) layer2 = layer2.pop();
                    layer2._vidi_twolayersatonce_overlay = true;
                    layer2.addTo(cloud.get().map);

                    cloud.get().map.invalidateSize();

                    overlayLayer = layer2;
                    overlayLayer.setOpacity(overlayOpacity / 100);

                    backboneEvents.get().trigger(`${MODULE_NAME}:side-by-side-mode-change`);
                } else {
                    throw new Error(`Invalid two layers at once mode value (${currentTwoLayersAtOnceMode})`);
                }
            };

            $("#base-layer-list").append(appendedCode).promise().then(() => {
                $("#base-layer-list").find('.info-label').on('click', e => {
                    let rawHtml = $(e.target).attr(`data-baselayer-info`);
                    let layerName = $(e.target).attr(`data-baselayer-name`);
                    $("#offcanvas-layer-desc-container").html(rawHtml);
                    $("#offcanvasLayerDesc h5").html(layerName);
                    bindEvent.showOffcanvasInfo()
                    e.stopPropagation();
                });

                if (twoLayersAtOnceEnabled) {
                    disableInputs();

                    let selectedSideBySide = ``;
                    let selectedOverlay = ``;
                    if (currentTwoLayersAtOnceMode === TWO_LAYERS_AT_ONCE_MODES[0]) {
                        selectedSideBySide = `checked="checked"`;
                    } else if (currentTwoLayersAtOnceMode === TWO_LAYERS_AT_ONCE_MODES[1]) {
                        selectedOverlay = `checked="checked"`;
                    } else {
                        throw new Error(`Invalid two layers at once mode value (${currentTwoLayersAtOnceMode})`);
                    }

                    const twoLayersAtOnceModeControl = (`
                    <div class="js-two-layers-at-once-mode-control-container">
                        <div class="btn-group mb-3 d-flex ${mode !== 3 ? "d-none" : ""}">
                            <input type="radio" class="btn-check" name="two-layers-at-once-mode" id="two-layers-at-once-mode-1" ${selectedSideBySide} value="${TWO_LAYERS_AT_ONCE_MODES[0]}">
                            <label class="btn btn-sm btn-outline-secondary" for="two-layers-at-once-mode-1">${__(`Side-by-side`)}</label>
                            <input type="radio" class="btn-check" name="two-layers-at-once-mode" id="two-layers-at-once-mode-2" ${selectedOverlay} value="${TWO_LAYERS_AT_ONCE_MODES[1]}">
                            <label class="btn btn-sm btn-outline-secondary" for="two-layers-at-once-mode-2">${__(`Overlap`)}</label>
                        </div>
                        <div class="js-side-by-side-layer-opacity-slider mb-3 ${(mode !== 2 && mode !== 3) ? "d-none" : ""}"></div>
                    </div>
                    `);

                    const initiateSlider = (initialValue) => {
                        if (!(initialValue >= 10 && initialValue <= 90)) {
                            throw new Error(`Invalid initial value for slider: ${initialValue}`);
                        }

                        let sliderEl = $("#base-layer-list").find(`.js-side-by-side-layer-opacity-slider`);
                        sliderEl.empty();
                        sliderEl.append(`<div class="range"">
                                            <input type="range"  min="10" max="90" value="${initialValue}" class="js-baselayer-opacity-slider form-range">
                                            </div>`);
                        let slider = sliderEl.find('.js-baselayer-opacity-slider');
                        slider.on('input change', (e) => {
                            let sliderValue = parseFloat(e.target.value);
                            overlayOpacity = sliderValue;
                            if (overlayLayer) {
                                overlayLayer.setOpacity(sliderValue / 100);
                                backboneEvents.get().trigger(`${MODULE_NAME}:side-by-side-mode-change`);
                            }
                        });
                    };

                    $(`#base-layer-list`).find(`.js-two-layers-at-once-mode-control-container`).remove();
                    $("#js-two-layers-at-once-mode-control-container-wrapper").append(twoLayersAtOnceModeControl);
                    $("#base-layer-list").find(`input[type=radio][name=two-layers-at-once-mode]`).change(function () {
                        if (this.value === TWO_LAYERS_AT_ONCE_MODES[0]) {
                            $("#base-layer-list").find(`.js-side-by-side-layer-opacity-slider`).hide(0);
                            currentTwoLayersAtOnceMode = TWO_LAYERS_AT_ONCE_MODES[0];
                            if (activeTwoLayersModeLayer !== false) {
                                drawTwoLayersAtOnce();
                            }
                        } else if (this.value === TWO_LAYERS_AT_ONCE_MODES[1]) {
                            if (overlayOpacity === false) {
                                initiateSlider(50);
                            } else {
                                initiateSlider(overlayOpacity);
                            }

                            $("#base-layer-list").find(`.js-side-by-side-layer-opacity-slider`).show(0);
                            currentTwoLayersAtOnceMode = TWO_LAYERS_AT_ONCE_MODES[1];
                            if (activeTwoLayersModeLayer !== false) {
                                drawTwoLayersAtOnce();
                            }
                        } else {
                            throw new Error(`Invalid two layers at once mode value (${this.value})`);
                        }
                    });

                    if (currentTwoLayersAtOnceMode === TWO_LAYERS_AT_ONCE_MODES[1]) {
                        initiateSlider(50);
                    }
                }

                $(`[name="baselayers"]`).off();
                $(`[name="baselayers"]`).change(event => {
                    activeBaseLayer = $(event.target).val();
                    event.stopPropagation();

                    if ($('.js-two-layers-at-once-control').is(':checked') && activeTwoLayersModeLayer !== false) {
                        drawTwoLayersAtOnce();
                    } else {
                        setBaseLayer.init(activeBaseLayer);
                    }
                });

                $('[data-gc2-side-by-side-base-id]').off();
                $('[data-gc2-side-by-side-base-id]').change(event => {
                    activeTwoLayersModeLayer = $(event.target).closest('.base-layer-item').data('gc2-side-by-side-base-id');
                    event.stopPropagation();

                    drawTwoLayersAtOnce();
                });

                resolve();
            });
        });
    },

    /**
     * Returns layers order in corresponding groups
     *
     * @return {Promise}
     */
    getSideBySideModeStatus: () => {
        let result = new Promise((resolve, reject) => {
            state.getModuleState(MODULE_NAME).then(initialState => {
                resolve(initialState);
            });
        });

        return result;
    },

    /**
     * Returns current module state
     */
    getState: () => {
        let state = {twoLayersAtOnceMode: false};

        const getLayersIdentifiers = () => {
            let layer1Id = $('input[name=baselayers]:checked').val();
            let layer2Id = $('input[name=side-by-side-baselayers]:checked').val();
            if (!layer1Id || !layer2Id) {
                throw new Error(`Unable to detect layer identifiers (${layer1Id}, ${layer2Id}`);
            } else {
                return [layer1Id, layer2Id];
            }
        };

        if (sideBySideControl) {
            state = {
                twoLayersAtOnceMode: TWO_LAYERS_AT_ONCE_MODES[0],
                opacity: false,
                layers: getLayersIdentifiers()
            }
        }

        if (overlayLayer) {
            state = {
                twoLayersAtOnceMode: TWO_LAYERS_AT_ONCE_MODES[1],
                opacity: overlayOpacity,
                layers: getLayersIdentifiers()
            }
        }

        return state;
    },

    /**
     * Applies externally provided state
     */
    applyState: (newState) => {
        if (newState === false) {
            let availableBaseLayers = _self.getAvailableBaseLayers();
            if (Array.isArray(availableBaseLayers) && availableBaseLayers.length > 0) {
                let firstBaseLayerId = availableBaseLayers[0].id;
                return setBaseLayer.init(firstBaseLayerId).then(() => {
                    let extent = setting.getExtent();
                    if (extent !== null) {
                        cloud.get().zoomToExtent(extent);
                    } else {
                        cloud.get().zoomToExtent();
                    }

                    return _self.toggleSideBySideControl(false);
                });
            } else {
                console.error(`Unable to select first available base layer`);
            }
        } else {
            if (validateModuleState(newState)) {
                return _self.toggleSideBySideControl(newState);
            } else {
                console.error(`Invalid state object for baseLayer`);
                return _self.toggleSideBySideControl(false);
            }
        }
    },

    /**
     * Get the ids of the added base layer.
     * @returns {Array}
     */
    getBaseLayer: function () {
        return baseLayers;
    },

    /**
     *
     * @return {Object} Layer object
     */
    addBaseLayer: function (id, options = false) {
        var customBaseLayer, bl, result = false;
        for (var i = 0; i < window.setBaseLayers.length; i = i + 1) {
            bl = window.setBaseLayers[i];
            if (bl.id === id) {

                // Set defaults for base layers
                let BLattribution = bl.attribution? bl.attribution : "";
                let BLminZoom = bl.minZoom? bl.minZoom : 0;
                let BLmaxZoom = bl.maxZoom? bl.maxZoom : 20;
                let BLmaxNativeZoom = bl.maxNativeZoom? bl.maxNativeZoom : 18;


                if (bl?.type === "WMTS") {
                    result = cloud.get().addWMTSBaselayer(bl.url, {
                        name: bl.id,
                        attribution: BLattribution,
                        minZoom: BLminZoom,
                        maxZoom: BLmaxZoom,
                        maxNativeZoom: BLmaxNativeZoom,
                        baseLayer: true,
                        layer: bl.layer,
                        tileMatrixSet: bl.tileMatrixSet,
                        tileMatrixTransform: bl.tileMatrixTransform || null
                    });
                } else if (bl?.type === "MVT") {
                    result = cloud.get().addMVTBaselayer(bl.url, {
                        name: bl.id,
                        attribution: BLattribution,
                        minZoom: BLminZoom,
                        maxZoom: BLmaxZoom,
                        maxNativeZoom: BLmaxNativeZoom,
                        baseLayer: true,
                    });
                } else if (typeof bl.type !== "undefined" && bl.type === "XYZ") {
                    result = cloud.get().addXYZBaselayer(bl.url, {
                        name: bl.id,
                        attribution: BLattribution,
                        minZoom: BLminZoom,
                        maxZoom: BLmaxZoom,
                        maxNativeZoom: BLmaxNativeZoom,
                        baseLayer: true,
                    });
                } else if (typeof bl.type !== "undefined" && bl.type === "wms") {
                    result = cloud.get().addWmsBaseLayer(bl.url, {
                        name: bl.id,
                        layers: bl.layers,
                        format: 'image/png',
                        transparent: false,
                        attribution: BLattribution,
                        minZoom: BLminZoom,
                        maxZoom: BLmaxZoom,
                        maxNativeZoom: BLmaxNativeZoom,
                    });
                } else {
                    result = cloud.get().addBaseLayer(bl.id, bl.db, bl.config, bl.host || null);
                }
            }
        }

        return result;
    },

    setBounds: function (arr) {
        if (arr) {
            bounds = polygon(arr);
        } else {
            bounds = null;
        }
    }
};

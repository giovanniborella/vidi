/*
 * @author     Martin Høgh <mh@mapcentia.com>
 * @copyright  2013-2025 MapCentia ApS
 * @license    http://www.gnu.org/licenses/#AGPL  GNU AFFERO GENERAL PUBLIC LICENSE 3
 */

'use strict';

/**
 *
 * @type {*|exports|module.exports}
 */
let cloud;

/**
 *
 * @type {*|exports|module.exports}
 */
let utils;

/**
 *
 * @type {*|exports|module.exports}
 */
let backboneEvents;

/**
 *
 */
let transformPoint;


/**
 *
 * @type {string}
 */
let exId = "streetView";

/**
 *
 */
let clicktimer;

/**
 *
 */
let mapObj;



let config = require('../../../config/config.js');

let cowiUrl = config?.extensionConfig?.streetView?.cowi;
let ignorelist = config?.extensionConfig?.streetView?.ignorelist || [];
let mapillaryUrl = config?.extensionConfig?.streetView?.mapillary ||"https://www.mapillary.com/app/?z=17";

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
        cloud = o.cloud;
        utils = o.utils;
        transformPoint = o.transformPoint;
        backboneEvents = o.backboneEvents;
        return this;
    },

    /**
     *
     */
    init: function () {

        let parentThis = this;

        /**
         *
         * Native Leaflet object
         */
        mapObj = cloud.get().map;

        /**
         *
         */
        const React = require('react');

        /**
         *
         */
        const ReactDOM = require('react-dom');

        /**
         *
         */
        const dict = {

            "Info": {
                "da_DK": "Start Google Street View, Mapillary eller skråfoto op fra hvor du klikker i kortet. Servicen starter i et nyt browser vindue.",
                "en_US": "Start Google Street View, Mapillary or Oblique Photo from where you click on the map. The service starts in a new browser window."
            },

            "Street View": {
                "da_DK": "Skrå- og gadefoto",
                "en_US": "Street View"
            },

            "Choose service": {
                "da_DK": "Vælg service",
                "en_US": "Choose service"
            },

            "Activate": {
                "da_DK": "Aktiver",
                "en_US": "Activate"
            }
        };

        /**
         *
         * @param txt
         * @returns {*}
         * @private
         */
        const __ = function (txt) {
            if (dict[txt][window._vidiLocale]) {
                return dict[txt][window._vidiLocale];
            } else {
                return txt;
            }
        };

        /**
         *
         */
        class Streetview extends React.Component {
            constructor(props) {
                super(props);

                this.state = {
                    active: false,
                    selectedOption: config?.extensionConfig?.streetView?.default || "google"
                };

                this.onChange = this.onChange.bind(this);
            }

            onChange(changeEvent) {
                this.setState({
                    selectedOption: changeEvent.target.value
                });
            }

            /**
             *
             */
            componentDidMount() {
                let me = this;

                // Stop listening to any events, deactivate controls, but
                // keep effects of the module until they are deleted manually or reset:all is emitted
                backboneEvents.get().on("deactivate:all", () => {
                });

                // Activates module
                backboneEvents.get().on(`on:${exId}`, () => {
                    me.setState({
                        active: true
                    });
                    utils.cursorStyle().crosshair();
                });

                // Deactivates module
                backboneEvents.get().on(`off:${exId} off:all reset:all`, () => {
                    me.setState({
                        active: false
                    });
                    utils.cursorStyle().reset();
                });

                // Handle click events on map
                // ==========================

                mapObj.on("dblclick", function () {
                    clicktimer = undefined;
                });
                mapObj.on("click", function (e) {
                    let event = new geocloud.clickEvent(e, cloud);
                    if (clicktimer) {
                        clearTimeout(clicktimer);
                    } else {
                        if (me.state.active === false) {
                            return;
                        }

                        clicktimer = setTimeout(function () {
                            let coords = event.getCoordinate(), p, pUtm, url;
                            p = utils.transform("EPSG:3857", "EPSG:4326", JSON.parse(JSON.stringify(coords)));
                            pUtm = utils.transform("EPSG:3857", "+proj=utm +zone=32 +ellps=WGS84 +datum=WGS84 +units=m +no_defs", JSON.parse(JSON.stringify(coords)));
                            clicktimer = undefined;

                            switch (me.state.selectedOption) {
                                case "google":
                                    url = "http://maps.google.com/maps?q=&layer=c&cbll=" + p.y + "," + p.x + "&cbp=11,0,0,0,0";
                                    break;

                                case "mapillary":
                                    url = mapillaryUrl + "&lat=" + p.y + "&lng=" + p.x;
                                    break;

                                case "skraafoto":
                                    url = `https://skraafoto.dataforsyningen.dk/viewer.html?center=${pUtm.x},${pUtm.y}&orientation=north`;
                                    break;
                                case "maps":
                                    url = `https://www.google.dk/maps/@${p.y},${p.x},17z`;
                                    break;

                                case "cowi":
                                    url = cowiUrl + "&srid=4326&x=" + p.x + "&y=" + p.y;
                                    break;
                            }
                            parentThis.callBack(url);

                        }, 250);
                    }
                });
            }

            /**
             *
             * @returns {JSX.Element}
             */
            render() {
                return (
                    <div role="tabpanel">
                        <div className="form-group">
                            <div className="d-flex flex-column gap-4">
                                <span className="btn-group">
                                {ignorelist.length > 0 && !ignorelist.includes("streetview") ?
                                    <>
                                        <input className="btn-check" type="radio" id="streetview-service-activate"
                                               name="streetview-service"
                                               value="activate" checked={this.state.selectedOption === 'activate'}
                                               onChange={this.onChange}/>
                                        <label className="btn btn-sm btn-outline-secondary"
                                               htmlFor="streetview-service-activate">Street View</label>
                                    </>
                                    : null
                                }
                                {ignorelist.length > 0 && !ignorelist.includes("mapillary") ?
                                    <>
                                        <input className="btn-check" type="radio" id="streetview-service-mapillary"
                                               name="streetview-service"
                                               value="mapillary" checked={this.state.selectedOption === 'mapillary'}
                                               onChange={this.onChange}/>
                                        <label className="btn btn-sm btn-outline-secondary"
                                               htmlFor="streetview-service-mapillary">Mapillary</label>
                                    </>
                                    : null
                                }
                                {ignorelist.length > 0 && !ignorelist.includes("skraafoto") ?
                                    <>
                                        <input className="btn-check" type="radio" id="streetview-service-skraafoto"
                                               name="streetview-service"
                                               value="skraafoto" checked={this.state.selectedOption === 'skraafoto'}
                                               onChange={this.onChange}/>
                                        <label className="btn btn-sm btn-outline-secondary"
                                               htmlFor="streetview-service-skraafoto">Skråfoto</label>
                                    </>
                                    : null
                                }
                                {ignorelist.length > 0 && !ignorelist.includes("maps") ?
                                    <>
                                        <input className="btn-check" type="radio" id="streetview-service-maps"
                                               name="streetview-service"
                                               value="maps" checked={this.state.selectedOption === 'maps'}
                                               onChange={this.onChange}/>
                                        <label className="btn btn-sm btn-outline-secondary"
                                               htmlFor="streetview-service-maps">Maps</label>
                                    </>
                                    : null
                                }
                                
                                    {cowiUrl !== undefined ?
                                        <input className="btn-check" type="radio" id="streetview-service-cowi"
                                               name="streetview-service" value="cowi"
                                               checked={this.state.selectedOption === 'cowi'}
                                               onChange={this.onChange}/> : null
                                    }
                                    {cowiUrl !== undefined ?
                                        <label className="btn btn-sm btn-outline-secondary"
                                               htmlFor="streetview-service-cowi">COWI Gadefoto</label> : null
                                    }
                                </span>
                            </div>
                        </div>
                    </div>
                );
            }
        }

        utils.createMainTab(exId, __("Street View"), __("Info"), require('./../../../browser/modules/height')().max, "bi-camera", false, exId);

        // Append to DOM
        //==============
        try {

            ReactDOM.render(
                <Streetview/>,
                document.getElementById(exId)
            );
        } catch (e) {

        }

    },

    callBack: function (url) {
        utils.popupCenter(url, (utils.screen().width - 100), (utils.screen().height - 100), exId);
    },

    setCallBack: function (fn) {
        this.callBack = fn;
    }


};



/*
 * @author     Martin Høgh <mh@mapcentia.com>
 * @copyright  2013-2018 MapCentia ApS
 * @license    http://www.gnu.org/licenses/#AGPL  GNU AFFERO GENERAL PUBLIC LICENSE 3
 */

'use strict';

var proj4 = require('proj4');

proj4.defs("EPSG:25832", "+title=  ETRF89 / UTM zone 32N EPSG:25832 +proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");


module.exports = {
    set: function () {
        return this;
    },
    init: function () {
    },
    formatArea: (areaInSquareMeters) => {
        let result = Math.round(areaInSquareMeters);
        let ha = (Math.round(areaInSquareMeters / 10000 * 100) / 100);
        let km2 = (Math.round(areaInSquareMeters / 1000000 * 100) / 100);
        if (areaInSquareMeters < 10000) {
            // Display square meters
            result = (Math.round(areaInSquareMeters) + ' m2');
        } else if (areaInSquareMeters >= 10000 && areaInSquareMeters < 1000000) {
            // Display hectars
            result = (ha + ' ha');
        } else if (areaInSquareMeters >= 1000000) {
            // Display square kilometers and hectars
            result = (km2 + ' km2 (' + ha + ' ha)');
        }

        return result;
    },
    /**
     * @todo Remove deprecated "height" parameter
     */
    createMainTab: function (id, name, info, height, icon, rawIconWasProvided = false, moduleId = false) {
        let el = `#${id}-content`;

        let iconRaw = ``;
        if (rawIconWasProvided) {
            iconRaw = icon;
        } else {
            icon = icon || "help";
            iconRaw = `<i data-container="body" data-toggle="tooltip" data-placement="left" title="${name}" class="material-icons">${icon}</i>`;
        }

        if (moduleId === false) {
            moduleId = ``;
        }

        $(`<li role="presentation">
            <a data-module-id="${moduleId}" href="#${id}-content" aria-controls role="tab" data-toggle="tab">${iconRaw}${name}</a>
        </li>`).appendTo("#main-tabs");
        $(`<div role="tabpanel" class="tab-pane fade" id="${id}-content"></div>`).appendTo(".tab-content.main-content");
        $(`<div class="help-btn"><i class="material-icons help-btn">help_outline</i></div>`).appendTo(el).on("click", function () {
            $(this).next().html(`<div class="alert alert-dismissible alert-info" role="alert">
                <button type="button" class="close" data-dismiss="alert">×</button>${info}
            </div>`);
        });
        $(`<div></div>`).appendTo(el);
        $(`<div id="${id}"></div>`).appendTo(el);

    },

    createNavItem: function (id, dropdown) {
        $('<li id="' + id + '" class="' + (dropdown ? 'dropdown' : '') + '"></li>').appendTo('#main-navbar');
    },

    injectCSS: function (css) {
        $("head").append("<style>" + css + "</style>");
    },

    viewport: function () {
        return {
            width: $(document).width(),
            height: $(document).height()
        }
    },

    screen: function () {
        return {
            width: screen.width,
            height: screen.height
        }
    },

    transform: function (from, to, coordinates) {
        return proj4(from, to, coordinates);
    },

    popupCenter: function (url, width, height, name) {
        var leftPosition, topPosition;
        //Allow for borders.
        leftPosition = (window.screen.width / 2) - ((width / 2) + 10);
        //Allow for title and status bars.
        topPosition = (window.screen.height / 2) - ((height / 2) + 50);
        //Open the window.
        window.open(url, name,
            "status=no,height=" + height + ",width=" + width + ",resizable=yes,left="
            + leftPosition + ",top=" + topPosition + ",screenX=" + leftPosition + ",screenY="
            + topPosition + ",toolbar=no,menubar=no,scrollbars=no,location=no,directories=no");
    },

    cursorStyle: function () {

        return {
            crosshair: function () {
                document.getElementById('map').style.cursor = 'crosshair'
            },

            reset: function () {
                document.getElementById('map').style.cursor = ''
            }
        }

    },

    __: function (txt, dict) {

        if ((dict[txt]) && (dict[txt][window._vidiLocale])) {
            return dict[txt][window._vidiLocale];
        } else {
            return txt;
        }

    },

    fullScreen: function () {
        let elem = document.getElementsByTagName("body")[0];
        if (elem.requestFullscreen) {
            elem.requestFullscreen();
        } else if (elem.mozRequestFullScreen) {
            elem.mozRequestFullScreen();
        } else if (elem.webkitRequestFullscreen) {
            elem.webkitRequestFullscreen();
        } else if (elem.msRequestFullscreen) {
            elem.msRequestFullscreen();
        }
    }
};

/*
 * @author     Alexander Shumilov
 * @copyright  2013-2019 MapCentia ApS
 * @license    http://www.gnu.org/licenses/#AGPL  GNU AFFERO GENERAL PUBLIC LICENSE 3
 */

/**
 * File contains constants that are used across the layerTree module
 */

const LOG = false;

const MODULE_NAME = `layerTree`;

const VIRTUAL_LAYERS_SCHEMA = `virtual_layer`;

const SYSTEM_FIELD_PREFIX = `gc2_`;

const SQL_QUERY_LIMIT = 100;

const SUB_GROUP_DIVIDER = `|`;

const MAP_RESOLUTIONS = [156543.033928, 78271.516964, 39135.758482, 19567.879241, 9783.9396205,
    4891.96981025, 2445.98490513, 1222.99245256, 611.496226281, 305.748113141, 152.87405657,
    76.4370282852, 38.2185141426, 19.1092570713, 9.55462853565, 4.77731426782, 2.38865713391,
    1.19432856696, 0.597164283478, 0.298582141739, 0.149291, 0.074645535, 0.037322767, 0.018661384,
    0.009330692, 0.004665346, 0.002332673];

const MAP_RESOLUTIONS_EPSG25832 = [1638.4, 819.2, 409.6, 204.8, 102.4, 51.2, 25.6, 12.8, 6.4, 3.2, 1.6, 0.8, 0.4, 0.2, 0.1, 0.05]

/**
 * Layer type prefixes
 */
const LAYER = {
    VECTOR: `v`,
    RASTER_TILE: `t`,
    VECTOR_TILE: `mvt`,
    WEBGL: `w`
};

const LAYER_TYPE_DEFAULT = LAYER.RASTER_TILE;

/**
 * Layer type icons
 */
let icons = {};
icons[LAYER.VECTOR] = `<i class="bi bi-bounding-box"></i>`;
icons[LAYER.RASTER_TILE] = `<i class="bi bi-border-all"></i>`;
icons[LAYER.VECTOR_TILE] = `<i class="bi bi-paint-bucket"></i>`;
icons[LAYER.WEBGL] = `<i class="bi bi-gpu-card"></i>`;
const ICONS = icons;

const VECTOR_SIDE_TABLE_EL = 'vector-side-table';

const SELECTED_STYLE = {
    opacity: 1,
    weight: 5,
    dashArray: "8 5",
    lineCap: "butt",
}
const VECTOR_STYLE = () => {
    return {
        opacity: 1,
        weight: 3,
        fillColor: "blue",
        color: "blue"
    }
}

const SELECTED_ICON_SCALE = 1.3;

export {
    LOG,
    MODULE_NAME,
    VIRTUAL_LAYERS_SCHEMA,
    SYSTEM_FIELD_PREFIX,
    SQL_QUERY_LIMIT,
    LAYER,
    ICONS,
    LAYER_TYPE_DEFAULT,
    SUB_GROUP_DIVIDER,
    MAP_RESOLUTIONS,
    VECTOR_SIDE_TABLE_EL,
    SELECTED_STYLE,
    VECTOR_STYLE,
    SELECTED_ICON_SCALE,
    MAP_RESOLUTIONS_EPSG25832
};

/*
 * @author     Alexander Shumilov
 * @copyright  2013-2023 MapCentia ApS
 * @license    http://www.gnu.org/licenses/#AGPL  GNU AFFERO GENERAL PUBLIC LICENSE 3
 */

import React from 'react';
import PropTypes from 'prop-types';
import {
    EXPRESSIONS_FOR_BOOLEANS,
    EXPRESSIONS_FOR_DATES,
    EXPRESSIONS_FOR_NUMBERS,
    EXPRESSIONS_FOR_STRINGS,
    MATCHES,
    validateFilters
} from './filterUtils';
import {
    AutocompleteControl,
    BooleanControl,
    DateControl,
    DatetimeControl,
    NumberControl,
    StringControl,
    TimeControl
} from './controls';
import mustache from 'mustache';

/**
 * Layer filter component
 */
const SELECT_WIDTH = `50px`;

const STRING_TYPES = [`text`, `string`, `character`, `character varying`, `uuid`];
const NUMBER_TYPES = [`smallint`, `bigint`, `integer`, `double precision`, `numeric`, `decimal`, 'real'];
const DATE_TYPES = [`date`];
const TIME_TYPES = [`time with time zone`, `time without time zone`];
const DATETIME_TYPES = [`timestamp`, `timestamp with time zone`, `timestamp without time zone`];
const BOOLEAN_TYPES = [`boolean`];
const ALLOWED_TYPES_IN_FILTER = [].concat(STRING_TYPES).concat(NUMBER_TYPES).concat(DATETIME_TYPES).concat(DATE_TYPES).concat(TIME_TYPES).concat(BOOLEAN_TYPES).filter((v, i, a) => a.indexOf(v) === i);

const PREDEFINED_TAB = 0;
const ARBITRARY_TAB = 1;

const DUMMY_RULE = {
    fieldname: `null`,
    expression: `null`,
    value: ``
};

class VectorLayerFilter extends React.Component {
    constructor(props) {
        super(props);
        let predefinedFilters = [];
        for (let key in props.predefinedFilters) {
            predefinedFilters.push({
                name: key,
                value: props.predefinedFilters[key]
            });
        }

        let disabledPredefinedFilters = [];
        if (Array.isArray(props.disabledPredefinedFilters) && props.disabledPredefinedFilters.length > 0) {
            props.disabledPredefinedFilters.map(item => {
                let filterExists = false;
                predefinedFilters.map(filter => {
                    if (filter.name === item) {
                        filterExists = true;
                    }
                });

                if (filterExists) {
                    disabledPredefinedFilters.push(item);
                } else {
                    console.warn(`Unrecognized filter ${item} for ${props.layerKey}`);
                }
            });
        }

        let arbitraryFilters = props.arbitraryFilters || {};
        if (!(`match` in arbitraryFilters)) arbitraryFilters[`match`] = (props.layerMeta && `default_match` in props.layerMeta && MATCHES.indexOf(props.layerMeta.default_match) > -1 ? props.layerMeta.default_match : MATCHES[0]);
        if (!(`columns` in arbitraryFilters)) arbitraryFilters[`columns`] = [];

        if (this.props.presetFilters.length > 0) {
            this.props.presetFilters.map(item => {
                let filterIsAlreadySet = false;
                arbitraryFilters.columns.map(alreadyExistingFilterItem => {
                    if (alreadyExistingFilterItem.fieldname === item.field) {
                        filterIsAlreadySet = true;
                    }
                });

                if (filterIsAlreadySet === false) {
                    arbitraryFilters.columns.push({
                        fieldname: item.field,
                        expression: item.operator,
                        value: ``,
                        restriction: this.props.layer.fields[item.field].restriction || false
                    });
                }
            });
        } else if (arbitraryFilters.columns.length === 0) {
            arbitraryFilters.columns.push(DUMMY_RULE);
        }

        // Validating the arbitraryFilters structure
        validateFilters(arbitraryFilters);

        this.state = {
            activeTab: PREDEFINED_TAB,
            layer: props.layer,
            arbitraryFilters,
            predefinedFilters,
            disabledPredefinedFilters,
            editorFilters: props.editorFilters,
            editorFiltersActive: props.editorFiltersActive,
            downLoadFormat: 'geojson'
        };
    }

    onRuleDelete(index) {
        let filters = this.state.arbitraryFilters;
        filters.columns.splice(index, 1);
        this.setState({arbitraryFilters: filters});
    }

    onRuleAdd() {
        let filters = this.state.arbitraryFilters;
        filters.columns.push(DUMMY_RULE);
        this.setState({arbitraryFilters: filters});
    }

    onRulesApply() {
        this.props.onApplyArbitrary({
            layerKey: (this.props.layer.f_table_schema + `.` + this.props.layer.f_table_name),
            filters: JSON.parse(JSON.stringify(this.state.arbitraryFilters))
        });
    }

    onRulesClear() {
        let layerKey = this.props.layer.f_table_schema + `.` + this.props.layer.f_table_name;
        this.props.onDisableArbitrary(layerKey);
        this.props.onApplyArbitrary({
            layerKey: layerKey,
            filters: {
                match: `any`,
                columns: []
            }
        });
    }

    changeMatchType(value) {
        let filters = JSON.parse(JSON.stringify(this.state.arbitraryFilters));
        filters.match = value;
        this.setState({arbitraryFilters: filters});
    }

    getExpressionSetForType(type) {
        let expressionSet = EXPRESSIONS_FOR_STRINGS;
        if (NUMBER_TYPES.indexOf(type) !== -1) {
            expressionSet = EXPRESSIONS_FOR_NUMBERS;
        } else if (DATE_TYPES.indexOf(type) !== -1 || DATETIME_TYPES.indexOf(type) !== -1 || TIME_TYPES.indexOf(type) !== -1) {
            expressionSet = EXPRESSIONS_FOR_DATES;
        } else if (BOOLEAN_TYPES.indexOf(type) !== -1) {
            expressionSet = EXPRESSIONS_FOR_BOOLEANS;
        }

        return expressionSet;
    }

    changeFieldname(value, columnIndex) {
        let filters = JSON.parse(JSON.stringify(this.state.arbitraryFilters));

        // Check if current expression is valid against new fieldname type
        for (let key in this.state.layer.fields) {
            if (key === value) {
                let type = this.state.layer.fields[key].type;
                let expressionSet = this.getExpressionSetForType(type);
                if (expressionSet.indexOf(filters.columns[columnIndex].expression) === -1) {
                    filters.columns[columnIndex].expression = expressionSet[0];
                }

                if (this.state.layer.fields[key].restriction) {
                    filters.columns[columnIndex].restriction = this.state.layer.fields[key].restriction;
                } else {
                    filters.columns[columnIndex].restriction = false;
                }
            }
        }

        filters.columns[columnIndex].value = DUMMY_RULE.value;
        filters.columns[columnIndex].fieldname = value;
        this.setState({arbitraryFilters: filters});
    }

    changeExpression(value, columnIndex) {
        let filters = JSON.parse(JSON.stringify(this.state.arbitraryFilters));
        filters.columns[columnIndex].expression = value;
        this.setState({arbitraryFilters: filters});
    }

    changeValue(value, columnIndex) {
        let filters = JSON.parse(JSON.stringify(this.state.arbitraryFilters));
        filters.columns[columnIndex].value = value;
        this.setState({arbitraryFilters: filters});
    }

    isValid(value, type) {
        value = value + "";
        let valueIsValid = false;
        if (NUMBER_TYPES.indexOf(type) === -1) {
            valueIsValid = true;
        } else {
            let intReg = /^\d+$/;
            let floatReg = /^[+-]?\d+(\.\d+)?$/;
            if ((type === `smallint` || type === `integer` || type === `bigint`) && value.match(intReg)) {
                valueIsValid = true;
            } else if ((type === `double precision` || type === `numeric` || type === `real` || type === `decimal`) && value.match(floatReg)) {
                valueIsValid = true;
            }
        }

        return valueIsValid;
    }

    changeDownLoadFormat(value) {
        this.setState({downLoadFormat: value});
    }

    /**
     * Constructing select control for column fieldname
     *
     * @param {*} column
     * @param {*} index
     * @param {*} layerKey
     */
    renderFieldControl(column, index, layerKey) {
        let columnOptions = [];
        columnOptions.push(<option key={`field_` + layerKey + `_0`} value="null">{__(`Select`)}</option>);
        let columnIndex = 1;
        let fieldconf = null;
        if (this.state.layer.fieldconf) {
            try {
                fieldconf = JSON.parse(this.state.layer.fieldconf)
            } catch (e) {
            }
        }
        for (let key in this.state.layer.fields) {
            let field = this.state.layer.fields[key];
            if ((fieldconf === null || fieldconf[key] === undefined) || (typeof fieldconf[key]["filter"] !== "undefined" && fieldconf[key]["filter"] !== true)) {
                let alias = null;
                if (fieldconf && typeof fieldconf[key] === "object" && typeof fieldconf[key]["alias"] !== "undefined") {
                    alias = fieldconf[key]["alias"];
                }
                if (ALLOWED_TYPES_IN_FILTER.indexOf(field.type) !== -1) {
                    columnOptions.push(
                        <option key={`field_` + layerKey + `_` + columnIndex} value={key}>{alias || key}</option>);
                    columnIndex++;
                }
            }
        }

        return (<select
            id={`column_select_` + layerKey + `_` + index}
            className="form-control form-control-sm"
            onChange={(event) => {
                this.changeFieldname(event.target.value, index)
            }}
            value={column.fieldname}
            style={{width: `100px`}}>{columnOptions}</select>);
    }

    /**
     * Constructing select control for expression
     *
     * @param {*} column
     * @param {*} index
     * @param {*} layerKey
     */
    renderExpressionControl(column, index, layerKey) {
        let expressionControl;
        if (column.fieldname === DUMMY_RULE.fieldname || column.expression === DUMMY_RULE.expression) {
            expressionControl = (<p></p>);
        } else {
            let expressionOptions = [];
            for (let key in this.state.layer.fields) {
                if (key === column.fieldname) {
                    let expressionSet = this.getExpressionSetForType(this.state.layer.fields[key].type);
                    expressionSet.map((expression, index) => {
                        expressionOptions.push(
                            <option key={`expression_` + layerKey + `_` + (index + 1)}
                                    value={expression}>{expression}</option>);
                    });
                }
            }

            expressionControl = (<select
                id={`expression_select_` + layerKey + `_` + index}
                className="form-control form-control-sm"
                onChange={(event) => {
                    this.changeExpression(event.target.value, index)
                }}
                value={column.expression}
                style={{width: SELECT_WIDTH}}>{expressionOptions}</select>);
        }

        return expressionControl;
    }

    switchActiveTab() {
        this.setState({activeTab: (this.state.activeTab === PREDEFINED_TAB ? ARBITRARY_TAB : PREDEFINED_TAB)});
    }

    handlePredefinedFiltersChange(event, filterName) {
        let disabledPredefinedFilters = this.state.disabledPredefinedFilters;
        if (event.target.checked && disabledPredefinedFilters.indexOf(filterName) > -1) {
            disabledPredefinedFilters.splice(disabledPredefinedFilters.indexOf(filterName), 1);
        } else {
            disabledPredefinedFilters.push(filterName);
        }

        this.setState({disabledPredefinedFilters});
        this.props.onApplyPredefined({
            layerKey: (this.props.layer.f_table_schema + `.` + this.props.layer.f_table_name),
            filters: disabledPredefinedFilters
        });
    }


    applyEditor() {
        this.props.onApplyEditor({
            layerKey: (this.props.layer.f_table_schema + `.` + this.props.layer.f_table_name),
        });
    }

    activateEditor() {
        this.setState({editorFiltersActive: event.target.checked})
        this.props.onActivateEditor({
            layerKey: (this.props.layer.f_table_schema + `.` + this.props.layer.f_table_name),
            active: event.target.checked
        });
    }

    handleReset() {
        let props = this.props;
        let arbitraryFilters = props.arbitraryFilters || {};
        let resetArbitraryFilters = {
            match: (props.layerMeta && `default_match` in props.layerMeta && MATCHES.indexOf(props.layerMeta.default_match) > -1 ? props.layerMeta.default_match : MATCHES[0]),
            columns: []
        };
        if (props.presetFilters.length === 0) {
            resetArbitraryFilters.columns.push(DUMMY_RULE);
        } else {
            arbitraryFilters.columns.forEach((a) => {
                props.presetFilters.forEach((p) => {
                    if (p.field === a.fieldname) {
                        resetArbitraryFilters.columns.push({fieldname: p.field, expression: p.operator, value: ""});
                    }
                })
            })
        }
        // Validating the arbitraryFilters structure
        validateFilters(resetArbitraryFilters);
        this.onRulesClear();
        this.setState({arbitraryFilters: resetArbitraryFilters});
    }

    handleFitBounds() {
        this.props.onApplyFitBounds(this.props.layer.f_table_schema + `.` + this.props.layer.f_table_name);
    }

    handleDownload(e) {
        e.preventDefault();
        const format = e.target.getAttribute("data-format");
        this.props.onApplyDownload(this.props.layer.f_table_schema + `.` + this.props.layer.f_table_name, format);
    }

    render() {
        let allRulesAreValid = true;
        let layerKey = this.state.layer.f_table_schema + '.' + this.state.layer.f_table_name;

        let matchSelectorOptions = [];
        MATCHES.map((match, index) => {
            matchSelectorOptions.push(<option key={`match_` + index} value={match}>{__(match)}</option>);
        });
        let matchSelector = (<select
            id={`match_select_` + layerKey}
            onChange={(event) => {
                this.changeMatchType(event.target.value)
            }}
            value={this.state.arbitraryFilters.match}
            className="form-control form-control-sm" style={{
            display: `inline`,
            width: SELECT_WIDTH
        }}>{matchSelectorOptions}</select>);

        let filterControls = [];

        if (this.state.arbitraryFilters.columns.length === 0) {
            allRulesAreValid = false;
        }

        this.state.arbitraryFilters.columns.map((column, index) => {
            let type = false;
            for (let key in this.state.layer.fields) {
                if (key === column.fieldname) {
                    type = this.state.layer.fields[key].type;
                }
            }

            let fieldControl = this.renderFieldControl(column, index, layerKey);
            let expressionControl = this.renderExpressionControl(column, index, layerKey);

            let valueIsValid = false;
            if (column.fieldname && column.fieldname !== 'null' && column.expression && column.expression !== 'null' && column.value) {
                valueIsValid = this.isValid(column.value, type);
            }

            let ruleValidityIndicator = (<span style={{color: 'green'}}><i className="bi bi-check-circle"></i></span>);
            if (!valueIsValid) {
                ruleValidityIndicator = (<span style={{color: 'red'}}><i className="bi bi-slash-circle"></i></span>);
                allRulesAreValid = false;
            }

            /**
             * Different control for different types
             */
            let control = false;
            if (column.fieldname !== DUMMY_RULE.fieldname) {
                let id = (`expression_input_` + layerKey + `_` + index);
                const changeHandler = (value) => {
                    this.changeValue(value, index);
                };

                let fieldconf = null;
                if (this.state.layer.fieldconf) {
                    try {
                        fieldconf = JSON.parse(this.state.layer.fieldconf)
                    } catch (e) {
                    }
                }

                if (STRING_TYPES.indexOf(type) !== -1 && fieldconf && fieldconf[column.fieldname] && fieldconf[column.fieldname].autocomplete) {
                    control = (
                        <AutocompleteControl id={id} value={column.value} layerKey={layerKey} field={column.fieldname}
                                             restriction={column.restriction} db={this.props.db}
                                             onChange={changeHandler}/>);
                } else if (STRING_TYPES.indexOf(type) !== -1) {
                    control = (
                        <StringControl id={id} value={column.value} restriction={column.restriction}
                                       onChange={changeHandler}/>);
                } else if (NUMBER_TYPES.indexOf(type) !== -1) {
                    control = (
                        <NumberControl id={id} value={column.value} restriction={column.restriction}
                                       onChange={changeHandler}/>);
                } else if (DATE_TYPES.indexOf(type) !== -1) {
                    control = (<DateControl id={id} value={column.value} onChange={changeHandler}/>);
                } else if (DATETIME_TYPES.indexOf(type) !== -1) {
                    control = (<DatetimeControl id={id} value={column.value} onChange={changeHandler}/>);
                } else if (TIME_TYPES.indexOf(type) !== -1) {
                    control = (<TimeControl id={id} value={column.value} onChange={changeHandler}/>);
                } else if (BOOLEAN_TYPES.indexOf(type) !== -1) {
                    control = (<BooleanControl id={id} value={column.value} onChange={changeHandler}/>);
                } else {
                    throw new Error(`Unrecognized type`);
                }
            }

            filterControls.push(<div key={`column_` + index} className="d-flex align-items-center gap-1">
                <div className="form-group">
                    <button className="btn btn-light btn-sm" type="button"
                            onClick={this.onRuleDelete.bind(this, index)}
                            style={{display: this.props.isFilterImmutable ? "none" : "inline"}}>
                        <i className="bi bi-dash"></i>
                    </button>
                </div>
                <div className="form-group">{fieldControl}</div>
                <div className="form-group">{expressionControl}</div>
                <div className="form-group flex-fill">{control}</div>
                <div className="d-flex align-items-center">{ruleValidityIndicator}</div>
            </div>);
        });

        /**
         * Builds the arbitrary filters tab
         */
        const buildArbitraryTab = () => {

            /**
             * Build notification about the existing children
             */
            const childrenInfo = () => {
                let result = false;
                if (this.state.layer.children && Array.isArray(this.state.layer.children)) {
                    let records = [];
                    this.state.layer.children.map((item, index) => {
                        if (item.rel && item.parent_column && item.child_column) {
                            records.push(
                                <li key={`child_record_${index}`}
                                    style={{fontFamily: `"Courier New", Courier, monospace`}}>
                                    {layerKey}.{item.parent_column} - {item.rel}.{item.child_column}
                                </li>);
                        }
                    });

                    result = (
                        <div style={{borderBottom: `1px solid #c4c4c4`, paddingBottom: `10px`, marginBottom: `6px`}}>
                            <p>{__(`Layer has following children`)}:</p>
                            <ul>{records}</ul>
                        </div>);
                }

                return result;
            };

            return (
                <div className="js-arbitrary-filters gap-1 d-flex flex-column mb-2"
                     style={this.state.editorFiltersActive ? {
                         pointerEvents: "none",
                         opacity: "0.2"
                     } : {}}>
                    <div className="form-group" style={{display: this.props.isFilterImmutable ? "none" : "inline"}}>
                        {__(`Match`)} {matchSelector} {__(`of the following`)}
                    </div>
                    <div className="d-flex flex-column gap-1">{filterControls}</div>
                    <div className="d-flex gap-1">
                        <button className="btn btn-light btn-sm" type="button" onClick={this.onRuleAdd.bind(this)}
                                style={{display: this.props.isFilterImmutable ? "none" : "inline"}}>
                            <i className="bi bi-plus"></i>
                        </button>
                        <button className="btn btn-outline-success btn-sm" type="button" disabled={!allRulesAreValid}
                                onClick={this.onRulesApply.bind(this)}>
                            <i className="bi bi-check"></i><span className="d-none d-lg-inline"> {__(`Apply`)}</span>
                        </button>
                        <button className="btn btn-light btn-sm" type="button" onClick={this.onRulesClear.bind(this)}>
                            <i className="bi bi-eraser"></i><span className="d-none d-lg-inline"> {__(`Disable`)}</span>
                        </button>
                        {buildResetButton()}
                    </div>
                </div>
            );
        }

        /**
         * Builds the predefined filters tab
         */
        const buildPredefinedTab = () => {
            let predefinedFiltersTab = [];
            this.state.predefinedFilters.map((item, index) => {
                let filterIsActive = (this.state.disabledPredefinedFilters.indexOf(item.name) === -1);
                const id = `tile_filter_` + (this.props.layer.f_table_schema + `.` + this.props.layer.f_table_name);
                predefinedFiltersTab.push(
                    <div key={`tile_filter_` + index} style={this.state.editorFiltersActive ? {
                        pointerEvents: "none",
                        opacity: "0.2"
                    } : {}}>
                        <div className="form-check">
                            <label className="form-check-label d-flex align-items-center gap-1">
                                <input
                                    className="form-check-input"
                                    checked={filterIsActive}
                                    onChange={(event) => {
                                        this.handlePredefinedFiltersChange(event, item.name)
                                    }}
                                    type="checkbox"
                                    name={id}
                                />
                                {item.name}
                            </label>
                        </div>
                    </div>
                );
            });

            return (<div className="js-predefined-filters">{predefinedFiltersTab}</div>);
        };

        /**
         * Builds the WHERE field
         */
        const buildWhereClauseField = () => {
            const handleChange = (event) => {
                let parsedValue = [event.target.value];
                this.setState({"editorFilters": parsedValue});
                this.props.onChangeEditor({
                    layerKey: (this.props.layer.f_table_schema + `.` + this.props.layer.f_table_name),
                    filters: parsedValue || null
                });
            };
            return (
                <div className="where-clause-field" style={{
                    marginTop: "25px",
                    display: this.props.isFilterImmutable ? "none" : "inline"
                }}>
                    <div className="form-check">
                        <input id="filter-editor-switch" className="form-check-input" type="checkbox"
                               checked={this.state.editorFiltersActive}
                               onChange={this.activateEditor.bind(this)}/>
                        <label htmlFor="filter-editor-switch"
                               className="form-check-label d-flex align-items-center gap-1">
                            {__(`Filter editor`)}
                        </label>
                    </div>
                    <div style={!this.state.editorFiltersActive ? {pointerEvents: "none", display: "none"} : {}}>
                        <textarea
                            className="form-control w-100 mb-2"
                            onChange={handleChange}
                            name={`editor_filter_` + (this.props.layer.f_table_schema + `.` + this.props.layer.f_table_name)}
                            value={
                                this.state.editorFilters[0]
                            }
                        />
                        <button style={!this.state.editorFiltersActive ? {
                            pointerEvents: "none",
                            opacity: "0.2"
                        } : {}} type="button" className="btn btn-sm btn-outline-success w-100"
                                onClick={this.applyEditor.bind(this)}>
                            <i className="bi bi-check"></i><span className="d-none d-lg-inline"> {__(`Apply`)}</span>
                        </button>
                    </div>
                </div>
            )
        };

        const buildResetButton = () => {
            return (<button className="btn btn-sm btn-outline-danger" onClick={this.handleReset.bind(this)}>
                <i className="bi bi-reply"></i><span className="d-none d-lg-inline"> {__(`Reset`)}</span></button>)
        };

        const buildFitBoundsButton = () => {
            return (<button className="btn btn-sm btn-outline-secondary set-extent-btn w-100"
                            onClick={this.handleFitBounds.bind(this)}>
                <i className="bi bi-arrows-fullscreen"></i> {__(`Fit bounds to filter`)}</button>)
        };

        let activeFiltersTab;
        let tabControl = false;
        if (Object.keys(this.state.predefinedFilters).length > 0) {
            tabControl = (<div>
                <div className="btn-group w-100" role="group">
                    <input type="radio" id="predefined-filter-tab" name="sdsd" className="btn-check"
                           checked={this.state.activeTab === PREDEFINED_TAB}
                           onChange={this.switchActiveTab.bind(this)}/>
                    <label className="btn btn-outline-secondary btn-sm" htmlFor="predefined-filter-tab">
                        {__(`Predefined`)}
                    </label>
                    <input type="radio" id="arbitrary-filter-tab" name="sdsd" className="btn-check"
                           checked={this.state.activeTab === ARBITRARY_TAB}
                           onChange={this.switchActiveTab.bind(this)}/>
                    <label className="btn btn-outline-secondary btn-sm" htmlFor="arbitrary-filter-tab">
                        {__(`Arbitrary`)}
                    </label>
                </div>
            </div>);

            if (this.state.activeTab === PREDEFINED_TAB) {
                activeFiltersTab = buildPredefinedTab();
            } else {
                activeFiltersTab = buildArbitraryTab();
            }
        } else {
            activeFiltersTab = buildArbitraryTab();
        }
        let html, jsx;
        let filterHtmlTemplate = this.props.layerMeta?.filter_html_template;
        if (filterHtmlTemplate) {
            const dict = {filters: this.state.editorFilters[0]};
            html = mustache.render(filterHtmlTemplate, dict);
            if (html) {
                jsx = ( <div dangerouslySetInnerHTML={{__html: html}}></div>)
            }
        }

        return (
            <div className="d-flex flex-column gap-1">
                {tabControl}
                {activeFiltersTab}
                {buildFitBoundsButton()}
                <div className="filter-functions">
                    {buildWhereClauseField()}
                </div>
                {jsx}
            </div>
        );
    }
}

VectorLayerFilter.propTypes = {
    layer: PropTypes.object.isRequired,
    layerMeta: PropTypes.any.isRequired,
    presetFilters: PropTypes.array,
    predefinedFilters: PropTypes.object.isRequired,
    disabledPredefinedFilters: PropTypes.array.isRequired,
    arbitraryFilters: PropTypes.object.isRequired,
    onApplyPredefined: PropTypes.func.isRequired,
    onApplyArbitrary: PropTypes.func.isRequired,
    onDisableArbitrary: PropTypes.func.isRequired,
    onApplyFitBounds: PropTypes.func.isRequired,
    onChangeEditor: PropTypes.func.isRequired,
    onActivateEditor: PropTypes.func.isRequired,
    onApplyEditor: PropTypes.func.isRequired,
    editorFilters: PropTypes.array.isRequired,
    editorFiltersActive: PropTypes.bool.isRequired,
    isFilterImmutable: PropTypes.bool.isRequired,

};

export default VectorLayerFilter;

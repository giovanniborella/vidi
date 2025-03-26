/*
 * @author     Martin Høgh <mh@mapcentia.com>
 * @copyright  2013-2023 MapCentia ApS
 * @license    http://www.gnu.org/licenses/#AGPL  GNU AFFERO GENERAL PUBLIC LICENSE 3
 */

'use strict';

/**
 *
 * @returns {*}
 */
module.exports = {
    set: function () {
        return this;
    },
    init: function () {
    },
    render: function (e) {
        let table = $("#report table"), tr, dataTable, dataThead, dataTr, u, m, without = [], withErrors = [],
            groups = [];

        Object.keys(e.hits).forEach(function (key) {
            let v = e.hits[key];
            if (v.hits === 0 && !v.error) {
                without.push(v.title || key);
            }
            if (v.error) {
                withErrors.push(v.title || key);
            }
            v.meta.layergroup = v.meta.layergroup != null ? v.meta.layergroup : "Ungrouped";
            groups.push(v.meta.layergroup);
        });

        if (withErrors.length > 0) {
            const alertEl = document.getElementById('with-errors')
            alertEl.classList.remove('d-none');
            alertEl.querySelector('div').innerHTML = "<b>Følgende lag gav fejl</b> " + withErrors.join(' | ');
        }

        document.querySelector("#conflict-text").innerHTML = e.text;

        groups = array_unique(groups.reverse());

        for (let x = 0; x < groups.length; ++x) {
            tr = $("<tr class='print-report-group-heading' style='border-top: 1px solid; '><td style='padding-bottom: 4px;'><h3>" + groups[x] + "</h3></td></tr>");
            table.append(tr);
            let count = 0;
            e.hits.forEach((v, i) => {
                let metaData = v.meta;
                if (metaData.layergroup === groups[x]) {
                    let flag = false;
                    let columnTitleForSingleField;
                    let arr = [];
                    if (v.hits > 0) {
                        count++;
                        tr = $("<tr style='border-top: 1px solid #eee;'><td style='padding-bottom: 4px'><h4 style='margin-bottom: 4px'>" + (v.title || i) + " (" + v.hits + ")</h4></td></tr>");
                        table.append(tr);

                        let conflictForLayer = metaData.meta !== null ? JSON.parse(metaData.meta) : null;
                        if (conflictForLayer !== null && 'long_conflict_meta_desc' in conflictForLayer && conflictForLayer.long_conflict_meta_desc !== '') {
                            tr = $("<tr><td><div style='background-color: #eee; padding: 3px; margin-bottom: 4px'>" + conflictForLayer.long_conflict_meta_desc + "</div></td></tr>");
                            table.append(tr);
                        }

                        if (v.data.length > 0) {
                            dataTable = $("<table class='table table-conflict'></table>");

                            if (v.data[0].length > 2) {
                                dataThead = $("<thead></thead>");
                                dataTr = $("<tr></tr>");
                                dataThead.append(dataTr);
                                dataTable.append(dataThead);
                                for (u = 0; u < v.data[0].length; u++) {
                                    if (!v.data[0][u].key) {
                                        dataTr.append("<th>" + v.data[0][u].alias + "</th>");
                                    }
                                }
                            }

                            for (u = 0; u < v.data.length; u++) {
                                const properties = {};
                                v.data[u].forEach(r => properties[r.name] = r.value);
                                dataTr = $("<tr></tr>");
                                if (v.data[u].length > 2) {
                                    flag = false;
                                    for (m = 0; m < v.data[u].length; m++) {
                                        let absorbingCellClass = "";
                                        if (m === v.data[u].length - 1) {
                                            absorbingCellClass = ""
                                            //absorbingCellClass = "style='width: 100%'"
                                        }
                                        let value = v.data[u][m].value;
                                        if (v.data[u][m].template) {
                                            const fieldTmpl = v.data[u][m].template;
                                            value = Handlebars.compile(fieldTmpl)(properties);
                                        }
                                        if (!v.data[u][m].key) {
                                            if (!v.data[u][m].link) {
                                                dataTr.append("<td " + absorbingCellClass + ">" + (value !== null ? value : "&nbsp;") + "</td>");
                                            } else {
                                                let link = "&nbsp;";
                                                if (value && value !== "") {
                                                    link = "<a target='_blank' rel='noopener' href='" + (v.data[u][m].linkprefix ? v.data[u][m].linkprefix : "") + value + "'>Link</a>";
                                                }
                                                dataTr.append("<td " + absorbingCellClass + ">" + link + "</td>");
                                            }
                                        }
                                        dataTable.append(dataTr);
                                    }
                                } else {
                                    flag = true;
                                    for (m = 0; m < v.data[u].length; m++) {
                                        columnTitleForSingleField = v.data[u][m].alias;
                                        if (!v.data[u][m].key) {
                                            let value = v.data[u][m].value;
                                            if (v.data[u][m].template) {
                                                const fieldTmpl = v.data[u][m].template;
                                                value = Handlebars.compile(fieldTmpl)(properties);
                                            }
                                            if (!v.data[u][m].link) {
                                                arr.push(value);
                                            } else {
                                                let link = "&nbsp;";
                                                if (value && value !== "") {
                                                    link = "<a target='_blank' rel='noopener' href='" + (v.data[u][m].linkprefix ? v.data[u][m].linkprefix : "") + value + "'>Link</a>";
                                                }
                                                arr.push(link);
                                            }
                                        }
                                    }
                                    dataTable.append(dataTr);
                                }
                            }
                            if (flag) {
                                let separator = "&nbsp;&nbsp;&nbsp;<span style='color: #eee'>|</span>&nbsp;&nbsp;&nbsp;";
                                dataTr.append("<td style='white-space: normal'><span style='font-weight: 400'>" + columnTitleForSingleField + "</span> " + separator + arr.join(separator) + "</td>");
                            }
                            $('td', tr).append(dataTable);
                        } else {
                            $('td', tr).append("<td><i style='padding-bottom: 40px'>Ingen felter vises</i></td>");

                        }
                    }
                }
            });
            // Remove empty groups
            if (count === 0) {
                table.find("tr.print-report-group-heading").last().remove();
            }
        }

        if (without.length > 0) {
            let e = $("#report #without");
            e.append("<caption style='white-space: nowrap;'>Lag uden forekomster i denne søgning</caption>");
            e.append("<div>" + without.join(" | ") + "</div>");
        }
    }
};

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
        let table = $("#report table"), tr, dataTable, without = [], withErrors = [], groups = [];

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
                            dataTable = $("<table class='table table-data'></table>");
                            v.data.forEach(row => {
                                const properties = {};
                                row.forEach(r => properties[r.name] = r.value);
                                let key = null, fid = null;
                                let tr = $("<tr style='border-top: 0 solid #eee'/>");
                                let td = $("<td/>");
                                let table2 = $("<table style='margin-bottom: 5px; margin-top: 5px;' class='table'/>");
                                row.sort((a, b) => (a.sort_id > b.sort_id) ? 1 : ((b.sort_id > a.sort_id) ? -1 : 0));
                                row.forEach(field => {
                                    let value = field.value;
                                    if (!field.key) {
                                        if (field.template) {
                                            const fieldTmpl = field.template;
                                            value = Handlebars.compile(fieldTmpl)(properties);
                                        }
                                        if (!field.link) {
                                            table2.append("<tr><td style='max-width: 150px' class='conflict-heading-cell' '>" + field.alias + "</td><td class='conflict-value-cell'>" + (value !== null ? value : "&nbsp;") + "</td></tr>");
                                        } else {
                                            let link = "&nbsp;";
                                            if (value && field !== "") {
                                                link = "<a target='_blank' rel='noopener' href='" + (field.linkprefix ? field.linkprefix : "") + value + "'>Link</a>"
                                            }
                                            table2.append("<tr><td style='max-width: 150px' class='conflict-heading-cell'>" + field.alias + "</td><td class='conflict-value-cell'>" + link + "</td></tr>")
                                        }
                                    } else {
                                        key = field.name;
                                        fid = value;
                                    }
                                });
                                td.append(table2);
                                tr.append(td);
                                dataTable.append(tr);
                                dataTable.append("<hr style='margin: 0'/>");
                            });
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

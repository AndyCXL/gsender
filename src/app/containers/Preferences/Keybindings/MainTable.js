/*
 *     This file is part of gSender.
 *
 *     gSender is free software: you can redistribute it and/or modify
 *     it under the terms of the GNU General Public License as published by
 *     the Free Software Foundation, either version 3 of the License, or
 *     (at your option) any later version.
 *
 *     gSender is distributed in the hope that it will be useful,
 *     but WITHOUT ANY WARRANTY; without even the implied warranty of
 *     MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *     GNU General Public License for more details.
 *
 *     You should have received a copy of the GNU General Public License
 *     along with gSender.  If not, see <https://www.gnu.org/licenses/>.
 */

import React, { Component } from 'react';
import PropTypes from 'prop-types';

import Table from 'app/components/Table';

import { formatShortcut } from './helpers';

/**
 * Keybindings Table Component
 * @param {Function} onEdit Function to handle keybinding item edit
 * @param {Array} data List of eybind objects
 */
export default class MainTable extends Component {
    static propTypes = {
        onEdit: PropTypes.func,
        data: PropTypes.array,
    }

    renders = {
        renderShortcutCell: (_, row) => {
            const { keys } = row;
            const shortcut = keys.split('+');

            let cleanedShortcut = null;

            //If there is an empty value as the last element in the shorcut array,
            //that means a plus key is supposed to be there, but it was filtered out
            //due to keys.split
            if (shortcut[shortcut.length - 1] === '') {
                cleanedShortcut = shortcut.filter(item => item !== '');
                cleanedShortcut.push('+');
            }

            const output = cleanedShortcut ? formatShortcut(cleanedShortcut) : formatShortcut(shortcut);

            return output;
        },
        renderActionCell: (_, row) => {
            return (
                <i
                    role="button"
                    tabIndex={-1}
                    className="fas fa-edit"
                    onClick={() => this.props.onEdit(row)}
                    onKeyDown={() => this.props.onEdit(row)}
                />
            );
        }
    }

    columns = [
        { dataIndex: 'title', title: 'Action', sortable: true, key: 'title', width: '45%' },
        { dataIndex: 'keys', title: 'Shortcut', sortable: true, key: 'keys', width: '45%', render: this.renders.renderShortcutCell },
        { key: 'edit', title: 'Edit', render: this.renders.renderActionCell, width: '10%' },
    ];

    render() {
        const columns = this.columns;
        const { data } = this.props;

        return (
            <Table
                bordered
                rowKey="id"
                columns={columns}
                data={data}
            />
        );
    }
}

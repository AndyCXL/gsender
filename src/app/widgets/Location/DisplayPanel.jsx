/*
 * Copyright (C) 2021 Sienci Labs Inc.
 *
 * This file is part of gSender.
 *
 * gSender is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, under version 3 of the License.
 *
 * gSender is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with gSender.  If not, see <https://www.gnu.org/licenses/>.
 *
 * Contact for information regarding this program and its license
 * can be sent through gSender@sienci.com or mailed to the main office
 * of Sienci Labs Inc. in Waterloo, Ontario, Canada.
 *
 */

/* eslint-disable dot-notation */
/* eslint-disable jsx-a11y/heading-has-content */

import ensureArray from 'ensure-array';
import includes from 'lodash/includes';
import MachinePositionInput from 'app/widgets/Location/components/MachinePositionInput';
import { connect } from 'react-redux';
import _isEqual from 'lodash/isEqual';
import get from 'lodash/get';
import PropTypes from 'prop-types';
import React, { PureComponent } from 'react';
import controller from 'app/lib/controller';
import store from 'app/store';
import Panel from './components/Panel';
import PositionLabel from './components/PositionLabel';
import GoToButton from './components/GoToButton';

import {
    AXIS_E,
    AXIS_X,
    AXIS_Y,
    AXIS_Z,
    AXIS_A,
    AXIS_B,
    AXIS_C,
    IMPERIAL_UNITS,
    METRIC_UNITS,
    GRBL_ACTIVE_STATE_IDLE,
    WORKFLOW_STATE_RUNNING,
    GRBL_ACTIVE_STATE_ALARM
} from '../../constants';
import styles from './index.styl';
import AxisButton from './components/AxisButton';
import FunctionButton from '../../components/FunctionButton/FunctionButton';
import QuickPositionButton from './components/QuickPositionButton';

class DisplayPanel extends PureComponent {
    static propTypes = {
        canClick: PropTypes.bool,
        units: PropTypes.oneOf([IMPERIAL_UNITS, METRIC_UNITS]),
        axes: PropTypes.array,
        machinePosition: PropTypes.object,
        workPosition: PropTypes.object,
        jog: PropTypes.object,
        actions: PropTypes.object,
        safeRetractHeight: PropTypes.number,
    };

    controllerEvents = {
        'controller:state': (data, controllerState) => {
            let controllersAlarmState = this.state.controllersAlarmState;
            let hardStopAlarm = controllerState.status.alarmCode;
            this.setState(prevState => ({
                controllersAlarmState: hardStopAlarm
            }));
            if (controllersAlarmState === '1') {
                controller.command('gcode:stop', { force: true });
            }
        },
        'controller:settings': (type, controllerSettings) => {
            this.setState(state => ({
                ...state.controller,
                homePosition: controllerSettings.settings.$23
            }));
        },
    }


    componentWillUnmount() {
        this.removeControllerEvents();
    }

    addControllerEvents() {
        Object.keys(this.controllerEvents).forEach(eventName => {
            const callback = this.controllerEvents[eventName];
            controller.addListener(eventName, callback);
        });
    }

    removeControllerEvents() {
        Object.keys(this.controllerEvents).forEach(eventName => {
            const callback = this.controllerEvents[eventName];
            controller.removeListener(eventName, callback);
        });
    }

    state = {
        homingHasBeenRun: false,
        controllerAlarmState: null,
        positionInput: {
            [AXIS_E]: false,
            [AXIS_X]: false,
            [AXIS_Y]: false,
            [AXIS_Z]: false,
            [AXIS_A]: false,
            [AXIS_B]: false,
            [AXIS_C]: false
        },
        machineProfile: store.get('workspace.machineProfile')
    };

    handleSelect = (eventKey) => {
        const commands = ensureArray(eventKey);
        commands.forEach(command => controller.command('gcode', command));
    };

    showPositionInput = (axis) => () => {
        this.setState(state => ({
            positionInput: {
                ...state.positionInput,
                [axis]: true
            }
        }));
    };

    hidePositionInput = (axis) => () => {
        this.setState(state => ({
            positionInput: {
                ...state.positionInput,
                [axis]: false
            }
        }));
    };

    renderAxis = (axis) => {
        const { canClick, machinePosition, workPosition, actions } = this.props;
        const mpos = machinePosition[axis] || '0.000';
        const wpos = workPosition[axis] || '0.000';
        const axisLabel = axis.toUpperCase();
        const showPositionInput = canClick && this.state.positionInput[axis];

        //Function to zero out given axis
        const handleAxisButtonClick = () => {
            const wcs = actions.getWorkCoordinateSystem();

            const p = {
                'G54': 1,
                'G55': 2,
                'G56': 3,
                'G57': 4,
                'G58': 5,
                'G59': 6
            }[wcs] || 0;

            controller.command('gcode', `G10 L20 P${p} ${axisLabel}0`);
        };
        return (
            <tr>
                <td className={styles.coordinate}>
                    <GoToButton
                        disabled={!canClick}
                        onClick={() => {
                            controller.command('gcode', 'G90');
                            controller.command('gcode', `G0 ${axisLabel}0`); //Move to Work Position Zero
                        }}
                    />
                    <AxisButton axis={axisLabel} onClick={handleAxisButtonClick} disabled={!canClick} />
                </td>
                <td className={styles.machinePosition}>
                    <MachinePositionInput value={wpos} handleManualMovement={(value) => actions.handleManualMovement(value, axis)} />
                    {!showPositionInput && <PositionLabel value={mpos} small />}
                </td>
            </tr>
        );
    };

    /**
     * Function to listen for store changes and re-render accordingly
     */
    updateMachineProfileFromStore = () => {
        const machineProfile = store.get('workspace.machineProfile');

        if (!machineProfile || _isEqual(machineProfile, this.state.machineProfile)) {
            return;
        }

        this.setState({ machineProfile });
    };

    componentDidMount() {
        store.on('change', this.updateMachineProfileFromStore);
        this.addControllerEvents();
    }

    actions = {
        jogtoFRCorner: () => {
            const xLimit = this.state.machineProfile.limits.xmax;
            const yLimit = this.state.machineProfile.limits.ymax;
            const zLimit = this.state.machineProfile.limits.zmax;
            controller.command('gcode', `G0 Z${zLimit} F10000`); // Move z out of the way
            controller.command('gcode', `G53 G0 X${xLimit} Y${yLimit} F5000`);
        },
        jogtoFLCorner: () => {
            const xLimit = this.state.machineProfile.limits.xmax;
            const yLimit = this.state.machineProfile.limits.ymax;
            const zLimit = this.state.machineProfile.limits.zmax;
            controller.command('gcode', `G0 Z${zLimit} F10000`); // Move z out of the way
            controller.command('gcode', `G53 G0 X${-xLimit} Y${yLimit} F5000`);
        },
        jogtoBRCorner: () => {
            const xLimit = this.state.machineProfile.limits.xmax;
            const yLimit = this.state.machineProfile.limits.ymax;
            const zLimit = this.state.machineProfile.limits.zmax;
            controller.command('gcode', `G0 Z${zLimit} F10000`); // Move z out of the way
            controller.command('gcode', `G53 G0 X${xLimit} Y${-yLimit} F5000`);
        },
        jogtoBLCorner: () => {
            const xLimit = this.state.machineProfile.limits.xmax;
            const yLimit = this.state.machineProfile.limits.ymax;
            const zLimit = this.state.machineProfile.limits.zmax;
            controller.command('gcode', `G0 Z${zLimit} F10000`); // Move z out of the way
            controller.command('gcode', `G53 G0 X${-xLimit} Y${-yLimit} F5000`);
        },
        startHoming: () => {
            controller.command('homing');
        }
    }

    render() {
        const { axes, actions, canClick, safeRetractHeight, units, homingEnabled, canHome } = this.props;
        let { homingHasBeenRun } = this.state;
        let houseIconPos = this.state.houseIconPos;
        const hasAxisX = includes(axes, AXIS_X);
        const hasAxisY = includes(axes, AXIS_Y);
        const hasAxisZ = includes(axes, AXIS_Z);

        return (
            <Panel className={styles.displayPanel}>
                <div className={styles.locationWrapper}>
                    <table className={styles.displaypanelTable}>
                        <tbody>
                            {hasAxisX && this.renderAxis(AXIS_X)}
                            {hasAxisY && this.renderAxis(AXIS_Y)}
                            {hasAxisZ && this.renderAxis(AXIS_Z)}
                        </tbody>
                    </table>
                    <div className={styles.controlButtons}>
                        <FunctionButton
                            onClick={() => {
                                const wcs = actions.getWorkCoordinateSystem();
                                const p = {
                                    'G54': 1,
                                    'G55': 2,
                                    'G56': 3,
                                    'G57': 4,
                                    'G58': 5,
                                    'G59': 6
                                }[wcs] || 0;

                                controller.command('gcode', `G10 L20 P${p} X0 Y0 Z0`);
                            }}
                            disabled={!canClick}
                        >
                            <i className="fas fa-bullseye" />
                            Zero All
                        </FunctionButton>
                        <FunctionButton
                            onClick={() => {
                                const modal = (units === METRIC_UNITS) ? 'G21' : 'G20';
                                if (safeRetractHeight !== 0) {
                                    controller.command('gcode', 'G91');
                                    controller.command('gcode:safe', `G0 Z${safeRetractHeight}`, modal); // Retract Z when moving across workspace
                                }

                                controller.command('gcode', 'G90');
                                controller.command('gcode', 'G0 X0 Y0'); //Move to Work Position Zero
                                controller.command('gcode', 'G0 Z0'); // Move Z up
                            }}
                            disabled={!canClick}
                            className={styles.fontMonospace}
                            primary
                        >
                            <i className="fas fa-chart-line" />
                            Go XYZ0
                        </FunctionButton>
                    </div>

                    {
                        homingEnabled && (
                            <div className={styles.endStopActiveControls}>
                                <FunctionButton
                                    primary
                                    disabled={!canHome}
                                    onClick={this.actions.startHoming}
                                    className={styles.runHomeButton}
                                >
                                    <i className="fas fa-home" /> Home
                                </FunctionButton>
                                <QuickPositionButton
                                    disabled={!canClick || !homingHasBeenRun}
                                    className={styles.QPBL}
                                    onClick={() => {
                                        this.actions.jogtoBLCorner();
                                    }}
                                    icon={(houseIconPos === 'BL') ? 'fa-home' : 'fa-arrow-circle-up'}
                                />
                                <QuickPositionButton
                                    disabled={!canClick || !homingHasBeenRun}
                                    className={styles.QPBR}
                                    rotate={45}
                                    onClick={() => {
                                        this.actions.jogtoBRCorner();
                                    }}
                                    icon={(houseIconPos === 'BR') ? 'fa-home' : 'fa-arrow-circle-up'}
                                />
                                <QuickPositionButton
                                    disabled={!canClick || !homingHasBeenRun}
                                    className={styles.QPFL}
                                    onClick={() => {
                                        this.actions.jogtoFLCorner();
                                    }}
                                    icon={(houseIconPos === 'FL') ? 'fa-home' : 'fa-arrow-circle-up'}
                                />
                                <QuickPositionButton
                                    disabled={!canClick || !homingHasBeenRun}
                                    className={styles.QPFR}
                                    onClick={() => {
                                        this.actions.jogtoFRCorner();
                                    }}
                                    icon={(houseIconPos === 'FR') ? 'fa-home' : 'fa-arrow-circle-up'}
                                />
                            </div>
                        )
                    }
                </div>
            </Panel>
        );
    }
}

export default connect((store) => {
    const homingSetting = get(store, 'controller.settings.settings.$22', '0');
    const homingEnabled = homingSetting === '1';
    const isConnected = get(store, 'connection.isConnected');
    const workflowState = get(store, 'controller.workflow.state');
    const activeState = get(store, 'controller.state.status.activeState');
    const canHome = isConnected && [GRBL_ACTIVE_STATE_IDLE, GRBL_ACTIVE_STATE_ALARM].includes(activeState) && workflowState !== WORKFLOW_STATE_RUNNING;
    return {
        homingEnabled,
        canHome
    };
})(DisplayPanel);

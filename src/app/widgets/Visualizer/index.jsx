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

/* eslint-disable consistent-return */
import classNames from 'classnames';
import ExpressionEvaluator from 'expr-eval';
import includes from 'lodash/includes';
import { connect } from 'react-redux';
import get from 'lodash/get';
import mapValues from 'lodash/mapValues';
import pubsub from 'pubsub-js';
import combokeys from 'app/lib/combokeys';
import store from 'app/store';
import reduxStore from 'app/store/redux';
import PropTypes from 'prop-types';
import React, { PureComponent } from 'react';
import ToggleSwitch from 'app/components/ToggleSwitch';
import { UPDATE_FILE_INFO, UPDATE_FILE_PROCESSING } from 'app/actions/fileInfoActions';
import Anchor from 'app/components/Anchor';
import { Button } from 'app/components/Buttons';
import ModalTemplate from 'app/components/ModalTemplate';
import Modal from 'app/components/Modal';
import Widget from 'app/components/Widget';
import controller from 'app/lib/controller';
import i18n from 'app/lib/i18n';
import log from 'app/lib/log';
import portal from 'app/lib/portal';
import * as WebGL from 'app/lib/three/WebGL';
import { in2mm } from 'app/lib/units';
import { Toaster, TOASTER_LONG, TOASTER_WARNING } from 'app/lib/toaster/ToasterLib';
import EstimateWorker from './Estimate.worker';
import WidgetConfig from '../WidgetConfig';
import WorkflowControl from './WorkflowControl';
import MachineStatusArea from './MachineStatusArea';
import ValidationModal from './ValidationModal';
import WarningModal from './WarningModal';
import Visualizer from './Visualizer';
import Loading from './Loading';
import Rendering from './Rendering';
import WatchDirectory from './WatchDirectory';

import {
    // Units
    METRIC_UNITS,
    // Grbl
    GRBL,
    GRBL_ACTIVE_STATE_RUN,
    // Marlin
    MARLIN,
    // Smoothie
    SMOOTHIE,
    SMOOTHIE_ACTIVE_STATE_RUN,
    // TinyG
    TINYG,
    TINYG_MACHINE_STATE_RUN,
    // Workflow
    WORKFLOW_STATE_RUNNING,
    WORKFLOW_STATE_PAUSED,
    WORKFLOW_STATE_IDLE
} from '../../constants';
import {
    CAMERA_MODE_PAN,
    CAMERA_MODE_ROTATE,
    MODAL_WATCH_DIRECTORY,
    NOTIFICATION_PROGRAM_ERROR,
    NOTIFICATION_M0_PROGRAM_PAUSE,
    NOTIFICATION_M1_PROGRAM_PAUSE,
    NOTIFICATION_M2_PROGRAM_END,
    NOTIFICATION_M30_PROGRAM_END,
    NOTIFICATION_M6_TOOL_CHANGE,
    NOTIFICATION_M109_SET_EXTRUDER_TEMPERATURE,
    NOTIFICATION_M190_SET_HEATED_BED_TEMPERATURE,
    LIGHT_THEME,
    LIGHT_THEME_VALUES,
    DARK_THEME,
    DARK_THEME_VALUES
} from './constants';
import styles from './index.styl';


const translateExpression = (function() {
    const { Parser } = ExpressionEvaluator;
    const reExpressionContext = new RegExp(/\[[^\]]+\]/g);

    return function (gcode, context = controller.context) {
        if (typeof gcode !== 'string') {
            log.error(`Invalid parameter: gcode=${gcode}`);
            return '';
        }

        const lines = gcode.split('\n');

        // The work position (i.e. posx, posy, posz) are not included in the context
        context = {
            ...controller.context,
            ...context
        };

        return lines.map(line => {
            try {
                line = line.replace(reExpressionContext, (match) => {
                    const expr = match.slice(1, -1);
                    return Parser.evaluate(expr, context);
                });
            } catch (e) {
                // Bypass unknown expression
            }

            return line;
        }).join('\n');
    };
}());

const displayWebGLErrorMessage = () => {
    portal(({ onClose }) => (
        <Modal disableOverlay size="xs" onClose={onClose}>
            <Modal.Header>
                <Modal.Title>
                    WebGL Error Message
                </Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <ModalTemplate type="warning">
                    {window.WebGLRenderingContext && (
                        <div>
                        Your graphics card does not seem to support <Anchor href="http://khronos.org/webgl/wiki/Getting_a_WebGL_Implementation">WebGL</Anchor>.
                            <br />
                        Find out how to get it <Anchor href="http://get.webgl.org/">here</Anchor>.
                        </div>
                    )}
                    {!window.WebGLRenderingContext && (
                        <div>
                        Your browser does not seem to support <Anchor href="http://khronos.org/webgl/wiki/Getting_a_WebGL_Implementation">WebGL</Anchor>.
                            <br />
                        Find out how to get it <Anchor href="http://get.webgl.org/">here</Anchor>.
                        </div>
                    )}
                </ModalTemplate>
            </Modal.Body>
            <Modal.Footer>
                <Button
                    onClick={onClose}
                >
                    {i18n._('OK')}
                </Button>
            </Modal.Footer>
        </Modal>
    ));
};

class VisualizerWidget extends PureComponent {
    static propTypes = {
        widgetId: PropTypes.string.isRequired
    };

    config = new WidgetConfig(this.props.widgetId);

    state = this.getInitialState();

    actions = {
        dismissNotification: () => {
            this.setState((state) => ({
                notification: {
                    ...state.notification,
                    type: '',
                    data: ''
                }
            }));
        },
        openModal: (name = '', params = {}) => {
            this.setState((state) => ({
                modal: {
                    name: name,
                    params: params
                }
            }));
        },
        closeModal: () => {
            this.setState((state) => ({
                modal: {
                    name: '',
                    params: {}
                }
            }));
        },
        updateModalParams: (params = {}) => {
            this.setState((state) => ({
                modal: {
                    ...state.modal,
                    params: {
                        ...state.modal.params,
                        ...params
                    }
                }
            }));
        },
        // Load file from watch directory
        loadFile: (file) => {
            this.setState((state) => ({
                gcode: {
                    ...state.gcode,
                    loading: true,
                    rendering: false,
                    ready: false
                }
            }));

            controller.command('watchdir:load', file, (err, data) => {
                if (err) {
                    this.setState((state) => ({
                        gcode: {
                            ...state.gcode,
                            loading: false,
                            rendering: false,
                            ready: false
                        }
                    }));

                    log.error(err);
                    return;
                }

                log.debug(data); // TODO
            });
        },
        uploadFile: (gcode, meta) => {
            const { name, size } = { ...meta };
            // Send toolchange context on file load
            const hooks = store.get('workspace.toolChangeHooks', {});
            const context = {
                toolChangeOption: store.get('workspace.toolChangeOption', 'Ignore'),
                ...hooks
            };

            const { port, filename } = this.state;

            if (filename) {
                this.visualizer.unload();
            }

            reduxStore.dispatch({
                type: UPDATE_FILE_PROCESSING,
                payload: { value: true }
            });

            this.setState((state) => ({
                gcode: {
                    ...state.gcode,
                    loading: true,
                    rendering: false,
                    ready: false
                }
            }));

            // Start file parsing worker
            this.processGCode(gcode, name, size);


            //If we aren't connected to a device, only load the gcode
            //to the visualizer and make no calls to the controller
            if (!port) {
                this.actions.loadGCode(name, gcode, size);

                return;
            }

            controller.command('gcode:load', name, gcode, context, (err, data) => {
                if (err) {
                    this.setState((state) => ({
                        gcode: {
                            ...state.gcode,
                            loading: false,
                            rendering: false,
                            ready: false
                        }
                    }));

                    log.error(err);
                    return;
                }

                log.debug(data);
            });
        },
        loadGCode: (name, vizualization, size) => {
            const capable = {
                view3D: !!this.visualizer
            };

            const updater = (state) => {
                return ({
                    gcode: {
                        ...state.gcode,
                        loading: false,
                        rendering: capable.view3D,
                        ready: !capable.view3D,
                        bbox: {
                            min: {
                                x: 0,
                                y: 0,
                                z: 0
                            },
                            max: {
                                x: 0,
                                y: 0,
                                z: 0
                            }
                        },
                        name: name,
                    }
                });
            };
            const callback = () => {
                // Clear gcode bounding box
                controller.context = {
                    ...controller.context,
                    xmin: 0,
                    xmax: 0,
                    ymin: 0,
                    ymax: 0,
                    zmin: 0,
                    zmax: 0
                };

                if (!capable.view3D) {
                    return;
                }

                setTimeout(() => {
                    this.visualizer.load(name, vizualization, ({ bbox }) => {
                        // Set gcode bounding box
                        controller.context = {
                            ...controller.context,
                            xmin: bbox.min.x,
                            xmax: bbox.max.x,
                            ymin: bbox.min.y,
                            ymax: bbox.max.y,
                            zmin: bbox.min.z,
                            zmax: bbox.max.z
                        };

                        const { port } = this.state;

                        this.setState((state) => ({
                            gcode: {
                                ...state.gcode,
                                loading: false,
                                rendering: false,
                                ready: true,
                                bbox: bbox,
                                loadedBeforeConnection: !port,
                            },
                            filename: name,
                            fileSize: size
                        }));
                    });
                }, 0);
            };

            this.setState(updater, callback);
            this.visualizer.handleSceneRender(vizualization);
        },
        unloadGCode: () => {
            const visualizer = this.visualizer;
            if (visualizer) {
                visualizer.unload();
            }

            // Clear gcode bounding box
            controller.context = {
                ...controller.context,
                xmin: 0,
                xmax: 0,
                ymin: 0,
                ymax: 0,
                zmin: 0,
                zmax: 0
            };

            this.setState((state) => ({
                gcode: {
                    ...state.gcode,
                    loading: false,
                    rendering: false,
                    ready: false,
                    content: '',
                    bbox: {
                        min: {
                            x: 0,
                            y: 0,
                            z: 0
                        },
                        max: {
                            x: 0,
                            y: 0,
                            z: 0
                        }
                    }
                }
            }));
        },
        onRunClick: () => {
            this.actions.handleRun();
        },
        handleRun: () => {
            const { workflow } = this.state;
            console.assert(includes([WORKFLOW_STATE_IDLE, WORKFLOW_STATE_PAUSED], workflow.state));
            this.setState((prev) => ({ invalidGcode: { ...prev.invalidGcode, showModal: false } }));

            if (workflow.state === WORKFLOW_STATE_IDLE) {
                controller.command('gcode:start');
                return;
            }

            if (workflow.state === WORKFLOW_STATE_PAUSED) {
                controller.command('gcode:resume');
                controller.command('gcode:resume');
            }
        },
        handlePause: () => {
            const { workflow } = this.state;
            console.assert(includes([WORKFLOW_STATE_RUNNING], workflow.state));

            controller.command('gcode:pause');
        },
        handleStop: () => {
            const { workflow } = this.state;
            console.assert(includes([WORKFLOW_STATE_PAUSED], workflow.state));

            controller.command('gcode:stop', { force: true });
        },
        handleClose: () => {
            const { workflow } = this.state;
            console.assert(includes([WORKFLOW_STATE_IDLE], workflow.state));

            controller.command('gcode:unload');

            pubsub.publish('gcode:unload'); // Unload the G-code
        },
        setBoundingBox: (bbox) => {
            this.setState((state) => ({
                gcode: {
                    ...state.gcode,
                    bbox: bbox
                }
            }));
        },
        toggle3DView: () => {
            if (!WebGL.isWebGLAvailable() && this.state.disabled) {
                displayWebGLErrorMessage();
                return;
            }

            this.setState((state) => ({
                disabled: !state.disabled
            }));
        },
        toPerspectiveProjection: (projection) => {
            this.setState((state) => ({
                projection: 'perspective'
            }));
        },
        toOrthographicProjection: (projection) => {
            this.setState((state) => ({
                projection: 'orthographic'
            }));
        },
        toggleGCodeFilename: () => {
            this.setState((state) => ({
                gcode: {
                    ...state.gcode,
                    displayName: !state.gcode.displayName
                }
            }));
        },
        toggleLimitsVisibility: () => {
            this.setState((state) => ({
                objects: {
                    ...state.objects,
                    limits: {
                        ...state.objects.limits,
                        visible: !state.objects.limits.visible
                    }
                }
            }));
        },
        toggleCoordinateSystemVisibility: () => {
            this.setState((state) => ({
                objects: {
                    ...state.objects,
                    coordinateSystem: {
                        ...state.objects.coordinateSystem,
                        visible: !state.objects.coordinateSystem.visible
                    }
                }
            }));
        },
        toggleGridLineNumbersVisibility: () => {
            this.setState((state) => ({
                objects: {
                    ...state.objects,
                    gridLineNumbers: {
                        ...state.objects.gridLineNumbers,
                        visible: !state.objects.gridLineNumbers.visible
                    }
                }
            }));
        },
        toggleCuttingToolVisibility: () => {
            this.setState((state) => ({
                objects: {
                    ...state.objects,
                    cuttingTool: {
                        ...state.objects.cuttingTool,
                        visible: !state.objects.cuttingTool.visible
                    }
                }
            }));
        },
        camera: {
            toRotateMode: () => {
                this.setState((state) => ({
                    cameraMode: CAMERA_MODE_ROTATE
                }));
            },
            toPanMode: () => {
                this.setState((state) => ({
                    cameraMode: CAMERA_MODE_PAN
                }));
            },
            zoomFit: () => {
                if (this.visualizer) {
                    this.visualizer.zoomFit();
                }
            },
            zoomIn: () => {
                if (this.visualizer) {
                    this.visualizer.zoomIn();
                }
            },
            zoomOut: () => {
                if (this.visualizer) {
                    this.visualizer.zoomOut();
                }
            },
            panUp: () => {
                if (this.visualizer) {
                    this.visualizer.panUp();
                }
            },
            panDown: () => {
                if (this.visualizer) {
                    this.visualizer.panDown();
                }
            },
            panLeft: () => {
                if (this.visualizer) {
                    this.visualizer.panLeft();
                }
            },
            panRight: () => {
                if (this.visualizer) {
                    this.visualizer.panRight();
                }
            },
            lookAtCenter: () => {
                if (this.visualizer) {
                    this.visualizer.lookAtCenter();
                }
            },
            toTopView: () => {
                this.setState({ cameraPosition: 'top' });
            },
            to3DView: () => {
                this.setState({ cameraPosition: '3d' });
            },
            toFrontView: () => {
                this.setState({ cameraPosition: 'front' });
            },
            toLeftSideView: () => {
                this.setState({ cameraPosition: 'left' });
            },
            toRightSideView: () => {
                this.setState({ cameraPosition: 'right' });
            }
        },
        handleLiteModeToggle: () => {
            const { liteMode, disabled, disabledLite } = this.state;
            const newLiteModeValue = !liteMode;
            const shouldRenderVisualization = newLiteModeValue ? !disabledLite : !disabled;
            this.renderIfNecessary(shouldRenderVisualization);

            this.setState({
                liteMode: newLiteModeValue
            });
        },
        lineWarning: {
            onContinue: () => {
                this.setState(prev => ({ invalidLine: { ...prev.invalidLine, show: false, line: '', } }));
                this.actions.handleRun();
            },
            onIgnoreWarning: () => {
                this.setState(prev => ({
                    invalidLine: {
                        ...prev.invalidLine,
                        show: false,
                        line: ''
                    }
                }));

                store.set('widgets.visualizer.showLineWarnings', false);
                controller.command('settings:updated', { showLineWarnings: false });
                this.actions.handleRun();
            },
            onCancel: () => this.actions.reset(),
        },
        setVisualizerReady: () => {
            this.setState((state) => ({
                gcode: {
                    ...state.gcode,
                    loading: false,
                    rendering: false,
                    ready: true,
                }
            }));
        },
        reset: () => {
            this.actions.handleClose();
            this.setState(this.getInitialState());
            this.actions.unloadGCode();
            pubsub.publish('gcode:fileInfo');
            pubsub.publish('gcode:unload');
            Toaster.pop({
                msg: 'Gcode File Closed',
                icon: 'fa-exclamation'
            });
        }
    };

    controllerEvents = {
        'serialport:open': (options) => {
            const { port } = options;
            const { gcode } = this.state;

            const machineProfile = store.get('workspace.machineProfile');
            const showLineWarnings = store.get('widgets.visualizer.showLineWarnings');

            if (machineProfile) {
                controller.command('machineprofile:load', machineProfile);
            }

            if (showLineWarnings) {
                controller.command('settings:updated', { showLineWarnings });
            }

            //If we uploaded a file before connecting to a machine, load the gcode to the controller
            if (gcode.loadedBeforeConnection) {
                controller.command('gcode:load', this.state.filename, gcode.content, {}, (err, data) => {
                    if (err) {
                        this.setState((state) => ({
                            gcode: {
                                ...state.gcode,
                                loading: false,
                                rendering: false,
                                ready: false
                            }
                        }));

                        log.error(err);
                        return;
                    }

                    log.debug(data); // TODO
                });
            }

            this.setState({ port: port });
        },
        'serialport:close': (options) => {
            this.actions.unloadGCode();

            const initialState = this.getInitialState();
            this.setState((state) => ({ ...initialState }));
        },
        'gcode:load': (name, gcode, context) => {
            gcode = translateExpression(gcode, context); // e.g. xmin,xmax,ymin,ymax,zmin,zmax
            this.actions.loadGCode(name, gcode);
        },
        'gcode:unload': () => {
            this.actions.unloadGCode();
        },
        'sender:status': (data) => {
            const { hold, holdReason, name, size, total, sent, received } = data;
            const notification = {
                type: '',
                data: ''
            };

            if (hold) {
                const { err, data } = { ...holdReason };

                if (err) {
                    notification.type = NOTIFICATION_PROGRAM_ERROR;
                    notification.data = err;
                } else if (data === 'M0') {
                    // M0 Program Pause
                    notification.type = NOTIFICATION_M0_PROGRAM_PAUSE;
                } else if (data === 'M1') {
                    // M1 Program Pause
                    notification.type = NOTIFICATION_M1_PROGRAM_PAUSE;
                } else if (data === 'M2') {
                    // M2 Program End
                    notification.type = NOTIFICATION_M2_PROGRAM_END;
                } else if (data === 'M30') {
                    // M30 Program End
                    notification.type = NOTIFICATION_M30_PROGRAM_END;
                } else if (data === 'M6') {
                    // M6 Tool Change
                    notification.type = NOTIFICATION_M6_TOOL_CHANGE;
                } else if (data === 'M109') {
                    // M109 Set Extruder Temperature
                    notification.type = NOTIFICATION_M109_SET_EXTRUDER_TEMPERATURE;
                } else if (data === 'M190') {
                    // M190 Set Heated Bed Temperature
                    notification.type = NOTIFICATION_M190_SET_HEATED_BED_TEMPERATURE;
                }
            }

            this.setState(state => ({
                total,
                gcode: {
                    ...state.gcode,
                    name,
                    size,
                    total,
                    sent,
                    received
                },
                notification: {
                    ...state.notification,
                    ...notification
                }
            }));
        },
        'workflow:state': (workflowState, data) => {
            if (data) {
                this.setState(state => ({
                    workflow: {
                        ...state.workflow,
                        state: workflowState
                    },
                    invalidLine: {
                        ...state.invalidLine,
                        show: true,
                        line: data.line,
                    }
                }));
            } else {
                this.setState(state => ({
                    workflow: {
                        ...state.workflow,
                        state: workflowState
                    }
                }));
            }
        },
        'controller:settings': (type, controllerSettings) => {
            this.setState(state => ({
                controller: {
                    ...state.controller,
                    type: type,
                    settings: controllerSettings
                }
            }));
        },
        'controller:state': (type, controllerState) => {
            // Grbl
            if (type === GRBL) {
                const { status } = { ...controllerState };
                const { mpos, wpos } = status;
                const $13 = Number(get(controller.settings, 'settings.$13', 0)) || 0;

                this.setState(state => ({
                    controller: {
                        ...state.controller,
                        type: type,
                        state: controllerState
                    },
                    // Machine position are reported in mm ($13=0) or inches ($13=1)
                    machinePosition: mapValues({
                        ...state.machinePosition,
                        ...mpos
                    }, (val) => {
                        return ($13 > 0) ? in2mm(val) : val;
                    }),
                    // Work position are reported in mm ($13=0) or inches ($13=1)
                    workPosition: mapValues({
                        ...state.workPosition,
                        ...wpos
                    }, val => {
                        return ($13 > 0) ? in2mm(val) : val;
                    })
                }));
            }
        }
    };

    pubsubTokens = [];

    onProcessedGcode = ({ data }) => {
        const {
            total,
            invalidGcode,
        } = data;

        if (invalidGcode.size > 0) {
            this.setState(prev => ({ invalidGcode: { ...prev.invalidGcode, list: invalidGcode } }));
            if (this.state.invalidGcode.shouldShow) {
                Toaster.pop({
                    msg: `Found ${invalidGcode.size} line(s) of non-GRBL-supported G-Code in this file.  Your job may not run properly.`,
                    type: TOASTER_WARNING,
                    duration: TOASTER_LONG,
                    icon: 'fa-exclamation-triangle'
                });
            }
        }

        this.setState({ total });

        const reduxPayload = {
            ...data,
            content: this.state.gcode.content
        };

        // Emit events on response with relevant data from processor worker
        reduxStore.dispatch({
            type: UPDATE_FILE_INFO,
            payload: reduxPayload
        });
        //pubsub.publish('gcode:fileInfo', { name, size, total, toolSet, spindleSet, movementSet, estimatedTime });
        //pubsub.publish('gcode:bbox', bbox);
    }

    processGCode = (gcode, name, size) => {
        const comments = ['#', ';', '(', '%']; // We assume an opening parenthesis indicates a header line
        //Clean up lines and remove ones that are comments and headers
        const lines = gcode.split('\n')
            .filter(line => (line.trim().length > 0))
            .filter(line => !comments.some(comment => line.includes(comment)));


        // Set "Loading" state to job info widget and start file VM processor
        const estimateWorker = new EstimateWorker();
        const { feedArray, accelArray } = this.props;

        estimateWorker.onmessage = this.onProcessedGcode;
        estimateWorker.postMessage({
            lines: lines,
            name,
            size,
            feedArray,
            accelArray
        });
    };

    unsubscribe() {
        this.pubsubTokens.forEach((token) => {
            pubsub.unsubscribe(token);
        });
        this.pubsubTokens = [];
    }

    // refs
    widgetContent = null;

    visualizer = null;

    workflowControl = null;

    componentDidMount() {
        this.subscribe();
        this.addControllerEvents();
        this.addShuttleControlEvents();
        this.subscribe();

        if (!WebGL.isWebGLAvailable() && !this.state.disabled) {
            displayWebGLErrorMessage();

            setTimeout(() => {
                this.setState((state) => ({
                    disabled: true
                }));
            }, 0);
        }
    }

    componentWillUnmount() {
        this.unsubscribe();
        this.removeControllerEvents();
        this.removeShuttleControlEvents();
        this.unsubscribe();
    }

    componentDidUpdate(prevProps, prevState) {
        if (this.state.disabled !== prevState.disabled) {
            this.config.set('disabled', this.state.disabled);
        }
        if (this.state.projection !== prevState.projection) {
            this.config.set('projection', this.state.projection);
        }
        if (this.state.cameraMode !== prevState.cameraMode) {
            this.config.set('cameraMode', this.state.cameraMode);
        }
        if (this.state.gcode.displayName !== prevState.gcode.displayName) {
            this.config.set('gcode.displayName', this.state.gcode.displayName);
        }
        if (this.state.objects.limits.visible !== prevState.objects.limits.visible) {
            this.config.set('objects.limits.visible', this.state.objects.limits.visible);
        }
        if (this.state.objects.coordinateSystem.visible !== prevState.objects.coordinateSystem.visible) {
            this.config.set('objects.coordinateSystem.visible', this.state.objects.coordinateSystem.visible);
        }
        if (this.state.objects.gridLineNumbers.visible !== prevState.objects.gridLineNumbers.visible) {
            this.config.set('objects.gridLineNumbers.visible', this.state.objects.gridLineNumbers.visible);
        }
        if (this.state.objects.cuttingTool.visible !== prevState.objects.cuttingTool.visible) {
            this.config.set('objects.cuttingTool.visible', this.state.objects.cuttingTool.visible);
        }
        if (this.state.liteMode !== prevState.liteMode) {
            this.config.set('liteMode', this.state.liteMode);
        }
    }

    getInitialState() {
        return {
            port: controller.port,
            units: store.get('workspace.units', METRIC_UNITS),
            theme: this.config.get('theme'),
            controller: {
                type: controller.type,
                settings: controller.settings,
                state: controller.state
            },
            workflow: {
                state: controller.workflow.state
            },
            notification: {
                type: '',
                data: ''
            },
            modal: {
                name: '',
                params: {}
            },
            machinePosition: { // Machine position
                x: '0.000',
                y: '0.000',
                z: '0.000'
            },
            workPosition: { // Work position
                x: '0.000',
                y: '0.000',
                z: '0.000'
            },
            gcode: {
                displayName: this.config.get('gcode.displayName', true),
                loading: false,
                rendering: false,
                ready: false,
                content: '',
                bbox: {
                    min: {
                        x: 0,
                        y: 0,
                        z: 0
                    },
                    max: {
                        x: 0,
                        y: 0,
                        z: 0
                    }
                },
                // Updates by the "sender:status" event
                name: '',
                size: 0,
                total: 0,
                sent: 0,
                received: 0,
                loadedBeforeConnection: false,
            },
            disabled: this.config.get('disabled', false),
            disabledLite: this.config.get('disabledLite'),
            liteMode: this.config.get('liteMode'),
            projection: this.config.get('projection', 'orthographic'),
            objects: {
                limits: {
                    visible: this.config.get('objects.limits.visible', true)
                },
                coordinateSystem: {
                    visible: this.config.get('objects.coordinateSystem.visible', true)
                },
                gridLineNumbers: {
                    visible: this.config.get('objects.gridLineNumbers.visible', true)
                },
                cuttingTool: {
                    visible: this.config.get('objects.cuttingTool.visible', true),
                    visibleLite: this.config.get('objects.cuttingTool.visibleLite', true)
                },
                cuttingToolAnimation: {
                    visible: this.config.get('objects.cuttingToolAnimation.visible', true),
                    visibleLite: this.config.get('objects.cuttingToolAnimation.visibleLite', true)
                },
                cutPath: {
                    visible: this.config.get('objects.cutPath.visible', true),
                    visibleLite: this.config.get('objects.cutPath.visibleLite', true)
                }
            },
            cameraMode: this.config.get('cameraMode', CAMERA_MODE_PAN),
            cameraPosition: '3d', // 'top', '3d', 'front', 'left', 'right'
            isAgitated: false, // Defaults to false
            currentTheme: this.getVisualizerTheme(),
            currentTab: 0,
            filename: '',
            fileSize: 0, //in bytes
            total: 0,
            invalidGcode: {
                shouldShow: this.config.get('showWarning'),
                showModal: false,
                list: new Set([]),
            },
            invalidLine: {
                shouldShow: this.config.get('showLineWarnings'),
                show: false,
                line: '',
            },
            layoutIsReversed: store.get('workspace.reverseWidgets'),
        };
    }

    shuttleControlEvents = {
        LOAD_FILE: () => {
            if (this.workflowControl) {
                this.workflowControl.handleClickUpload();
            }
        },
        UNLOAD_FILE: () => {
            this.actions.closeModal();
            this.actions.unloadGCode();
            this.actions.reset();
        },
        TEST_RUN: () => {
            const gcode = this.state.gcode.content;
            const lines = gcode.split('\n');
            const testLines = ['$C', ...lines, '$C'];
            controller.command('gcode', testLines);
            this.actions.onRunClick();
        },
        START_JOB: () => {
            const { port, workflow } = this.state;
            if (!port) {
                return;
            }

            const canStart = (workflow.state !== WORKFLOW_STATE_RUNNING);

            if (canStart) {
                if (workflow.state === WORKFLOW_STATE_IDLE) {
                    controller.command('gcode:start');
                    return;
                }

                if (workflow.state === WORKFLOW_STATE_PAUSED) {
                    controller.command('gcode:resume');
                    return;
                }
            }
        },
        PAUSE_JOB: () => {
            const { port, workflow } = this.state;
            if (!port) {
                return;
            }

            if (workflow.state === WORKFLOW_STATE_RUNNING) {
                controller.command('gcode:pause');
            }
        },
        STOP_JOB: () => {
            const { port } = this.state;
            if (!port) {
                return;
            }

            controller.command('gcode:stop', { force: true });
        },
        FEEDRATE_OVERRIDE: (_, { amount }) => {
            const feedRate = Number(amount) || 0;
            controller.command('feedOverride', feedRate);
        },
        SPINDLE_OVERRIDE: (_, { amount }) => {
            const spindleSpeed = Number(amount) || 0;
            controller.command('spindleOverride', spindleSpeed);
        },
        VISUALIZER_VIEW: (_, { type }) => {
            const {
                to3DView,
                toTopView,
                toFrontView,
                toRightSideView,
                toLeftSideView,
            } = this.actions.camera;

            const changeCamera = {
                isometirc: to3DView,
                top: toTopView,
                front: toFrontView,
                right: toRightSideView,
                left: toLeftSideView,
                default: () => {
                    const { cameraPosition } = this.getInitialState();
                    this.setState({ cameraPosition });
                }
            }[type];

            changeCamera();
        },
        LIGHTWEIGHT_MODE: () => this.actions.handleLiteModeToggle(),
        CUT: () => {
            document.execCommand('cut');
        },
        COPY: () => {
            document.execCommand('copy');
        },
        PASTE: () => {
            document.execCommand('paste');
        },
        UNDO: () => {
            document.execCommand('undo');
        },
        MACRO: (_, { macroID }) => {
            controller.command('macro:run', macroID, controller.context);
        },
        TOGGLE_SHORTCUTS: () => {
            const shortcuts = store.get('commandKeys', []);

            // Ignore shortcut for toggling all other shortcuts to
            // allow them to be turned on and off
            const allDisabled = shortcuts
                .filter(shortcut => shortcut.title !== 'Toggle Shortcuts')
                .every(({ isActive }) => !isActive);
            const keybindingsArr = shortcuts.map(shortcut => (shortcut.title === 'Toggle Shortcuts' ? shortcut : { ...shortcut, isActive: allDisabled }));

            store.set('commandKeys', keybindingsArr);
            pubsub.publish('keybindingsUpdated');
        }
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

    addShuttleControlEvents() {
        combokeys.reload();

        Object.keys(this.shuttleControlEvents).forEach(eventName => {
            const callback = this.shuttleControlEvents[eventName];
            combokeys.on(eventName, callback);
        });
    }

    updateShuttleControlEvents = () => {
        this.removeShuttleControlEvents();
        this.addShuttleControlEvents();
    }

    removeShuttleControlEvents() {
        Object.keys(this.shuttleControlEvents).forEach(eventName => {
            const callback = this.shuttleControlEvents[eventName];
            combokeys.removeListener(eventName, callback);
        });
    }

    getVisualizerTheme() {
        const { theme } = store.get('widgets.visualizer');
        if (theme === LIGHT_THEME) {
            return LIGHT_THEME_VALUES;
        }
        if (theme === DARK_THEME) {
            return DARK_THEME_VALUES;
        }
        return DARK_THEME_VALUES;
    }

    isAgitated() {
        const { workflow, disabled, objects } = this.state;
        const controllerType = this.state.controller.type;
        const controllerState = this.state.controller.state;

        if (workflow.state !== WORKFLOW_STATE_RUNNING) {
            return false;
        }
        // Return false when 3D view is disabled
        if (disabled) {
            return false;
        }
        // Return false when the cutting tool is not visible
        if (!objects.cuttingTool.visible) {
            return false;
        }
        if (!includes([GRBL, MARLIN, SMOOTHIE, TINYG], controllerType)) {
            return false;
        }
        if (controllerType === GRBL) {
            const activeState = get(controllerState, 'status.activeState');
            if (activeState !== GRBL_ACTIVE_STATE_RUN) {
                return false;
            }
        }
        if (controllerType === MARLIN) {
            // Marlin does not have machine state
            return false;
        }
        if (controllerType === SMOOTHIE) {
            const activeState = get(controllerState, 'status.activeState');
            if (activeState !== SMOOTHIE_ACTIVE_STATE_RUN) {
                return false;
            }
        }
        if (controllerType === TINYG) {
            const machineState = get(controllerState, 'sr.machineState');
            if (machineState !== TINYG_MACHINE_STATE_RUN) {
                return false;
            }
        }

        return true;
    }

    setCurrentTab = (id = 0) => this.setState({ currentTab: id });

    subscribe() {
        const tokens = [
            pubsub.subscribe('theme:change', (msg, theme) => {
                this.setState({
                    theme: theme
                }, this.setState({
                    currentTheme: this.getVisualizerTheme()
                }), pubsub.publish('visualizer:redraw'));
            }),
            pubsub.subscribe('visualizer:settings', () => {
                this.setState({
                    disabled: this.config.get('disabled'),
                    disabledLite: this.config.get('disabledLite'),
                    objects: this.config.get('objects')
                });
            }),
            pubsub.subscribe('units:change', (msg, units) => {
                this.setState({
                    units: units
                });
            }),
            pubsub.subscribe('gcode:showWarning', (_, shouldShow) => {
                this.setState({ invalidGcode: { shouldShow, showModal: false, list: [], } });
            }),
            pubsub.subscribe('gcode:showLineWarnings', (_, shouldShow) => {
                this.setState({ invalidLine: { shouldShow, show: false, line: '', } });
            }),
            pubsub.subscribe('keybindingsUpdated', () => {
                this.updateShuttleControlEvents();
            }),
            pubsub.subscribe('gcode:bbox', (msg, bbox) => {
                const { gcode } = this.state;
                this.setState({
                    gcode: {
                        ...gcode,
                        bbox: bbox
                    }
                });
            }),
            pubsub.subscribe('widgets:reverse', (_, layoutIsReversed) => {
                this.setState({ layoutIsReversed });
            }),
            pubsub.subscribe('gcode:surfacing', (_, { gcode, name, size }) => {
                this.actions.uploadFile(gcode, { name, size });
            })
        ];
        this.pubsubTokens = this.pubsubTokens.concat(tokens);
    }

    renderIfNecessary(shouldRender) {
        const hasVisualization = this.visualizer.hasVisualization();
        if (shouldRender && !hasVisualization) {
            this.visualizer.rerenderGCode();
        }
    }

    render() {
        const state = {
            ...this.state,
            isAgitated: this.isAgitated()
        };
        const actions = {
            ...this.actions
        };
        const showLoader = state.gcode.loading || state.gcode.rendering;

        // Handle visualizer render
        const isVisualizerDisabled = (state.liteMode) ? state.disabledLite : state.disabled;

        const capable = {
            view3D: WebGL.isWebGLAvailable() && !isVisualizerDisabled
        };
        // const showDashboard = !capable.view3D && !showLoader;
        const showVisualizer = capable.view3D && !showLoader;
        // const showNotifications = showVisualizer && !!state.notification.type;

        const { liteMode } = this.state;
        return (
            <Widget className={styles.vizWidgetOverride}>
                <Widget.Header className={styles['visualizer-header']}>
                    <Widget.Title>
                        Visualizer
                    </Widget.Title>
                    <Widget.Controls style={{ top: '-4px' }}>
                        <ToggleSwitch
                            label="Lightweight Mode"
                            checked={liteMode}
                            onChange={() => this.actions.handleLiteModeToggle()}
                            className={styles.litetoggle}
                            size="md"
                        />
                    </Widget.Controls>
                </Widget.Header>
                <Widget.Content
                    reference={node => {
                        this.widgetContent = node;
                    }}
                    className={classNames(
                        { [styles.view3D]: capable.view3D },
                        styles['visualizer-component'],
                    )}
                    id="visualizer_container"
                >
                    {state.gcode.loading &&
                    <Loading />
                    }
                    {state.gcode.rendering &&
                    <Rendering />
                    }
                    {state.modal.name === MODAL_WATCH_DIRECTORY && (
                        <WatchDirectory
                            state={state}
                            actions={actions}
                        />
                    )}

                    {WebGL.isWebGLAvailable() && (
                        <div className={styles.visualizerWrapper}>
                            <MachineStatusArea
                                state={state}
                                actions={actions}
                            />
                            <Visualizer
                                show={showVisualizer}
                                cameraPosition={state.cameraPosition}
                                ref={node => {
                                    this.visualizer = node;
                                }}
                                state={state}
                                actions={actions}
                            />

                            <WorkflowControl
                                ref={(node) => {
                                    this.workflowControl = node;
                                }}
                                state={state}
                                actions={actions}
                                invalidGcode={this.state.invalidLine.line}
                            />

                            {
                                state.invalidGcode.shouldShow && state.invalidGcode.showModal && (
                                    <ValidationModal
                                        invalidGcode={state.invalidGcode}
                                        onProceed={this.actions.handleRun}
                                        onCancel={this.actions.reset}
                                    />
                                )
                            }
                            {
                                state.invalidLine.shouldShow && state.invalidLine.show && (
                                    <WarningModal
                                        onContinue={actions.lineWarning.onContinue}
                                        onIgnoreWarning={actions.lineWarning.onIgnoreWarning}
                                        onCancel={actions.lineWarning.onCancel}
                                        invalidLine={state.invalidLine.line}
                                    />
                                )
                            }
                        </div>
                    )}
                </Widget.Content>
            </Widget>
        );
    }
}

export default connect((store) => {
    const settings = get(store, 'controller.settings');
    const xMaxFeed = Number(get(settings.settings, '$110', 1500));
    const yMaxFeed = Number(get(settings.settings, '$111', 1500));
    const zMaxFeed = Number(get(settings.settings, '$112', 1500));
    const xMaxAccel = Number(get(settings.settings, '$120', 1800000));
    const yMaxAccel = Number(get(settings.settings, '$112', 1800000));
    const zMaxAccel = Number(get(settings.settings, '$122', 1800000));

    const feedArray = [xMaxFeed, yMaxFeed, zMaxFeed];
    const accelArray = [xMaxAccel * 3600, yMaxAccel * 3600, zMaxAccel * 3600];
    return {
        feedArray,
        accelArray
    };
})(VisualizerWidget);

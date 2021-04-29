import React from 'react';
import classNames from 'classnames';

import styles from '../index.styl';
import AddProbe from './AddProbe';

import Tools from '../Tools/Tools';

import Fieldset from '../FieldSet';
import Input from '../Input';
import ToggleSwitch from '../../../components/ToggleSwitch';


const ProbeSettings = ({ active, state, actions }) => {
    const { probeSettings, probe, units } = state;
    const { functions } = probe;
    const probeActions = actions.probe;

    const values = {
        length: units === 'mm' ? probe.plateLength.mm : probe.plateLength.in,
        width: units === 'mm' ? probe.plateWidth.mm : probe.plateWidth.in,
        xyThickness: units === 'mm' ? probe.xyThickness.mm : probe.xyThickness.in,
        zThickness: units === 'mm' ? probe.zThickness.mm : probe.zThickness.in,
        fastFeedrate: units === 'mm' ? probeSettings.fastFeedrate.mm : probeSettings.fastFeedrate.in,
        normalFeedrate: units === 'mm' ? probeSettings.normalFeedrate.mm : probeSettings.normalFeedrate.in,
        retractionDistance: units === 'mm' ? probeSettings.retractionDistance.mm : probeSettings.retractionDistance.in,
    };

    return (
        <div className={classNames(
            styles.hidden,
            styles['settings-wrapper'],
            { [styles.visible]: active }
        )}
        >
            <h3 className={styles['settings-title']}>Probe</h3>
            <div className={styles.generalArea}>
                <div style={{ width: '48%' }}>
                    <Fieldset legend="Probing Settings">

                        <Input
                            label="Fast Find"
                            value={values.fastFeedrate}
                            onChange={probeActions.changeFastFeedrate}
                            additionalProps={{ type: 'number', id: 'fastFeedrate' }}
                            units={units}
                        />

                        <Input
                            label="Slow Find"
                            value={values.normalFeedrate}
                            onChange={probeActions.changeNormalFeedrate}
                            additionalProps={{ type: 'number', id: 'normalFeedrate' }}
                            units={units}
                        />

                        <Input
                            label="Retraction"
                            value={values.retractionDistance}
                            onChange={probeActions.changeRetractionDistance}
                            additionalProps={{ type: 'number', id: 'retraction' }}
                            units={units}
                        />

                        <div className={styles.inputSpread}>
                            <label htmlFor="probeConnectivityTest">Probe connectivity test</label>
                            <ToggleSwitch
                                checked={probeSettings.connectivityTest}
                                onChange={probeActions.changeConnectivityTest}
                            />
                        </div>
                    </Fieldset>

                    <Fieldset legend="Touch Plate" className={styles['mb-0']}>
                        <AddProbe actions={actions} state={state} />

                        {
                            (functions.x && functions.y) && (
                                <div>
                                    <Input
                                        label="Length"
                                        value={values.length}
                                        units={units}
                                        onChange={probeActions.changePlateLength}
                                        additionalProps={{ type: 'number', id: 'plateLength' }}
                                    />

                                    <Input
                                        label="Width"
                                        value={values.width}
                                        units={units}
                                        onChange={probeActions.changePlateWidth}
                                        additionalProps={{ type: 'number', id: 'plateWidth' }}
                                    />
                                </div>
                            )
                        }

                    </Fieldset>

                </div>

                <div style={{ width: '48%' }}>
                    <Tools state={state} actions={actions} />
                </div>
            </div>
        </div>
    );
};

export default ProbeSettings;

/* eslint-disable no-restricted-globals */
import PropTypes from 'prop-types';
import React, { PureComponent } from 'react';
import IdleInfo from './components/IdleInfo';
import Overrides from './components/Overrides';
import styles from './index.styl';

/**
 * Job Status component wrapper
 * @param {Object} state Default state given from parent component (main index.js for this widget)
 */
class JobStatus extends PureComponent {
    static propTypes = {
        state: PropTypes.object,
    };

    render() {
        let lastFile = this.props.lastFile;
        const { state } = this.props;
        const { isRunningJob } = state;
        return (
            <div className={styles['job-status-wrapper']}>
                {!isRunningJob
                    ? <IdleInfo state={state} lastFile={lastFile} />
                    : <Overrides state={state} />
                }
            </div>
        );
    }
}

export default JobStatus;

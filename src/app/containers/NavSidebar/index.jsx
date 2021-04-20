import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import NavSidebarLink from './NavSideBarLink';
import styles from './index.styl';
import {
    MODAL_NONE,
    MODAL_PREFERENCES,
    MODAL_FIRMWARE
} from './constants';
import Preferences from '../Preferences/Preferences';
// import WizardModal from '../Wizard/WizardModal';
import Firmware from '../Firmware/Firmware';

class NavSidebar extends PureComponent {
    static propTypes = {
        wizardDisabled: PropTypes.bool
    };

    state = this.getInitialState();

    actions = {
        openModal: (name) => {
            this.setState({
                modal: {
                    name: name,
                    params: {}
                }
            });
        },
        closeModal: () => {
            this.setState({
                modal: {
                    name: MODAL_NONE,
                    params: {}
                }
            });
        }
    }

    getInitialState() {
        return {
            modal: {
                name: MODAL_NONE,
                params: {}
            }
        };
    }

    render() {
        const actions = { ...this.actions };
        const state = { ...this.state };
        return (
            <div className={styles.Sidebar}>
                <NavSidebarLink
                    url="" icon="fab fa-codepen" label="Surfacing"
                    disabled
                />
                <NavSidebarLink
                    url="" icon="fa fa-mountain" label="Heightmap"
                    disabled
                />
                <NavSidebarLink
                    url="" icon="fa fa-ruler" label="Calibrate"
                    disabled
                />
                <NavSidebarLink
                    url=""
                    onClick={() => actions.openModal(MODAL_FIRMWARE)}
                    icon="fa fa-microchip"
                    label="Firmware"
                />
                <NavSidebarLink
                    icon="fa fa-share-square"
                    label=""
                    onClick={() => window.open('https://sienci.com/gsender-documentation/', '_blank')}
                />
                <NavSidebarLink
                    url="" onClick={() => actions.openModal(MODAL_PREFERENCES)} icon="fa fa-cog"
                    label=""
                />
                {
                    state.modal.name === MODAL_FIRMWARE && <Firmware state={state} modalClose={actions.closeModal} />
                }
                {
                    state.modal.name === MODAL_PREFERENCES && <Preferences state={state} modalClose={actions.closeModal} />
                }
            </div>
        );
    }
}

export default NavSidebar;

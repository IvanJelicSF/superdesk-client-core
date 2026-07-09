import React from 'react';
import {IArticle} from 'superdesk-api';
import {Modal, Select, Option, Switch, Button} from 'superdesk-ui-framework/react';
import {Spacer} from 'core/ui/components/Spacer';
import {showModal} from '@sourcefabric/common';
import {gettext} from 'core/utils';
import {notify} from 'core/notify/notify';
import {ITenantRef, getExchangePartners, getTenantLabel, sendToTenant} from 'core/multi-tenancy';

interface IProps {
    closeModal(): void;
    item: IArticle;
}

interface IState {
    partners: Array<ITenantRef> | null; // null while loading
    selectedTenant: string | null;
    autoFetch: boolean;
    sending: boolean;
}

class SendToTenantModal extends React.PureComponent<IProps, IState> {
    constructor(props: IProps) {
        super(props);

        this.state = {
            partners: null,
            selectedTenant: null,
            autoFetch: false,
            sending: false,
        };

        this.send = this.send.bind(this);
    }

    componentDidMount(): void {
        getExchangePartners().then((res) => {
            const partners = res.partners ?? [];

            this.setState({
                partners: partners,
                selectedTenant: partners.length === 1 ? partners[0].tenant : null,
            });
        }, () => {
            notify.error(gettext('Could not load exchange partners'));
            this.props.closeModal();
        });
    }

    private send() {
        const {selectedTenant, autoFetch} = this.state;

        if (selectedTenant == null) {
            return;
        }

        this.setState({sending: true});

        const partner = (this.state.partners ?? []).find(({tenant}) => tenant === selectedTenant);
        const label = partner == null ? selectedTenant : getTenantLabel(partner);

        sendToTenant(this.props.item._id, selectedTenant, {autoFetch: autoFetch})
            .then(() => {
                notify.success(gettext('Sent to {{tenant}}', {tenant: label}));
                this.props.closeModal();
            }, (err) => {
                notify.error(
                    err?._error?.message
                        ?? gettext('Failed to send the item to {{tenant}}', {tenant: label}),
                );
                this.setState({sending: false});
            });
    }

    render(): JSX.Element {
        const state = this.state;

        if (state.partners == null) {
            return null;
        }

        return (
            <Modal
                size="small"
                position="top"
                onHide={this.props.closeModal}
                visible
                headerTemplate={gettext('Send to tenant')}
                data-test-id="send-to-tenant-modal"
            >
                <Spacer v gap="32">
                    <Select
                        value={state.selectedTenant ?? ''}
                        onChange={(value) => {
                            this.setState({selectedTenant: value === '' ? null : value});
                        }}
                        label={gettext('Target tenant')}
                    >
                        <Option value="" />
                        {
                            state.partners.map((partner) => (
                                <Option key={partner.tenant} value={partner.tenant}>
                                    {
                                        getTenantLabel(partner) === partner.tenant
                                            ? partner.tenant
                                            : `${getTenantLabel(partner)} (${partner.tenant})`
                                    }
                                </Option>
                            ))
                        }
                    </Select>
                    <Switch
                        label={{content: gettext('Fetch on the target tenant automatically'), side: 'left'}}
                        value={state.autoFetch}
                        onChange={(value) => this.setState({autoFetch: value})}
                    />
                    <Spacer h gap="8" justifyContent="end" noGrow>
                        <Button
                            onClick={() => this.props.closeModal()}
                            type="default"
                            text={gettext('Cancel')}
                        />
                        <Button
                            onClick={this.send}
                            type="primary"
                            text={gettext('Send')}
                            disabled={state.selectedTenant == null || state.sending}
                        />
                    </Spacer>
                </Spacer>
            </Modal>
        );
    }
}

export function showSendToTenantModal(item: IArticle): void {
    showModal(({closeModal}) => (
        <SendToTenantModal item={item} closeModal={closeModal} />
    ));
}

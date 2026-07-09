import React from 'react';
import {Checkbox, Input, Option, Select} from 'superdesk-ui-framework/react';
import {Spacer} from 'core/ui/components/Spacer';
import {gettext} from 'core/utils';
import {ITenantRef, getExchangePartners, getTenantLabel, multiTenantEnabled} from 'core/multi-tenancy';

export interface IInternalTenantDestinationConfig {
    tenant?: string;
    auto_fetch?: boolean;
    desk?: string;
    stage?: string;
}

interface IProps {
    config: IInternalTenantDestinationConfig | undefined;
    onChange(config: IInternalTenantDestinationConfig): void;
}

interface IState {
    partners: Array<ITenantRef>;
}

/**
 * Destination config form for the `internal_tenant` transmitter type.
 * All fields are consumed server-side; desk/stage are free text because
 * desks of the target tenant are not browsable from this tenant.
 */
export class InternalTenantDestinationConfig extends React.PureComponent<IProps, IState> {
    constructor(props: IProps) {
        super(props);

        this.state = {
            partners: [],
        };
    }

    componentDidMount(): void {
        if (multiTenantEnabled()) {
            getExchangePartners().then((res) => {
                this.setState({partners: res.partners ?? []});
            }, () => {
                // endpoint unavailable — leave the list empty
            });
        }
    }

    private patch(partial: Partial<IInternalTenantDestinationConfig>) {
        this.props.onChange({...(this.props.config ?? {}), ...partial});
    }

    render(): JSX.Element {
        const config = this.props.config ?? {};

        return (
            <Spacer v gap="16">
                <Select
                    label={gettext('Target tenant')}
                    value={config.tenant ?? ''}
                    required
                    onChange={(tenant) => this.patch({tenant})}
                >
                    <Option value="" />
                    {this.state.partners.map((partner) => (
                        <Option key={partner.tenant} value={partner.tenant}>
                            {
                                getTenantLabel(partner) === partner.tenant
                                    ? partner.tenant
                                    : `${getTenantLabel(partner)} (${partner.tenant})`
                            }
                        </Option>
                    ))}
                </Select>
                <Checkbox
                    label={{text: gettext('Fetch on the target desk after ingest')}}
                    checked={config.auto_fetch === true}
                    onChange={(autoFetch) => this.patch({auto_fetch: autoFetch})}
                />
                <Input
                    type="text"
                    label={gettext('Target desk id')}
                    placeholder={gettext('Optional; desks of the target tenant are not browsable')}
                    value={config.desk ?? ''}
                    onChange={(desk) => this.patch({desk})}
                />
                <Input
                    type="text"
                    label={gettext('Target stage id')}
                    placeholder={gettext('Optional')}
                    value={config.stage ?? ''}
                    onChange={(stage) => this.patch({stage})}
                />
            </Spacer>
        );
    }
}

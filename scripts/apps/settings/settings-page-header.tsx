import React from 'react';

export class SettingsPageHeader extends React.PureComponent<{children?: React.ReactNode}> {
    render() {
        return (
            <div className="sd-page__header">
                <span className="sd-page__element-grow" />
                {this.props.children}
            </div>
        );
    }
}

import React from 'react';

export class SettingsPageContent extends React.PureComponent<{children?: React.ReactNode}> {
    render() {
        return (
            <div className="sd-page__content">
                {this.props.children}
            </div>
        );
    }
}

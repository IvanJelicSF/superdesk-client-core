import React from 'react';

export class Center extends React.PureComponent<{children?: React.ReactNode}> {
    render() {
        return (
            <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
                {this.props.children}
            </div>
        );
    }
}

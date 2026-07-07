import React from 'react';

interface IProps {
    children?: React.ReactNode;
    onDidMount?();
    onWillUnmount?(): void;
}

export class MountTracker extends React.Component<IProps> {
    componentDidMount() {
        this.props.onDidMount?.();
    }

    componentWillUnmount() {
        this.props.onWillUnmount?.();
    }

    render() {
        return this.props.children;
    }
}
